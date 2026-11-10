#!/usr/bin/env bash
# ======================================================================================================
# Domain migration: https://zakariye.elivateict.com  ->  https://zdu.elivateict.com   (shared-VPS safe)
#
# Run on the VPS from the repository root as the deploy user (sudo is used where needed). Use tmux/screen
# so an SSH drop cannot interrupt a phase:
#
#   cd /var/www/zakariye && git pull --ff-only
#   EXPECT_API_PORT=4310 bash deploy/migrate-domain.sh preflight   # read-only: checks + nginx dry-runs
#   EXPECT_API_PORT=4310 bash deploy/migrate-domain.sh phase1      # new site + certificate + API origins + rebuild
#   bash deploy/migrate-domain.sh verify                           # read-only end-to-end checks of the new domain
#   EXPECT_API_PORT=4310 bash deploy/migrate-domain.sh phase2      # only after verify: old hostname -> 301 to new
#   bash deploy/migrate-domain.sh rollback                         # back to the exact pre-migration state
#   bash deploy/migrate-domain.sh rollback-phase2                  # undo only the redirect
#   bash deploy/migrate-domain.sh render                           # print the nginx configs it would install
#
# Guarantees:
#  * Writes only: <nginx>/sites-available + sites-enabled/zdu.elivateict.com.conf, the old site's own file
#    (phase2 only), /etc/lattice/api.env (PUBLIC_ORIGINS + ADMIN_ORIGIN only), the web/admin build outputs,
#    the ACME webroot, the backup directory. Every other file under /etc/nginx is checksummed before and after.
#  * Each nginx config is first tested with `nginx -t` on a disposable COPY of /etc/nginx ("shadow test"),
#    then for real before every reload. nginx is only reloaded, never restarted. MongoDB is never touched.
#  * certbot runs in --webroot mode, so it never edits an nginx file.
#  * Any failure during phase1/phase2 reverts what that run changed (undo stack) and then proves it.
#  * The API port is read from api.env, must match the live vhost and the listening socket, and is never written.
# ======================================================================================================
set -Eeuo pipefail
umask 022

NEW_HOST=zdu.elivateict.com
OLD_HOST=zakariye.elivateict.com
NEW_ORIGIN=https://$NEW_HOST
OLD_ORIGIN=https://$OLD_HOST
EXPECTED_IP=${EXPECTED_IP:-104.237.2.66}
ZONE=lattice_zdu
API_SERVICE=lattice-api

# Paths and commands. The overrides exist only for the sandbox test (deploy/test/sandbox-test.sh).
REPO=${REPO:-/var/www/zakariye}
NGINX_DIR=${NGINX_DIR:-/etc/nginx}
LE_DIR=${LE_DIR:-/etc/letsencrypt}
API_ENV=${API_ENV:-/etc/lattice/api.env}
BACKUP_ROOT=${BACKUP_ROOT:-/var/backups/lattice-domain-migration}
ACME_ROOT=${ACME_ROOT:-/var/www/letsencrypt-zdu}
API_CONFIG_JS=${API_CONFIG_JS:-$REPO/apps/api/dist/config.js}
SUDO=${SUDO-sudo}
NGINX_BIN=${NGINX_BIN:-nginx}
NODE_BIN=${NODE_BIN:-node}
read -ra NGINX_ARGS <<< "${NGINX_ARGS:-}"
read -ra CURL_X <<< "${TEST_CURL_OPTS:-}"

SITES_AVAIL=$NGINX_DIR/sites-available
SITES_EN=$NGINX_DIR/sites-enabled
NEW_SITE=$SITES_AVAIL/$NEW_HOST.conf
NEW_LINK=$SITES_EN/$NEW_HOST.conf
NEW_CERT=$LE_DIR/live/$NEW_HOST/fullchain.pem
NEW_KEY=$LE_DIR/live/$NEW_HOST/privkey.pem
WEB_OUT=$REPO/apps/web/out
ADMIN_OUT=$REPO/apps/admin/dist
TPL_NEW=$REPO/deploy/nginx/$NEW_HOST.conf
TPL_OLD=$REPO/deploy/nginx/$OLD_HOST.conf
STATE_FILE=$BACKUP_ROOT/state
TMP=$(mktemp -d)
chmod 700 "$TMP"

STEP=startup
UNDO=()            # shell snippets, run newest-first on failure
B=""               # backup directory of this migration (phase1)
RUN_MANIFEST=""    # nginx manifest taken just before this run changed anything
RUN_KEY=""         # PHASE1 / PHASE2 while that phase is changing things
HANDLE_ERRORS=0    # 1 while an unexpected exit must trigger the revert
FAILING=0
LAST_ERR=""

# ---------------------------------------------------------------- output / error handling --------------
say()  { printf '\n==> %s\n' "$*"; }
ok()   { printf '    PASS  %s\n' "$*"; }
warn() { printf '    WARN  %s\n' "$*"; }
bad()  { printf '    FAIL  %s\n' "$*"; }
step() { STEP=$*; say "$*"; }

# The ERR trap only records what failed (it also runs inside $(...) subshells, so it must not act).
trap 'LAST_ERR="line $LINENO: $BASH_COMMAND"' ERR
trap 'on_exit $?' EXIT
trap 'fail "interrupted by a signal"' INT TERM HUP

on_exit() {
  local rc=$1
  if [ "$rc" != 0 ] && [ "$HANDLE_ERRORS" = 1 ] && [ "$FAILING" = 0 ]; then
    fail "unexpected error (exit code $rc) at ${LAST_ERR:-unknown command}"
  fi
  rm -rf "$TMP"
}

