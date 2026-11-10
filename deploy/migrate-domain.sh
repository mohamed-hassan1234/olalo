#!/usr/bin/env bash
# Domain migration: https://zakariye.elivateict.com  ->  https://zdu.elivateict.com
# Run on the VPS, from the repository root, as the deploy user (with sudo):
#
#   cd /var/www/zakariye && git pull --ff-only
#   bash deploy/migrate-domain.sh preflight   # read-only checks
#   bash deploy/migrate-domain.sh phase1      # backup, new vhost, certificate, API origins, rebuild web+admin
#   bash deploy/migrate-domain.sh verify      # end-to-end checks on the new domain
#   bash deploy/migrate-domain.sh phase2      # ONLY after phase1 is verified: old hostname -> 301 to new
#   bash deploy/migrate-domain.sh rollback    # restore the pre-migration nginx + api.env and rebuild for the old domain
#
# Never touches MongoDB or any other site's nginx files. Stops on the first failure.
set -euo pipefail

NEW_HOST=zdu.elivateict.com
OLD_HOST=zakariye.elivateict.com
EXPECTED_IP=104.237.2.66
REPO=/var/www/zakariye
SITES_AVAIL=/etc/nginx/sites-available
SITES_EN=/etc/nginx/sites-enabled
API_ENV=/etc/lattice/api.env
BACKUP_ROOT=/var/backups/lattice-domain-migration
LAST_BACKUP_FILE=$BACKUP_ROOT/LAST

say()  { printf '\n==> %s\n' "$*"; }
ok()   { printf '    PASS  %s\n' "$*"; }
bad()  { printf '    FAIL  %s\n' "$*"; }
die()  { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

cd "$REPO" || die "repository not found at $REPO"

resolve() { getent ahostsv4 "$1" | awk '{print $1}' | sort -u | tr '\n' ' '; }

nginx_test_reload() {
  sudo nginx -t || return 1
  sudo systemctl reload nginx
}

# File in sites-enabled that serves a given server_name (empty if none).
site_file_for() { sudo grep -lE "server_name[^;]*\b$1\b" "$SITES_EN"/* 2>/dev/null | head -1 || true; }

api_port() { sudo grep -E '^PORT=' "$API_ENV" | cut -d= -f2; }

backup() {
  local ts dir
  ts=$(date +%Y%m%d-%H%M%S); dir=$BACKUP_ROOT/$ts
  sudo mkdir -p "$dir"
  sudo tar czf "$dir/etc-nginx.tgz" -C / etc/nginx
  sudo cp -a "$API_ENV" "$dir/api.env"
  echo "$dir" | sudo tee "$LAST_BACKUP_FILE" >/dev/null
  sudo chmod -R go-rwx "$BACKUP_ROOT"
  ok "backup written to $dir (etc-nginx.tgz, api.env)"
}

build_frontends() {  # $1 = public origin baked into the static builds
  say "Building public site and admin for $1 (API is not rebuilt; MongoDB untouched)"
  NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_API_URL="$1" npm run build -w @lattice/web
  ADMIN_BASE=/console/ VITE_API_URL="$1" npm run build -w @lattice/admin
  if grep -rqs "$OLD_HOST" apps/web/out apps/admin/dist && [ "$1" = "https://$NEW_HOST" ]; then
    die "build output still references $OLD_HOST"
  fi
  ok "web + admin built for $1"
}

set_env() {  # key value
  if sudo grep -qE "^$1=" "$API_ENV"; then
    sudo sed -i "s#^$1=.*#$1=$2#" "$API_ENV"
  else
    echo "$1=$2" | sudo tee -a "$API_ENV" >/dev/null
  fi
}

cmd_preflight() {
  say "DNS"
  local ips; ips=$(resolve "$NEW_HOST")
  [ "$ips" = "$EXPECTED_IP " ] && ok "$NEW_HOST -> $ips" || die "$NEW_HOST resolves to '$ips' (expected $EXPECTED_IP)"
  if hostname -I | tr ' ' '\n' | grep -qx "$EXPECTED_IP"; then ok "$EXPECTED_IP is bound on this server"
  else echo "    WARN  $EXPECTED_IP is not a local interface address (fine if the provider uses NAT); confirm this is the right VPS"; fi
  say "nginx"
  sudo nginx -t && ok "nginx -t"
  systemctl is-active --quiet nginx && ok "nginx active" || die "nginx not active"
  sudo ss -tlnp | grep -E ':(80|443) ' || die "nothing listening on 80/443"
  say "certbot"
  command -v certbot >/dev/null && ok "certbot $(certbot --version 2>&1 | awk '{print $2}')" || die "certbot not installed"
  say "API"
  curl -fsS "http://127.0.0.1:$(api_port)/v1/health" >/dev/null && ok "API health on 127.0.0.1:$(api_port)" || die "API not healthy"
  say "Existing configuration"
  echo "    old host served by: $(site_file_for "$OLD_HOST" || true)"
  echo "    new host served by: $(site_file_for "$NEW_HOST" || echo none)"
  sudo grep -rn "zone=lattice_api:" /etc/nginx || true
  sudo grep -E '^(PUBLIC_ORIGINS|ADMIN_ORIGIN)=' "$API_ENV"
  git status --short | head
}

cmd_phase1() {
  cmd_preflight
  say "Backup"
  backup
  local bdir; bdir=$(sudo cat "$LAST_BACKUP_FILE")

  say "Rate-limit zone -> conf.d (shared by both site files)"
  local old_file; old_file=$(site_file_for "$OLD_HOST")
  [ -n "$old_file" ] || die "no enabled nginx site serves $OLD_HOST; inspect manually"
  if [ ! -f /etc/nginx/conf.d/lattice-ratelimit.conf ]; then
    sudo cp deploy/nginx/lattice-ratelimit.conf /etc/nginx/conf.d/lattice-ratelimit.conf
    sudo sed -i 's#^\(\s*limit_req_zone .*zone=lattice_api:.*\)$#\# moved to conf.d/lattice-ratelimit.conf: \1#' "$(readlink -f "$old_file")"
  fi

  say "New site $NEW_HOST (HTTP first; certbot adds HTTPS)"
  [ -z "$(site_file_for "$NEW_HOST")" ] || die "$NEW_HOST is already configured in $(site_file_for "$NEW_HOST"); inspect manually"
  sudo cp deploy/nginx/$NEW_HOST.conf "$SITES_AVAIL/$NEW_HOST.conf"
  sudo ln -sf "$SITES_AVAIL/$NEW_HOST.conf" "$SITES_EN/$NEW_HOST.conf"
  if ! nginx_test_reload; then
    echo "nginx -t failed; restoring backup"; sudo rm -f "$SITES_EN/$NEW_HOST.conf" "$SITES_AVAIL/$NEW_HOST.conf" /etc/nginx/conf.d/lattice-ratelimit.conf
    sudo tar xzf "$bdir/etc-nginx.tgz" -C /; sudo nginx -t && sudo systemctl reload nginx; die "phase1 aborted (nginx config)"
  fi
  ok "nginx reloaded with $NEW_HOST on port 80"

  say "TLS certificate for $NEW_HOST"
  sudo certbot --nginx -d "$NEW_HOST" --redirect -n --keep-until-expiring
  nginx_test_reload
  echo | openssl s_client -connect 127.0.0.1:443 -servername "$NEW_HOST" 2>/dev/null | openssl x509 -noout -subject -ext subjectAltName | grep -q "DNS:$NEW_HOST" \
    && ok "certificate for $NEW_HOST is served" || die "served certificate does not cover $NEW_HOST"

  say "API origins (CORS/CSRF)"
  set_env PUBLIC_ORIGINS "https://$NEW_HOST,https://$OLD_HOST"
  set_env ADMIN_ORIGIN "https://$NEW_HOST"
  sudo grep -E '^(PUBLIC_ORIGINS|ADMIN_ORIGIN)=' "$API_ENV"

  build_frontends "https://$NEW_HOST"

  say "Restarting the API only (lattice-api) and reloading nginx"
  sudo systemctl restart lattice-api
  nginx_test_reload
  sleep 3
  cmd_verify
  echo; echo "Phase 1 done. $OLD_HOST still serves its own copy; run 'phase2' after checking https://$NEW_HOST in a browser."
}

cmd_verify() {
  say "End-to-end checks on https://$NEW_HOST"
  local fails=0 code
  for p in / /text/ /profile/ /roadmap/ /console/ /robots.txt; do
    code=$(curl -s -o /dev/null -w '%{http_code}' "https://$NEW_HOST$p")
    [ "$code" = 200 ] && ok "GET $p -> $code" || { bad "GET $p -> $code"; fails=$((fails+1)); }
  done
  for p in /text /profile /roadmap; do
    loc=$(curl -sI "https://$NEW_HOST$p" | awk 'tolower($1)=="location:"{print $2}' | tr -d '\r')
    case "$loc" in ""|*"$NEW_HOST"*|/*) ok "GET $p -> ${loc:-no redirect}";; *) bad "GET $p redirects off-site: $loc"; fails=$((fails+1));; esac
  done
  curl -fsS "https://$NEW_HOST/v1/health" | grep -q ok && ok "GET /v1/health" || { bad "/v1/health"; fails=$((fails+1)); }
  curl -fsS -o /dev/null "https://$NEW_HOST/v1/content" && ok "GET /v1/content" || echo "    NOTE  /v1/content not 200 (check the content route name)"
  code=$(curl -s -o /dev/null -w '%{http_code}' -X OPTIONS -H "Origin: https://$NEW_HOST" -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: content-type' "https://$NEW_HOST/v1/feedback")
  acao=$(curl -s -D - -o /dev/null -X OPTIONS -H "Origin: https://$NEW_HOST" -H 'Access-Control-Request-Method: POST' "https://$NEW_HOST/v1/feedback" | awk 'tolower($1)=="access-control-allow-origin:"{print $2}' | tr -d '\r')
  [ "$acao" = "https://$NEW_HOST" ] && ok "CORS preflight /v1/feedback allows https://$NEW_HOST ($code)" || { bad "CORS preflight /v1/feedback: code=$code allow-origin='$acao'"; fails=$((fails+1)); }
  acao=$(curl -s -D - -o /dev/null -X OPTIONS -H "Origin: https://evil.example" -H 'Access-Control-Request-Method: POST' "https://$NEW_HOST/v1/feedback" | awk 'tolower($1)=="access-control-allow-origin:"{print $2}' | tr -d '\r')
  [ -z "$acao" ] && ok "CORS rejects a foreign origin" || { bad "CORS allows foreign origin: $acao"; fails=$((fails+1)); }
  code=$(curl -s -o /dev/null -w '%{http_code}' "https://$NEW_HOST/admin/v1/auth/me")
  case "$code" in 401|403) ok "admin API requires auth ($code)";; *) bad "admin API unauthenticated -> $code"; fails=$((fails+1));; esac
  # built JS must call the new origin
  js=$(curl -s "https://$NEW_HOST/" | grep -oE '/_next/static/chunks/[^"]+\.js' | sort -u || true)
  hosts=$(for j in $js; do curl -s "https://$NEW_HOST$j"; done | grep -oE 'https://[a-z0-9.-]*elivateict\.com' | sort -u | tr '\n' ' ' || true)
  [ "$hosts" = "https://$NEW_HOST " ] && ok "public JS calls https://$NEW_HOST" || { bad "public JS references: $hosts"; fails=$((fails+1)); }
  echo | openssl s_client -connect "$NEW_HOST:443" -servername "$NEW_HOST" 2>/dev/null | openssl x509 -noout -subject -enddate
  sudo certbot renew --dry-run --cert-name "$NEW_HOST" >/dev/null 2>&1 && ok "certbot renew --dry-run ($NEW_HOST)" || { bad "certbot renew dry-run"; fails=$((fails+1)); }
  systemctl list-timers 2>/dev/null | grep -qi certbot && ok "certbot renewal timer present" || echo "    NOTE  no systemd certbot timer listed (snap installs use snap.certbot.renew.timer)"
  echo; [ "$fails" = 0 ] && echo "ALL CHECKS PASSED" || { echo "$fails CHECK(S) FAILED"; return 1; }
}

cmd_phase2() {
  say "Phase 2: $OLD_HOST -> 301 to https://$NEW_HOST (API routes stay proxied)"
  curl -fsS "https://$NEW_HOST/v1/health" >/dev/null || die "new domain not healthy; finish phase1 first"
  [ -f /etc/nginx/conf.d/lattice-ratelimit.conf ] || die "run phase1 first"
  sudo test -f "/etc/letsencrypt/live/$OLD_HOST/fullchain.pem" || die "no certificate at /etc/letsencrypt/live/$OLD_HOST; adjust deploy/nginx/$OLD_HOST.conf"
  local old_file target; old_file=$(site_file_for "$OLD_HOST"); target=$(readlink -f "$old_file")
  backup
  sudo cp "$target" "$target.pre-redirect"
  sudo cp "deploy/nginx/$OLD_HOST.conf" "$target"
  if ! nginx_test_reload; then
    sudo cp "$target.pre-redirect" "$target"; sudo nginx -t && sudo systemctl reload nginx; die "phase2 aborted; old config restored"
  fi
  loc=$(curl -sI --resolve "$OLD_HOST:443:127.0.0.1" "https://$OLD_HOST/roadmap/?x=1" | awk 'tolower($1)=="location:"{print $2}' | tr -d '\r')
  [ "$loc" = "https://$NEW_HOST/roadmap/?x=1" ] && ok "https://$OLD_HOST/roadmap/?x=1 -> $loc" || bad "unexpected redirect: '$loc'"
  curl -fsS --resolve "$OLD_HOST:443:127.0.0.1" "https://$OLD_HOST/v1/health" | grep -q ok && ok "old host /v1/health still served (not redirected)" || bad "old host API"
  echo "Note: certbot can renew the $OLD_HOST certificate only while DNS for $OLD_HOST points at this server."
}

cmd_rollback() {
  # Default: the FIRST backup of this migration (taken by phase1, before any change). phase2 takes a later one.
  local bdir; bdir=${1:-$(sudo sh -c "ls -d $BACKUP_ROOT/2* 2>/dev/null" | head -1)}
  [ -n "$bdir" ] && sudo test -f "$bdir/etc-nginx.tgz" || die "no backup found (pass the backup directory as an argument)"
  say "Rolling back from $bdir"
  sudo rm -f "$SITES_EN/$NEW_HOST.conf" "$SITES_AVAIL/$NEW_HOST.conf" /etc/nginx/conf.d/lattice-ratelimit.conf
  sudo tar xzf "$bdir/etc-nginx.tgz" -C /
  sudo nginx -t && sudo systemctl reload nginx
  sudo cp -a "$bdir/api.env" "$API_ENV"
  sudo systemctl restart lattice-api
  build_frontends "https://$OLD_HOST"
  ok "rolled back; the $NEW_HOST certificate is left in place (harmless; remove with: sudo certbot delete --cert-name $NEW_HOST)"
}

case "${1:-}" in
  preflight) cmd_preflight ;;
  phase1)    cmd_phase1 ;;
  verify)    cmd_verify ;;
  phase2)    cmd_phase2 ;;
  rollback)  shift; cmd_rollback "${1:-}" ;;
  *) echo "usage: $0 preflight|phase1|verify|phase2|rollback [backup-dir]"; exit 2 ;;
esac