# Abort: revert this run's changes (undo stack, newest first), prove the result, explain the next step.
fail() {
  [ "$FAILING" = 1 ] && exit 1
  FAILING=1
  set +e
  printf '\n!! FAILED during: %s\n!! Reason: %s\n' "$STEP" "$1" >&2
  if ((${#UNDO[@]})); then
    printf '!! Reverting the changes this run made (%d step(s))...\n' "${#UNDO[@]}" >&2
    local i
    for ((i = ${#UNDO[@]} - 1; i >= 0; i--)); do
      printf '   undo: %s\n' "${UNDO[i]}" >&2
      eval "${UNDO[i]}" || printf '   !! undo step failed: %s\n' "${UNDO[i]}" >&2
    done
    UNDO=()
    local clean=yes
    if [ -n "$RUN_MANIFEST" ] && [ -f "$RUN_MANIFEST" ]; then
      if diff -q "$RUN_MANIFEST" <(nginx_manifest) >/dev/null; then
        printf '!! Revert verified: every file under %s is byte-identical to before this run.\n' "$NGINX_DIR" >&2
      else
        clean=no
        printf '!! Revert INCOMPLETE, %s differs from before this run:\n' "$NGINX_DIR" >&2
        diff "$RUN_MANIFEST" <(nginx_manifest) | grep '^[<>]' | sed 's/^/     /' >&2
      fi
    fi
    if [ -n "$RUN_KEY" ]; then
      if [ "$clean" = yes ]; then set_state "$RUN_KEY" failed-reverted; else set_state "$RUN_KEY" started; fi
    fi
  else
    printf '!! Nothing had been changed by this run.\n' >&2
  fi
  cat >&2 <<EOF

What to do now:
  * Read the reason above (full log: ${LOG:-the output above}), fix the cause, then re-run the same command.
  * To return to the exact pre-migration state at any time:  bash deploy/migrate-domain.sh rollback
  * Backups: ${B:-none taken by this run}  (etc-nginx.tgz = full copy of /etc/nginx, api.env, web-out, admin-dist)
  * Logs:    sudo tail -n 50 /var/log/nginx/error.log ; sudo journalctl -u $API_SERVICE -n 50 --no-pager
EOF
  rm -rf "$TMP"
  exit 1
}

# ---------------------------------------------------------------- helpers ------------------------------
ng() { $SUDO "$NGINX_BIN" ${NGINX_ARGS[@]+"${NGINX_ARGS[@]}"} "$@"; }
c()  { curl -sS --max-time 20 ${CURL_X[@]+"${CURL_X[@]}"} "$@"; }
sha() { sha256sum | cut -c1-64; }
health_ok() { local r; r=$(curl -fsS -m 5 "$@" 2>/dev/null) || return 1; [[ $r == *'"ok"'* ]]; }

get_state() { { $SUDO sed -n "s/^$1=//p" "$STATE_FILE" 2>/dev/null || true; } | tail -1; }
set_state() { $SUDO mkdir -p "$BACKUP_ROOT"; echo "$1=$2" | $SUDO tee -a "$STATE_FILE" >/dev/null; }

# Checksums of every file and symlink under /etc/nginx (detects ANY change, ours or not).
nginx_manifest() {
  { $SUDO find "$NGINX_DIR" -type f -exec sha256sum {} + ; $SUDO find "$NGINX_DIR" -type l -printf 'link  %p -> %l\n'; } | sort -k2
}
# The same list without the files this script is allowed to change.
unrelated_only() {
  local pats=(-e "  $NEW_SITE" -e "  $NEW_LINK")
  [ -n "$OLD_FILE" ] && pats+=(-e "  $OLD_FILE")
  [ -n "$OLD_LINK" ] && pats+=(-e "  $OLD_LINK")
  grep -vF "${pats[@]}" || true
}

nginx_test() {
  local out
  if ! out=$(ng -t 2>&1); then printf '%s\n' "$out" | sed 's/^/      /'; return 1; fi
  if grep -qiE "conflicting server name \"($NEW_HOST|$OLD_HOST)\"" <<<"$out"; then printf '%s\n' "$out" | sed 's/^/      /'; return 1; fi
  return 0
}
reload_nginx() { nginx_test && $SUDO systemctl reload nginx && sleep 1 && $SUDO systemctl is-active --quiet nginx; }

dump_nginx() { ng -T 2>/dev/null > "$TMP/nginx-T.txt" || true; }
# Config files whose (uncommented) server_name lists exactly host $1, from the `nginx -T` dump.
files_serving() {
  RE="server_name([[:space:]][^;]*)?[[:space:]]${1//./\\.}([[:space:]]|;|$)" awk '
    BEGIN { re = ENVIRON["RE"] }
    /^# configuration file / { f = $4; sub(/:$/, "", f); next }
    $0 ~ /^[[:space:]]*#/ { next }
    $0 ~ re { print f }' "$TMP/nginx-T.txt" | sort -u
}

api_port_from_env() { { $SUDO sed -nE 's/^[[:space:]]*PORT[[:space:]]*=[[:space:]]*["'\'']?([0-9]+)["'\'']?[[:space:]]*$/\1/p' "$API_ENV" || true; } | tail -1; }

wait_api_health() {
  local i
  for i in $(seq 1 30); do health_ok "http://127.0.0.1:$API_PORT/v1/health" && return 0; sleep 1; done
  return 1
}

# Render a template: $1 template, $2 output, then KEY=VALUE substitutions for __KEY__.
render_tpl() {
  local tpl=$1 out=$2 kv; shift 2
  { echo "# Rendered by deploy/migrate-domain.sh from ${tpl#"$REPO"/} ($(git -C "$REPO" rev-parse --short HEAD 2>/dev/null || echo '?')) on $(date -u +%Y-%m-%dT%H:%MZ). Do not edit by hand."
    sed '1,/^$/d' "$tpl"; } > "$out"           # drop the template's header comment block
  for kv in "$@"; do sed -i "s#__${kv%%=*}__#${kv#*=}#g" "$out"; done
  [ "$IPV6" = yes ] || sed -i '/# ipv6$/d' "$out"
  if grep -qE '__[A-Z0-9_]+__' "$out"; then grep -nE '__[A-Z0-9_]+__' "$out" >&2; return 1; fi
}
render_new() {  # $1 output, $2 cert, $3 key, [$4 = http-only]
  render_tpl "$TPL_NEW" "$1" API_PORT="$API_PORT" WEB_ROOT="$WEB_OUT" ADMIN_ROOT="$ADMIN_OUT" ACME_ROOT="$ACME_ROOT" \
    LE_DIR="$LE_DIR" ZONE="$ZONE" SSL_CERT="$2" SSL_KEY="$3" || return 1
  if [ "${4:-}" = http-only ]; then sed -i -e '/^limit_req_zone/d' -e '/^# END-HTTP/,$d' "$1"; fi
}
render_old() { render_tpl "$TPL_OLD" "$1" API_PORT="$API_PORT" ZONE="$ZONE" OLD_CERT="$OLD_CERT" OLD_KEY="$OLD_KEY" LE_DIR="$LE_DIR"; }

# nginx -t on a disposable copy of /etc/nginx with changes applied (the live server is not touched):
#   shadow_test <label> [put:<path-under-nginx-dir>=<file>]...
shadow_test() {
  local label=$1 t out rc=0 op rel src; shift
  t=$($SUDO mktemp -d /tmp/lattice-nginx-shadow.XXXXXX) || return 1
  if ! out=$($SUDO cp -rL "$NGINX_DIR/." "$t/" 2>&1); then
    $SUDO rm -rf "$t"; printf '%s\n' "$out" | sed 's/^/      /'; bad "could not copy $NGINX_DIR for the shadow test ($label)"; return 1
  fi
  local files; files=$($SUDO grep -rlF -- "$NGINX_DIR/" "$t" 2>/dev/null || true)
  for f in $files; do $SUDO sed -i "s#$NGINX_DIR/#$t/#g" "$f" || { $SUDO rm -rf "$t"; return 1; }; done
  for op in "$@"; do
    rel=${op#put:}; src=${rel#*=}; rel=${rel%%=*}
    $SUDO cp "$src" "$t/$rel" || { $SUDO rm -rf "$t"; bad "shadow: cannot place $rel"; return 1; }
  done
  out=$($SUDO "$NGINX_BIN" -t -c "$t/nginx.conf" -p "$t/" 2>&1) || rc=$?
  $SUDO rm -rf "$t"
  if [ $rc -ne 0 ] || grep -qiE '\[emerg\]|conflicting server name' <<<"$out"; then
    printf '%s\n' "$out" | sed "s#$t/#$NGINX_DIR/#g; s/^/      /"
    bad "shadow nginx -t: $label"; return 1
  fi
  ok "shadow nginx -t (on a copy; live server untouched): $label"
}

# HTTP status of every other site on this nginx (requests to 127.0.0.1), to show they are not disturbed.
other_sites_snapshot() {
  local n names dump
  dump=$(ng -T 2>/dev/null || true)
  # every server_name directive, also inside one-line server blocks; comments ignored
  names=$(sed -e 's/#.*//' <<<"$dump" | grep -oE '(^|[;{[:space:]])server_name[[:space:]]+[^;]+' | sed -E 's/.*server_name[[:space:]]+//' \
    | tr ' \t' '\n\n' | grep -vE '^$|^_$|^localhost$|[*~$]' | grep -vxF -e "$NEW_HOST" -e "$OLD_HOST" | sort -u | head -40 || true)
  for n in $names; do
    printf '%s https=%s http=%s\n' "$n" \
      "$(curl -sk -o /dev/null -m 4 -w '%{http_code}' --resolve "$n:443:127.0.0.1" "https://$n/" 2>/dev/null || true)" \
      "$(curl -s -o /dev/null -m 4 -w '%{http_code}' --resolve "$n:80:127.0.0.1" "http://$n/" 2>/dev/null || true)"
  done
}
compare_other_sites() {  # $1 = snapshot taken before
  local now; now=$(other_sites_snapshot)
  if diff -q <($SUDO cat "$1") <(printf '%s\n' "$now") >/dev/null; then
    ok "other sites on this server answer exactly as before ($(grep -c . <<<"$now" || true) hostnames)"
  else
    warn "some other sites answer differently than before (could also be their own activity):"
    diff <($SUDO cat "$1") <(printf '%s\n' "$now") | grep '^[<>]' | sed 's/^/      /' || true
  fi
}
check_unrelated_unchanged() {  # $1 = manifest taken before
  if diff -q <(unrelated_only < "$1") <(nginx_manifest | unrelated_only) >/dev/null; then
    ok "no nginx file outside this site's own files changed ($(nginx_manifest | unrelated_only | wc -l) files checked)"
  else
    bad "nginx files outside this site's own files changed:"
    diff <(unrelated_only < "$1") <(nginx_manifest | unrelated_only) | grep '^[<>]' | sed 's/^/      /'
    return 1
  fi
}

# ---------------------------------------------------------------- preflight (read-only) ----------------
API_PORT="" OLD_FILE="" OLD_LINK="" OLD_CERT="" OLD_KEY="" IPV6=no

preflight() {
  local quiet=${1:-} t
  cd "$REPO" || fail "repository not found at $REPO"
  if [ -n "$SUDO" ]; then $SUDO -v || fail "sudo is required"; fi
  local p1; p1=$(get_state PHASE1); local p2; p2=$(get_state PHASE2)

  step "Preflight 1/9: tools and repository"
  for t in curl openssl sha256sum certbot "$NGINX_BIN" "$NODE_BIN" npm getent ss git; do
    command -v "$t" >/dev/null || fail "required command not found: $t"
  done
  ok "commands present (certbot $(certbot --version 2>&1 | awk '{print $NF}'), node $($NODE_BIN --version))"
  [ -f "$TPL_NEW" ] && [ -f "$TPL_OLD" ] && [ -f "$REPO/deploy/validate-env.mjs" ] || fail "deploy/ files missing (git pull first)"
  [ -f "$API_CONFIG_JS" ] || fail "$API_CONFIG_JS missing: the API has not been built"
  [ -f "$WEB_OUT/index.html" ] && [ -f "$ADMIN_OUT/index.html" ] || fail "current build outputs missing ($WEB_OUT, $ADMIN_OUT)"
  [ -d "$REPO/node_modules" ] || fail "node_modules missing in $REPO (npm ci was never run)"
  if [ -n "$(git -C "$REPO" status --porcelain --untracked-files=no 2>/dev/null)" ]; then
    warn "tracked files are modified in $REPO:"; git -C "$REPO" status --short --untracked-files=no | sed 's/^/      /'
  fi
  ok "repository at $(git -C "$REPO" rev-parse --short HEAD 2>/dev/null || echo '?'); migration state: phase1=${p1:-none} phase2=${p2:-none}"
  case "$p1" in started) fail "a previous phase1 stopped without a verified revert; run: bash deploy/migrate-domain.sh rollback";; esac
  case "$p2" in started) fail "a previous phase2 stopped without a verified revert; run: bash deploy/migrate-domain.sh rollback-phase2";; esac

  step "Preflight 2/9: DNS for $NEW_HOST"
  local ips; ips=$(getent ahostsv4 "$NEW_HOST" | awk '{print $1}' | sort -u | xargs || true)
  [ "$ips" = "$EXPECTED_IP" ] || fail "$NEW_HOST resolves to '${ips:-nothing}', expected $EXPECTED_IP (fix the Namecheap A record)"
  ok "$NEW_HOST -> $ips"
  if grep -qxF "$EXPECTED_IP" <<<"$(hostname -I 2>/dev/null | tr ' ' '\n' || true)"; then ok "$EXPECTED_IP is an address of this server"
  else warn "$EXPECTED_IP is not a local interface address (normal behind provider NAT; make sure this is the right VPS)"; fi

  step "Preflight 3/9: nginx"
  nginx_test || fail "nginx -t fails BEFORE any change; the existing configuration must be fixed first (not caused by this script)"
  $SUDO systemctl is-active --quiet nginx || fail "nginx is not running"
  ok "nginx -t passes and nginx is active"
  [ -d "$SITES_AVAIL" ] && [ -d "$SITES_EN" ] || fail "$SITES_AVAIL / $SITES_EN not found"
  dump_nginx
  [ -s "$TMP/nginx-T.txt" ] || fail "nginx -T produced no output"
  local nf; nf=$(files_serving "$NEW_HOST" | xargs)
  if [ -n "$nf" ]; then
    if [ "$p1" = done ] && [ "$nf" = "$NEW_LINK" ]; then ok "$NEW_HOST is served by $nf (phase1 done)"
    else fail "$NEW_HOST already appears in the nginx configuration ($nf); another site may already claim it. Inspect before migrating"; fi
  else ok "$NEW_HOST is not configured anywhere yet"; fi
  local zf; zf=$(awk '/^# configuration file /{f=$4; sub(/:$/,"",f)} /^[[:space:]]*limit_req_zone/ && /zone='"$ZONE"':/ {print f}' "$TMP/nginx-T.txt" | sort -u | xargs)
  if [ -n "$zf" ] && [ "$zf" != "$NEW_LINK" ]; then fail "an nginx limit_req_zone named $ZONE already exists in $zf; it would clash"; fi
  ok "rate-limit zone name $ZONE is not used by any other file"

  step "Preflight 4/9: the existing $OLD_HOST site"
  local of; of=$(files_serving "$OLD_HOST")
  [ "$(grep -c . <<<"$of" || true)" = 1 ] || fail "expected exactly one nginx file serving $OLD_HOST, found: '$(xargs <<<"$of")'"
  OLD_FILE=$(readlink -f "$of")
  [ "${OLD_FILE#"$NGINX_DIR"/}" != "$OLD_FILE" ] || fail "old site file $OLD_FILE is outside $NGINX_DIR"
  OLD_LINK=""
  for t in "$SITES_EN"/*; do
    if [ -L "$t" ] && [ "$(readlink -f "$t")" = "$OLD_FILE" ]; then OLD_LINK=$t; fi
  done
  ok "old site file: $OLD_FILE${OLD_LINK:+ (enabled via $OLD_LINK)}"
  if [ "$p2" = done ]; then
    ok "phase2 done: the old site file is the redirect config"
  else
    local roots alias_
    roots=$({ $SUDO grep -oE '^[[:space:]]*root[[:space:]]+[^;]+' "$OLD_FILE" || true; } | awk '{print $2}' | sort -u | xargs)
    alias_=$({ $SUDO grep -oE '^[[:space:]]*alias[[:space:]]+[^;]+' "$OLD_FILE" || true; } | awk '{print $2}' | sed 's#/$##' | sort -u | xargs)
    [ "$roots" = "$WEB_OUT" ] || fail "old site's root is '$roots', expected $WEB_OUT; the template would serve a different directory"
    [ "$alias_" = "$ADMIN_OUT" ] || fail "old site's /console/ alias is '$alias_', expected $ADMIN_OUT"
    ok "old site serves $WEB_OUT and $ADMIN_OUT (the new site will serve the same directories)"
  fi
  OLD_CERT=$({ $SUDO sed -nE 's/^[[:space:]]*ssl_certificate[[:space:]]+([^;]+);.*/\1/p' "$OLD_FILE" || true; } | head -1)
  OLD_KEY=$({ $SUDO sed -nE 's/^[[:space:]]*ssl_certificate_key[[:space:]]+([^;]+);.*/\1/p' "$OLD_FILE" || true; } | head -1)
  [ -n "$OLD_CERT" ] && [ -n "$OLD_KEY" ] && $SUDO test -f "$OLD_CERT" && $SUDO test -f "$OLD_KEY" \
    || fail "the old site has no readable ssl_certificate / ssl_certificate_key"
  ok "old certificate: $OLD_CERT (expires $($SUDO openssl x509 -in "$OLD_CERT" -noout -enddate | cut -d= -f2))"
  if $SUDO grep -qE '^[[:space:]]*listen[[:space:]]+\[::\]:443' "$OLD_FILE"; then IPV6=yes; else IPV6=no; fi
  ok "IPv6 listeners: $IPV6 (same as the old site)"

  step "Preflight 5/9: API port (kept unchanged)"
  API_PORT=$(api_port_from_env)
  [[ "$API_PORT" =~ ^[0-9]+$ ]] || fail "PORT not found in $API_ENV"
  if [ -n "${EXPECT_API_PORT:-}" ] && [ "$API_PORT" != "$EXPECT_API_PORT" ]; then
    fail "PORT in $API_ENV is $API_PORT, but you expected $EXPECT_API_PORT; resolve this before migrating"
  fi
  ok "PORT=$API_PORT in $API_ENV${EXPECT_API_PORT:+ (matches EXPECT_API_PORT)}"
  local pp; pp=$({ $SUDO grep -oE 'proxy_pass[[:space:]]+http://[^;/]+' "$OLD_FILE" || true; } | sed -E 's#.*http://##' | sort -u | xargs)
  [ "$pp" = "127.0.0.1:$API_PORT" ] || fail "the old site proxies the API to '$pp', but api.env says 127.0.0.1:$API_PORT; they must agree"
  ok "old site proxies /v1/ and /admin/v1/ to 127.0.0.1:$API_PORT"
  local sock; sock=$($SUDO ss -tlnpH "sport = :$API_PORT" 2>/dev/null || true)
  [ -n "$sock" ] || fail "nothing is listening on port $API_PORT"
  if grep -q '"node"' <<<"$sock"; then ok "port $API_PORT is held by node"; else warn "port $API_PORT is held by: $(grep -oE 'users:\(\(.*\)\)' <<<"$sock" | head -1)"; fi
  health_ok "http://127.0.0.1:$API_PORT/v1/health" || fail "API health check failed on 127.0.0.1:$API_PORT"
  ok "API healthy on 127.0.0.1:$API_PORT"
  local unit; unit=$($SUDO systemctl show -p FragmentPath --value "$API_SERVICE" 2>/dev/null || true)
  [ -n "$unit" ] || fail "systemd service $API_SERVICE not found"
  ok "service $API_SERVICE ($unit)"

  step "Preflight 6/9: API environment"
  local verdict; verdict=$($SUDO cat "$API_ENV" | $NODE_BIN "$REPO/deploy/validate-env.mjs" "$API_CONFIG_JS" "$API_PORT" "$NEW_ORIGIN" 2>&1 || true)
  grep -q 'PASS  API config loader accepts' <<<"$verdict" || { printf '%s\n' "$verdict"; fail "the current api.env is not accepted by the API's config loader"; }
  ok "current api.env loads with the API's own config loader"
  $SUDO grep -E '^(PUBLIC_ORIGINS|ADMIN_ORIGIN)=' "$API_ENV" | sed 's/^/      now: /' || true

  step "Preflight 7/9: certificates"
  for t in "$LE_DIR/options-ssl-nginx.conf" "$LE_DIR/ssl-dhparams.pem"; do $SUDO test -f "$t" || fail "$t missing"; done
  ok "certbot TLS options present"
  if $SUDO test -f "$NEW_CERT"; then ok "a certificate for $NEW_HOST already exists (reused while valid)"; fi
  if ! $SUDO certbot show_account >/dev/null 2>&1 && [ -z "${CERTBOT_EMAIL:-}" ]; then
    fail "certbot has no account (or is too old for show_account); re-run with CERTBOT_EMAIL=you@example.org"
  fi
  ok "certbot account available"

  step "Preflight 8/9: dry-run of every nginx change on copies of $NGINX_DIR"
  openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj "/CN=$NEW_HOST" -keyout "$TMP/dummy.key" -out "$TMP/dummy.crt" >/dev/null 2>&1
  render_new "$TMP/stage.conf" "$TMP/dummy.crt" "$TMP/dummy.key" http-only || fail "template rendering failed"
  render_new "$TMP/final-test.conf" "$TMP/dummy.crt" "$TMP/dummy.key" || fail "template rendering failed"
  render_old "$TMP/old-redirect.conf" || fail "template rendering failed"
  local rs=${NEW_SITE#"$NGINX_DIR"/} rl=${NEW_LINK#"$NGINX_DIR"/} ro=${OLD_FILE#"$NGINX_DIR"/}
  if [ "$p1" != done ]; then
    shadow_test "phase1 step A: HTTP-only $NEW_HOST (certificate challenge)" "put:$rs=$TMP/stage.conf" "put:$rl=$TMP/stage.conf" \
      || fail "the HTTP-only $NEW_HOST config would break nginx; nothing was changed"
    shadow_test "phase1 step E: full $NEW_HOST site with HTTPS" "put:$rs=$TMP/final-test.conf" "put:$rl=$TMP/final-test.conf" \
      || fail "the HTTPS $NEW_HOST config would break nginx; nothing was changed"
  fi
  if [ "$p2" != done ]; then
    # phase2 replaces the old file, which removes the zones it declares: none may be used by another file.
    local z
    for z in $({ $SUDO sed -nE 's/^[[:space:]]*limit_req_zone[^;]*zone=([A-Za-z0-9_]+):.*/\1/p' "$OLD_FILE" || true; } | sort -u); do
      local others; others=$(awk -v f="$of" '/^# configuration file /{cur=$4; sub(/:$/,"",cur); next} cur != f && !/^[[:space:]]*#/' "$TMP/nginx-T.txt")
      if grep -qE "limit_req[[:space:]]+zone=$z([[:space:]]|;)" <<<"$others"; then
        fail "zone $z (declared in the old site file) is used by another file; phase2 would break that site"
      fi
    done
    ok "zones declared in the old site file are used only by the old site"
    local extra=(); [ -n "$OLD_LINK" ] && extra=("put:${OLD_LINK#"$NGINX_DIR"/}=$TMP/old-redirect.conf")
    shadow_test "phase2: $OLD_HOST becomes a redirect" "put:$rs=$TMP/final-test.conf" "put:$rl=$TMP/final-test.conf" \
      "put:$ro=$TMP/old-redirect.conf" ${extra[@]+"${extra[@]}"} || fail "the redirect config would break nginx; nothing was changed"
  fi
  if [ "$p1" != done ]; then
    ok "changes from the live old site to the new site config (review):"
    diff -u <($SUDO cat "$OLD_FILE") "$TMP/final-test.conf" | sed 's/^/      /' | head -160 || true
  fi

  step "Preflight 9/9: other sites on this server"
  other_sites_snapshot > "$TMP/other-sites.txt"
  ok "$(grep -c . "$TMP/other-sites.txt" || true) other hostnames recorded (compared again after each change):"
  sed 's/^/      /' "$TMP/other-sites.txt"
  [ -n "$quiet" ] || say "Preflight complete. Nothing was changed."
}

# ---------------------------------------------------------------- backup -------------------------------
backup() {
  step "Backup (before any change)"
  B=$BACKUP_ROOT/$(date +%Y%m%d-%H%M%S)-$$
  $SUDO test ! -e "$B" || fail "backup directory $B already exists"
  $SUDO mkdir -p "$B"
  $SUDO chmod 700 "$BACKUP_ROOT" "$B"
  $SUDO tar czf "$B/etc-nginx.tgz" -C "$(dirname "$NGINX_DIR")" "$(basename "$NGINX_DIR")"
  $SUDO tar tzf "$B/etc-nginx.tgz" >/dev/null
  nginx_manifest > "$TMP/manifest-before.txt"
  $SUDO cp "$TMP/manifest-before.txt" "$B/nginx.manifest"
  $SUDO cp -a "$OLD_FILE" "$B/old-site.conf"
  printf '%s\n%s\n' "$OLD_FILE" "$OLD_LINK" | $SUDO tee "$B/old-site.path" >/dev/null
  $SUDO cp -a "$API_ENV" "$B/api.env"
  $SUDO cp -a "$WEB_OUT" "$B/web-out"
  $SUDO cp -a "$ADMIN_OUT" "$B/admin-dist"
  tree_hash "$WEB_OUT" | $SUDO tee "$B/web-out.sha" >/dev/null
  tree_hash "$ADMIN_OUT" | $SUDO tee "$B/admin-dist.sha" >/dev/null
  [ "$($SUDO bash -c "cd '$B/web-out' && find . -type f -print0 | sort -z | xargs -0 sha256sum" | sha)" = "$($SUDO cat "$B/web-out.sha")" ] || fail "web build backup does not match the original"
  [ "$($SUDO bash -c "cd '$B/admin-dist' && find . -type f -print0 | sort -z | xargs -0 sha256sum" | sha)" = "$($SUDO cat "$B/admin-dist.sha")" ] || fail "admin build backup does not match the original"
  $SUDO cp "$TMP/other-sites.txt" "$B/other-sites.txt"
  git -C "$REPO" rev-parse HEAD 2>/dev/null | $SUDO tee "$B/git-head" >/dev/null || true
  if $SUDO test -d "$ACME_ROOT"; then echo existed; else echo created; fi | $SUDO tee "$B/acme-root" >/dev/null
  RUN_MANIFEST=$TMP/manifest-before.txt
  set_state PHASE1_BACKUP "$B"
  ok "backup verified at $B (etc-nginx.tgz, nginx.manifest, old-site.conf, api.env, web-out, admin-dist)"
}
tree_hash() { (cd "$1" && find . -type f -print0 | sort -z | xargs -0 sha256sum) | sha; }

# ---------------------------------------------------------------- restore helpers (undo + rollback) -----
restore_builds() {
  local pair src dst
  for pair in "web-out:$WEB_OUT" "admin-dist:$ADMIN_OUT"; do
    src=$B/${pair%%:*}; dst=${pair#*:}
    case "$dst" in "$REPO"/apps/*/*) ;; *) echo "   !! refusing to restore to unexpected path $dst"; return 1 ;; esac
    $SUDO test -d "$src" || { echo "   !! no backup of $dst"; return 1; }
    $SUDO rm -rf "$dst.restore" && $SUDO cp -a "$src" "$dst.restore" && $SUDO rm -rf "$dst" && $SUDO mv "$dst.restore" "$dst" || return 1
    if [ "$(tree_hash "$dst")" = "$($SUDO cat "$src.sha")" ]; then echo "   restored $dst (verified identical)"; else echo "   !! $dst differs from its backup"; return 1; fi
  done
}
restore_api_env() {
  if $SUDO cmp -s "$B/api.env" "$API_ENV"; then return 0; fi
  $SUDO cp -a "$B/api.env" "$API_ENV" && $SUDO systemctl restart "$API_SERVICE" || return 1
  if wait_api_health; then echo "   api.env restored, API healthy"; else echo "   !! API not healthy after restoring api.env"; return 1; fi
}
remove_new_site() {
  $SUDO rm -f "$NEW_LINK" "$NEW_SITE"
  if nginx_test; then $SUDO systemctl reload nginx; else echo "   !! nginx -t fails after removing $NEW_HOST; NOT reloading"; return 1; fi
}
restore_old_site() {  # $1 = backup copy
  if $SUDO cmp -s "$1" "$OLD_FILE"; then return 0; fi
  $SUDO cp -a "$1" "$OLD_FILE"
  if nginx_test; then $SUDO systemctl reload nginx; else echo "   !! nginx -t fails after restoring $OLD_FILE; NOT reloading"; return 1; fi
}
remove_acme_root() { if [ "$($SUDO cat "$B/acme-root" 2>/dev/null)" = created ]; then $SUDO rm -rf "$ACME_ROOT"; fi; }

set_kv() {  # file key value: replace every KEY=... line, or append
  local f=$1 k=$2 v=$3
  if grep -qE "^[[:space:]]*$k[[:space:]]*=" "$f"; then sed -i -E "s#^[[:space:]]*$k[[:space:]]*=.*#$k=$v#" "$f"
  else printf '%s=%s\n' "$k" "$v" >> "$f"; fi
}

# The build outputs must call the new origin and never the old one.
check_build_outputs() {
  local rc=0 n d
  for d in "$WEB_OUT" "$ADMIN_OUT"; do
    [ -f "$d/index.html" ] || { bad "$d/index.html missing"; rc=1; }
    if grep -rqsF "$OLD_ORIGIN" "$d"; then bad "$d still contains $OLD_ORIGIN"; rc=1; fi
    n=$({ grep -rlsF "$NEW_ORIGIN" "$d" || true; } | wc -l)
    if [ "$n" -ge 1 ]; then ok "$d: $NEW_ORIGIN built into $n file(s), no $OLD_ORIGIN"; else bad "$d: $NEW_ORIGIN not found in the build"; rc=1; fi
  done
  return $rc
}

# ---------------------------------------------------------------- phase1 -------------------------------
cmd_phase1() {
  B=$(get_state PHASE1_BACKUP)
  if [ "$(get_state PHASE1)" = done ]; then say "phase1 is already done (backup $B). Next: bash deploy/migrate-domain.sh verify"; return 0; fi
  B=""
  HANDLE_ERRORS=1
  preflight quiet
  backup
  RUN_KEY=PHASE1
  set_state PHASE1 started

  step "Phase1 A: HTTP-only $NEW_HOST site (only ACME challenges + redirect to https)"
  $SUDO mkdir -p "$ACME_ROOT/.well-known/acme-challenge"
  $SUDO chmod 755 "$ACME_ROOT" "$ACME_ROOT/.well-known" "$ACME_ROOT/.well-known/acme-challenge"
  UNDO+=("remove_acme_root")
  $SUDO install -m 644 "$TMP/stage.conf" "$NEW_SITE"
  $SUDO ln -sfn "$NEW_SITE" "$NEW_LINK"
  UNDO+=("remove_new_site")
  reload_nginx || fail "nginx -t/reload failed with the HTTP-only site"
  ok "nginx reloaded"
  local tok got; tok=$(openssl rand -hex 16)
  echo "$tok" | $SUDO tee "$ACME_ROOT/.well-known/acme-challenge/$tok" >/dev/null
  $SUDO chmod 644 "$ACME_ROOT/.well-known/acme-challenge/$tok"
  got=$(c "http://$NEW_HOST/.well-known/acme-challenge/$tok" 2>/dev/null || true)
  $SUDO rm -f "$ACME_ROOT/.well-known/acme-challenge/$tok"
  [ "$got" = "$tok" ] || fail "http://$NEW_HOST/.well-known/acme-challenge/ is not reachable via public DNS (got '${got:0:80}'); Let's Encrypt would fail. Check port 80 in the firewall and DNS"
  ok "ACME challenge path reachable from outside"

  step "Phase1 B: certificate for $NEW_HOST (certbot --webroot; no nginx file is edited)"
  local email=(); [ -n "${CERTBOT_EMAIL:-}" ] && email=(-m "$CERTBOT_EMAIL")
  local cb=(certonly --webroot -w "$ACME_ROOT" --cert-name "$NEW_HOST" -d "$NEW_HOST" -n --agree-tos --keep-until-expiring
            --deploy-hook "systemctl reload nginx" ${email[@]+"${email[@]}"})
  $SUDO certbot "${cb[@]}" --dry-run >"$TMP/certbot-dry.log" 2>&1 || { tail -n 20 "$TMP/certbot-dry.log"; fail "certbot dry-run (Let's Encrypt staging) failed; no real certificate was requested"; }
  ok "certbot dry-run against Let's Encrypt staging succeeded"
  $SUDO certbot "${cb[@]}" >"$TMP/certbot.log" 2>&1 || { tail -n 20 "$TMP/certbot.log"; fail "certbot could not issue the certificate"; }
  grep -q "DNS:$NEW_HOST" <<<"$($SUDO openssl x509 -in "$NEW_CERT" -noout -ext subjectAltName 2>/dev/null || true)" || fail "the issued certificate does not list $NEW_HOST"
  $SUDO openssl x509 -in "$NEW_CERT" -noout -checkend 604800 >/dev/null || fail "the certificate expires within 7 days"
  ok "certificate: $($SUDO openssl x509 -in "$NEW_CERT" -noout -issuer -enddate | xargs)"
  echo "      (if a later step fails, this certificate is kept; it is harmless. Remove with: sudo certbot delete --cert-name $NEW_HOST)"

  step "Phase1 C: build the public site and admin for $NEW_ORIGIN (API not rebuilt, MongoDB untouched)"
  UNDO+=("restore_builds")
  ( cd "$REPO" && NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_API_URL="$NEW_ORIGIN" npm run build -w @lattice/web ) >"$TMP/build-web.log" 2>&1 \
    || { tail -n 30 "$TMP/build-web.log"; fail "public site build failed (the previous build is restored)"; }
  ok "public site built"
  ( cd "$REPO" && ADMIN_BASE=/console/ VITE_API_URL="$NEW_ORIGIN" npm run build -w @lattice/admin ) >"$TMP/build-admin.log" 2>&1 \
    || { tail -n 30 "$TMP/build-admin.log"; fail "admin build failed (the previous builds are restored)"; }
  ok "admin built"
  check_build_outputs || fail "the build outputs are not correct for $NEW_ORIGIN (the previous builds are restored)"

  step "Phase1 D: API origins in $API_ENV (only PUBLIC_ORIGINS and ADMIN_ORIGIN change; PORT stays $API_PORT)"
  local cand=$TMP/api.env.new
  ( umask 077; $SUDO cat "$API_ENV" > "$cand" )
  set_kv "$cand" PUBLIC_ORIGINS "$NEW_ORIGIN,$OLD_ORIGIN"
  set_kv "$cand" ADMIN_ORIGIN "$NEW_ORIGIN"
  cmp -s <(grep -vE '^(PUBLIC_ORIGINS|ADMIN_ORIGIN)=' "$cand" || true) <($SUDO grep -vE '^(PUBLIC_ORIGINS|ADMIN_ORIGIN)=' "$API_ENV" || true) \
    || fail "internal check: the candidate api.env differs in more than the two origin keys; api.env NOT changed"
  $NODE_BIN "$REPO/deploy/validate-env.mjs" "$API_CONFIG_JS" "$API_PORT" "$NEW_ORIGIN" "$OLD_ORIGIN" < "$cand" \
    || fail "the new api.env values are invalid (FAIL lines above); api.env was NOT changed"
  UNDO+=("restore_api_env")
  local mode own; mode=$($SUDO stat -c %a "$API_ENV"); own=$($SUDO stat -c %U:%G "$API_ENV")
  $SUDO install -m "$mode" -o "${own%%:*}" -g "${own#*:}" "$cand" "$API_ENV"
  rm -f "$cand"
  $SUDO grep -E '^(PUBLIC_ORIGINS|ADMIN_ORIGIN)=' "$API_ENV" | sed 's/^/      new: /'
  $SUDO systemctl restart "$API_SERVICE"
  wait_api_health || fail "the API did not become healthy on 127.0.0.1:$API_PORT after the restart"
  ok "only $API_SERVICE was restarted; healthy on 127.0.0.1:$API_PORT"

  step "Phase1 E: full $NEW_HOST site with HTTPS"
  render_new "$TMP/final.conf" "$NEW_CERT" "$NEW_KEY" || fail "template rendering failed"
  shadow_test "final $NEW_HOST site with the real certificate" "put:${NEW_SITE#"$NGINX_DIR"/}=$TMP/final.conf" "put:${NEW_LINK#"$NGINX_DIR"/}=$TMP/final.conf" \
    || fail "the final config fails nginx -t on a copy"
  $SUDO install -m 644 "$TMP/final.conf" "$NEW_SITE"
  reload_nginx || fail "nginx -t/reload failed with the final site"
  ok "nginx reloaded with https://$NEW_HOST"

  step "Phase1 F: isolation checks"
  check_unrelated_unchanged "$B/nginx.manifest" || fail "an nginx file outside this site's files changed"
  compare_other_sites "$B/other-sites.txt"
  local got2; got2=$(c -o /dev/null -w '%{http_code}' "https://$NEW_HOST/v1/health" 2>/dev/null || true)
  [ "$got2" = 200 ] || fail "https://$NEW_HOST/v1/health returns '$got2' right after the switch"
  UNDO=(); RUN_KEY=""; HANDLE_ERRORS=0
  set_state PHASE1 done
  if cmd_verify; then
    say "Phase1 COMPLETE: https://$NEW_HOST is live. $OLD_HOST keeps its own (unchanged) nginx file."
    echo "    Next: check the site in a browser (desktop + phone), then run phase2.  Undo all: bash deploy/migrate-domain.sh rollback"
  else
    say "Phase1 finished but some verify checks FAILED (above). The server is in a consistent state."
    echo "    Investigate, or return to the old state with: bash deploy/migrate-domain.sh rollback"
    exit 1
  fi
}

# ---------------------------------------------------------------- verify (read-only) -------------------
cmd_verify() {
  local fails=0 code loc f rel
  STEP=verify
  say "Verify https://$NEW_HOST (public DNS, normal certificate validation)"
  [ -z "${TEST_CURL_OPTS:-}" ] || warn "TEST_CURL_OPTS is set: sandbox mode"
  t_ok()  { ok "$1"; }
  t_bad() { bad "$1"; fails=$((fails + 1)); }

  if c -o /dev/null "https://$NEW_HOST/" 2>"$TMP/tls.err"; then t_ok "TLS valid for $NEW_HOST (trusted chain, matching hostname)"
  else t_bad "TLS: $(cat "$TMP/tls.err")"; fi
  if [ -z "${TEST_CURL_OPTS:-}" ]; then
    { echo | openssl s_client -connect "$NEW_HOST:443" -servername "$NEW_HOST" 2>/dev/null | openssl x509 -noout -subject -issuer -enddate; } 2>/dev/null | sed 's/^/      /' || true
  fi
  code=$(c -o /dev/null -w '%{http_code} %{redirect_url}' "http://$NEW_HOST/" 2>/dev/null || true)
  [ "$code" = "301 https://$NEW_HOST/" ] && t_ok "http:// redirects to https:// ($code)" || t_bad "http://$NEW_HOST/ -> '$code'"

  for p in / /text/ /profile/ /roadmap/ /console/ /robots.txt; do
    code=$(c -o /dev/null -w '%{http_code}' "https://$NEW_HOST$p" 2>/dev/null || true)
    [ "$code" = 200 ] && t_ok "GET $p -> 200" || t_bad "GET $p -> $code"
  done
  code=$(c -o /dev/null -w '%{http_code}' "https://$NEW_HOST/this-page-does-not-exist" 2>/dev/null || true)
  [ "$code" = 404 ] && t_ok "unknown path -> 404" || t_bad "unknown path -> $code"
  for p in /text /profile /roadmap; do
    loc=$(c -o /dev/null -w '%{http_code} %{redirect_url}' "https://$NEW_HOST$p" 2>/dev/null || true)
    case "$loc" in
      "200 "*|"301 https://$NEW_HOST$p/"|"308 https://$NEW_HOST$p/") t_ok "GET $p -> $loc" ;;
      *) t_bad "GET $p -> '$loc' (expected 200 or a redirect to https://$NEW_HOST$p/)" ;;
    esac
  done

  # The served files must be exactly the files built for the new origin (no stale cache, no other vhost).
  cmp_served() {
    if [ "$(c "https://$NEW_HOST$1" 2>/dev/null | sha)" = "$(sha < "$2")" ]; then t_ok "served $1 is byte-identical to the local build"; else t_bad "served $1 differs from $2"; fi
  }
  cmp_served / "$WEB_OUT/index.html"
  cmp_served /console/ "$ADMIN_OUT/index.html"
  f=$({ grep -rlsF "$NEW_ORIGIN" "$WEB_OUT/_next" || true; } | head -1)
  if [ -n "$f" ]; then cmp_served "${f#"$WEB_OUT"}" "$f"; else t_bad "no public JS file contains $NEW_ORIGIN"; fi
  f=$({ grep -rlsF "$NEW_ORIGIN" "$ADMIN_OUT/assets" || true; } | head -1)
  if [ -n "$f" ]; then cmp_served "/console${f#"$ADMIN_OUT"}" "$f"; else t_bad "no admin JS file contains $NEW_ORIGIN"; fi
  if grep -rqsF "$OLD_ORIGIN" "$WEB_OUT" "$ADMIN_OUT"; then t_bad "the build still references $OLD_ORIGIN"; else t_ok "the served build never references $OLD_ORIGIN"; fi
  local mixed; mixed=$({ grep -rhoE '(src="http://|<link[^>]*href="http://)[^"]*' --include='*.html' "$WEB_OUT" "$ADMIN_OUT" || true; } | sort -u | head -3)
  [ -z "$mixed" ] && t_ok "no http:// scripts, images or stylesheets in the HTML (no mixed content)" || t_bad "mixed content: $mixed"

  # API on the new hostname.
  if health_ok ${CURL_X[@]+"${CURL_X[@]}"} "https://$NEW_HOST/v1/health"; then t_ok "GET /v1/health ok"; else t_bad "GET /v1/health"; fi
  code=$(c -o /dev/null -w '%{http_code}' "https://$NEW_HOST/v1/content" 2>/dev/null || true)
  case $code in 200|404) t_ok "GET /v1/content -> $code (404 = nothing published yet)";; *) t_bad "GET /v1/content -> $code";; esac
  acao() { c -o /dev/null -D - -X OPTIONS -H "Origin: $1" -H 'Access-Control-Request-Method: POST' -H 'Access-Control-Request-Headers: content-type' "https://$NEW_HOST$2" 2>/dev/null \
           | awk 'tolower($1)=="access-control-allow-origin:" {print $2}' | tr -d '\r' || true; }
  [ "$(acao "$NEW_ORIGIN" /v1/feedback)" = "$NEW_ORIGIN" ] && t_ok "CORS: /v1/feedback allows $NEW_ORIGIN" || t_bad "CORS: /v1/feedback does not allow $NEW_ORIGIN"
  [ -z "$(acao https://evil.example /v1/feedback)" ] && t_ok "CORS: /v1/feedback refuses a foreign origin" || t_bad "CORS: a foreign origin is allowed"
  [ "$(acao "$NEW_ORIGIN" /admin/v1/auth/login)" = "$NEW_ORIGIN" ] && t_ok "CORS: admin API allows $NEW_ORIGIN" || t_bad "CORS: admin API does not allow $NEW_ORIGIN"
  code=$(c -o /dev/null -w '%{http_code}' "https://$NEW_HOST/admin/v1/auth/me" 2>/dev/null || true)
  case $code in 401|403) t_ok "admin API requires authentication ($code)";; *) t_bad "admin API without login -> $code";; esac

  if [ -z "${TEST_CURL_OPTS:-}" ]; then
    if $SUDO certbot renew --dry-run --cert-name "$NEW_HOST" >"$TMP/renew.log" 2>&1; then t_ok "certbot renew --dry-run for $NEW_HOST"
    else tail -n 10 "$TMP/renew.log"; t_bad "certbot renew --dry-run for $NEW_HOST"; fi
    if grep -qiE 'certbot' <<<"$($SUDO systemctl list-timers --all 2>/dev/null || true)"; then t_ok "certbot renewal timer is scheduled"
    else warn "no certbot timer listed; check: systemctl list-timers | grep certbot"; fi
  fi

  echo
  if [ $fails = 0 ]; then echo "    ALL VERIFY CHECKS PASSED"; return 0; fi
  echo "    $fails VERIFY CHECK(S) FAILED"; return 1
}

# ---------------------------------------------------------------- phase2 -------------------------------
cmd_phase2() {
  B=$(get_state PHASE1_BACKUP)
  [ "$(get_state PHASE1)" = done ] || fail "phase1 is not complete"
  if [ "$(get_state PHASE2)" = done ]; then say "phase2 is already done."; return 0; fi
  HANDLE_ERRORS=1
  preflight quiet
  step "Phase2: re-verify the new domain first"
  cmd_verify || fail "the new domain does not pass verify; phase2 not started (nothing changed)"
  if [ -z "$(getent ahostsv4 "$OLD_HOST" || true)" ]; then
    warn "$OLD_HOST has no DNS record: visitors reach the redirect only after you add A zakariye -> $EXPECTED_IP"
  fi

  step "Phase2: $OLD_HOST -> 301 to $NEW_ORIGIN (API routes stay proxied)"
  nginx_manifest > "$TMP/manifest-p2.txt"; RUN_MANIFEST=$TMP/manifest-p2.txt
  other_sites_snapshot > "$TMP/other-sites-p2.txt"
  $SUDO cp -a "$OLD_FILE" "$B/old-site.before-phase2.conf"
  RUN_KEY=PHASE2
  set_state PHASE2 started
  UNDO+=("restore_old_site '$B/old-site.before-phase2.conf'")
  $SUDO install -m 644 "$TMP/old-redirect.conf" "$OLD_FILE"
  reload_nginx || fail "nginx -t/reload failed with the redirect config"
  ok "nginx reloaded"

  local loc r=(-s -o /dev/null -m 10 --resolve "$OLD_HOST:443:127.0.0.1" ${CURL_X[@]+"${CURL_X[@]}"})
  loc=$(curl "${r[@]}" -w '%{http_code} %{redirect_url}' "https://$OLD_HOST/roadmap/?x=1" || true)
  [ "$loc" = "301 $NEW_ORIGIN/roadmap/?x=1" ] && ok "https://$OLD_HOST/roadmap/?x=1 -> $loc" || fail "unexpected redirect: '$loc'"
  loc=$(curl "${r[@]}" -w '%{http_code} %{redirect_url}' "https://$OLD_HOST/console/" || true)
  [ "$loc" = "301 $NEW_ORIGIN/console/" ] && ok "https://$OLD_HOST/console/ -> $loc" || fail "unexpected /console/ redirect: '$loc'"
  health_ok --resolve "$OLD_HOST:443:127.0.0.1" ${CURL_X[@]+"${CURL_X[@]}"} "https://$OLD_HOST/v1/health" \
    && ok "old host /v1/health still served (not redirected)" || fail "the old host's API is not served"
  check_unrelated_unchanged "$TMP/manifest-p2.txt" || fail "an nginx file outside the two site files changed"
  compare_other_sites "$TMP/other-sites-p2.txt"
  UNDO=(); RUN_KEY=""; HANDLE_ERRORS=0
  set_state PHASE2 done
  say "Phase2 COMPLETE. Undo only the redirect: bash deploy/migrate-domain.sh rollback-phase2"
}

# ---------------------------------------------------------------- rollback -----------------------------
cmd_rollback_phase2() {
  B=$(get_state PHASE1_BACKUP)
  [ -n "$B" ] || fail "no migration backup recorded in $STATE_FILE"
  step "Rollback of phase2 only"
  OLD_FILE=$($SUDO sed -n 1p "$B/old-site.path")
  local src=$B/old-site.before-phase2.conf
  $SUDO test -f "$src" || src=$B/old-site.conf
  restore_old_site "$src" || fail "could not restore $OLD_FILE"
  set_state PHASE2 reverted
  ok "$OLD_HOST serves its previous configuration again"
}

cmd_rollback() {
  B=${1:-$(get_state PHASE1_BACKUP)}
  [ -n "$B" ] && $SUDO test -f "$B/nginx.manifest" || fail "no migration backup found (pass it: rollback $BACKUP_ROOT/<timestamp>)"
  cd "$REPO"
  step "Rollback to the state saved in $B"
  OLD_FILE=$($SUDO sed -n 1p "$B/old-site.path"); OLD_LINK=$($SUDO sed -n 2p "$B/old-site.path")
  local rc=0
  # 1. nginx: only the files this script owns. Test before reload; never reload a failing config.
  $SUDO cp -a "$B/old-site.conf" "$OLD_FILE"
  if [ -n "$OLD_LINK" ] && [ ! -e "$OLD_LINK" ]; then $SUDO ln -s "$OLD_FILE" "$OLD_LINK"; fi
  $SUDO rm -f "$NEW_LINK" "$NEW_SITE"
  nginx_test || fail "nginx -t fails after restoring the site files (NOT reloaded). Original /etc/nginx copy: $B/etc-nginx.tgz"
  $SUDO systemctl reload nginx
  ok "nginx: $OLD_HOST file restored, $NEW_HOST removed, reloaded"
  # 2. API configuration (same port as before, from the restored file).
  API_PORT=$($SUDO sed -nE 's/^[[:space:]]*PORT[[:space:]]*=[[:space:]]*["'\'']?([0-9]+).*/\1/p' "$B/api.env" | tail -1)
  restore_api_env && ok "api.env identical to the backup; API healthy on $API_PORT" || { bad "api.env/API restore"; rc=1; }
  # 3. Build outputs.
  restore_builds && ok "web and admin builds restored (verified identical)" || { bad "build restore"; rc=1; }
  remove_acme_root
  # 4. Proof.
  if diff -q <($SUDO cat "$B/nginx.manifest") <(nginx_manifest) >/dev/null; then ok "every file under $NGINX_DIR is byte-identical to before the migration"
  else warn "$NGINX_DIR differs from the pre-migration snapshot (other sites' own later changes?):"
       diff <($SUDO cat "$B/nginx.manifest") <(nginx_manifest) | grep '^[<>]' | sed 's/^/      /' || true; fi
  if $SUDO test -f "$B/other-sites.txt"; then compare_other_sites "$B/other-sites.txt"; fi
  health_ok --resolve "$OLD_HOST:443:127.0.0.1" ${CURL_X[@]+"${CURL_X[@]}"} "https://$OLD_HOST/v1/health" \
    && ok "$OLD_HOST serves the site and API again (checked via 127.0.0.1)" || { bad "$OLD_HOST API check"; rc=1; }
  [ $rc = 0 ] || fail "rollback finished with errors (above)"
  $SUDO mv "$STATE_FILE" "$B/state.after-rollback" 2>/dev/null || true
  say "Rollback complete. The $NEW_HOST certificate was kept (harmless); remove with: sudo certbot delete --cert-name $NEW_HOST"
}

cmd_render() {
  preflight quiet >/dev/null
  echo "# ===== $NEW_SITE (as phase1 installs it) ====="
  render_new "$TMP/r.conf" "$NEW_CERT" "$NEW_KEY"; cat "$TMP/r.conf"
  echo; echo "# ===== $OLD_FILE (as phase2 installs it) ====="; cat "$TMP/old-redirect.conf"
}

# ---------------------------------------------------------------- main ---------------------------------
CMD=${1:-}
case "$CMD" in
  preflight|phase1|phase2|rollback|rollback-phase2)
    LOG=${LOG:-$HOME/lattice-migrate-$CMD-$(date +%Y%m%d-%H%M%S).log}
    exec > >(tee -a "$LOG") 2>&1
    echo "log: $LOG"
    ;;
esac
case "$CMD" in
  preflight)       HANDLE_ERRORS=1; preflight; HANDLE_ERRORS=0 ;;
  phase1)          cmd_phase1 ;;
  verify)          cmd_verify || exit 1 ;;
  phase2)          cmd_phase2 ;;
  rollback)        HANDLE_ERRORS=1; cmd_rollback "${2:-}"; HANDLE_ERRORS=0 ;;
  rollback-phase2) HANDLE_ERRORS=1; cmd_rollback_phase2; HANDLE_ERRORS=0 ;;
  render)          cmd_render ;;
  *) echo "usage: $0 preflight|phase1|verify|phase2|rollback [backup-dir]|rollback-phase2|render"; exit 2 ;;
esac
