#!/usr/bin/env bash
# Sandbox test for deploy/migrate-domain.sh. Builds a throw-away copy of the shared-VPS layout under /tmp
# (an /etc/nginx with two OTHER tenants incl. the default_server, a certbot-managed old site on API port 4310,
# /etc/letsencrypt with a test CA, api.env, the repo's web/admin builds) and runs every command of the
# migration script against it with a REAL nginx binary. certbot, systemctl and npm are stubs that can be
# told to fail; the API is a small fake that implements the same CORS rules. Nothing outside the sandbox
# directory is touched and no network service other than 127.0.0.1 is contacted (DNS lookup excepted).
#
# Usage (Linux or WSL, as root):
#   NGINX_REAL=/path/to/nginx NGINX_MIME=/path/to/mime.types [NODE_REAL=/path/to/node] bash deploy/test/sandbox-test.sh
set -uo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
: "${NGINX_REAL:?set NGINX_REAL to an nginx binary}"
: "${NGINX_MIME:?set NGINX_MIME to nginx mime.types}"
NODE_REAL=${NODE_REAL:-$(command -v node || true)}
[ -n "$NODE_REAL" ] || { echo "node not found (set NODE_REAL)"; exit 2; }
[ "$(id -u)" = 0 ] || { echo "run as root (sandbox nginx binds 80/443 inside this machine)"; exit 2; }

SB=$(mktemp -d /tmp/zdu-sandbox.XXXXXX)
NEW=zdu.elivateict.com OLD=zakariye.elivateict.com PORT=4310
NG=$SB/etc/nginx LE=$SB/etc/letsencrypt REPO=$SB/repo ENVF=$SB/etc/lattice/api.env
PASSES=0 FAILS=0
pass() { PASSES=$((PASSES + 1)); printf '  [PASS] %s\n' "$*"; }
failt() { FAILS=$((FAILS + 1)); printf '  [FAIL] %s\n' "$*"; }
check() { local d=$1; shift; if "$@"; then pass "$d"; else failt "$d"; return 1; fi; }

mkdir -p "$NG"/{sites-available,sites-enabled,conf.d} "$LE"/{live,archive,renewal} "$SB"/etc/lattice "$SB"/{bin,run,logs,ca,backups} \
         "$SB"/var/tmp/{body,proxy,fastcgi,uwsgi,scgi} "$REPO"/{apps/web,apps/admin,apps/api/dist,node_modules}
cp -r "$ROOT/deploy" "$REPO/deploy"
cp "$NGINX_MIME" "$NG/mime.types"

# ---------- test CA + certificates ----------
openssl req -x509 -newkey rsa:2048 -nodes -days 30 -subj "/CN=Sandbox Test CA" -keyout "$SB/ca/ca.key" -out "$SB/ca/ca.pem" 2>/dev/null
issue() {  # host dir
  mkdir -p "$2"
  openssl req -newkey rsa:2048 -nodes -subj "/CN=$1" -keyout "$2/privkey.pem" -out "$2/req.csr" 2>/dev/null
  openssl x509 -req -in "$2/req.csr" -CA "$SB/ca/ca.pem" -CAkey "$SB/ca/ca.key" -CAcreateserial -days 90 \
    -extfile <(printf 'subjectAltName=DNS:%s\nbasicConstraints=CA:FALSE\n' "$1") -out "$2/cert.pem" 2>/dev/null
  cat "$2/cert.pem" "$SB/ca/ca.pem" > "$2/fullchain.pem"; rm -f "$2/req.csr"
}
issue "$OLD" "$LE/live/$OLD"
issue baroplatform.onepercenttech.com "$SB/tenant-certs/baro"
issue shop.example.test "$SB/tenant-certs/shop"
cat > "$LE/options-ssl-nginx.conf" <<'EOF'
ssl_session_cache shared:le_nginx_SSL:10m;
ssl_session_timeout 1440m;
ssl_session_tickets off;
ssl_protocols TLSv1.2 TLSv1.3;
ssl_prefer_server_ciphers off;
EOF
openssl dhparam -dsaparam -out "$LE/ssl-dhparams.pem" 2048 2>/dev/null

# ---------- builds (the "currently deployed" ones use the OLD origin) ----------
cat > "$SB/bin/gen-builds.sh" <<'EOF'
gen_web() {  # out-dir origin
  rm -rf "$1"; mkdir -p "$1"/{text,profile,roadmap,_next/static/chunks,_next/static/media}
  printf '<!doctype html><html><head><script src="/_next/static/chunks/main-%s.js"></script><link rel="stylesheet" href="/_next/static/media/a.css"></head><body>home %s</body></html>' "$RANDOM" "$2" > "$1/index.html"
  for p in text profile roadmap; do echo "<!doctype html><title>$p</title>" > "$1/$p/index.html"; done
  echo '<!doctype html><title>404</title>' > "$1/404.html"
  printf 'User-agent: *\nDisallow: /\n' > "$1/robots.txt"
  echo 'body{}' > "$1/_next/static/media/a.css"
  echo "const API_URL=\"$2\";fetch(API_URL+\"/v1/feedback\")" > "$1/_next/static/chunks/app-$RANDOM.js"
  echo "console.log(1)" > "$1/_next/static/chunks/main.js"
}
gen_admin() {  # out-dir origin
  rm -rf "$1"; mkdir -p "$1/assets"
  echo '<!doctype html><div id="root"></div><script type="module" src="/console/assets/index.js"></script>' > "$1/index.html"
  echo "const API=\"$2\";" > "$1/assets/index-$RANDOM.js"
}
EOF
. "$SB/bin/gen-builds.sh"
gen_web "$REPO/apps/web/out" "https://$OLD"
gen_admin "$REPO/apps/admin/dist" "https://$OLD"
cp "$ROOT/apps/api/dist/config.js" "$SB/config.js.unused" 2>/dev/null || true
( cd "$REPO" && git init -q && git add -A && git -c user.email=t@t -c user.name=t commit -qm sandbox ) || true

# ---------- api.env ----------
cat > "$ENVF" <<EOF
NODE_ENV=production
PORT=$PORT
MONGODB_URI=mongodb://lattice:sandbox-secret@127.0.0.1:27017/lattice?authSource=admin
MONGODB_DB=lattice
PUBLIC_ORIGINS=https://$OLD
ADMIN_ORIGIN=https://$OLD
TOTP_ENC_KEY=$(openssl rand -base64 32)
COOKIE_SECURE=true
TRUST_PROXY=1
REQUIRE_2FA=true
AGG_INTERVAL_MS=900000
EOF
chmod 600 "$ENVF"

# ---------- nginx: main config, two other tenants, certbot-style old site ----------
cat > "$NG/nginx.conf" <<EOF
user root;
worker_processes 1;
pid $SB/run/nginx.pid;
error_log $SB/logs/error.log;
events { worker_connections 128; }
http {
    include $NG/mime.types;
    default_type application/octet-stream;
    access_log off;
    client_body_temp_path $SB/var/tmp/body; proxy_temp_path $SB/var/tmp/proxy; fastcgi_temp_path $SB/var/tmp/fastcgi;
    uwsgi_temp_path $SB/var/tmp/uwsgi; scgi_temp_path $SB/var/tmp/scgi;
    include $NG/conf.d/*.conf;
    include $NG/sites-enabled/*;
}
EOF
cat > "$NG/sites-available/baroplatform.conf" <<EOF
# OTHER TENANT: owns the default servers (this is what zdu showed before the migration)
limit_req_zone \$binary_remote_addr zone=baro:10m rate=10r/s;
server { listen 80 default_server; listen [::]:80 default_server; server_name _; return 301 https://\$host\$request_uri; }
server {
    listen 443 ssl default_server; listen [::]:443 ssl default_server;
    server_name baroplatform.onepercenttech.com;
    ssl_certificate $SB/tenant-certs/baro/fullchain.pem; ssl_certificate_key $SB/tenant-certs/baro/privkey.pem;
    location / { limit_req zone=baro burst=5; return 200 "baro\n"; }
}
EOF
ln -s "$NG/sites-available/baroplatform.conf" "$NG/sites-enabled/baroplatform.conf"
cat > "$NG/conf.d/shop.conf" <<EOF
# OTHER TENANT in conf.d
server { listen 80; server_name shop.example.test; return 200 "shop-http\n"; }
server { listen 443 ssl; server_name shop.example.test;
         ssl_certificate $SB/tenant-certs/shop/fullchain.pem; ssl_certificate_key $SB/tenant-certs/shop/privkey.pem;
         location / { return 200 "shop\n"; } }
EOF
# The old site as certbot --nginx leaves it (from the repo's pre-migration template, API on 4310).
git -c safe.directory="*" -C "$ROOT" show 5762ced:deploy/nginx/zakariye.elivateict.com.conf > "$SB/old-template.conf"
sed -e "s#/var/www/zakariye#$REPO#g" -e "s#127.0.0.1:4100#127.0.0.1:$PORT#g" \
    -e '/^    listen 80;$/d' -e '/^    listen \[::\]:80;$/d' "$SB/old-template.conf" \
  | awk -v le="$LE" -v host="$OLD" '
      /^    error_page 404/ { print; print "";
        print "    listen [::]:443 ssl ipv6only=on; # managed by Certbot"; print "    listen 443 ssl; # managed by Certbot";
        print "    ssl_certificate " le "/live/" host "/fullchain.pem; # managed by Certbot";
        print "    ssl_certificate_key " le "/live/" host "/privkey.pem; # managed by Certbot";
        print "    include " le "/options-ssl-nginx.conf; # managed by Certbot";
        print "    ssl_dhparam " le "/ssl-dhparams.pem; # managed by Certbot"; next } { print }
      END { print ""; print "server {"; print "    if ($host = " host ") {"; print "        return 301 https://$host$request_uri;"; print "    } # managed by Certbot";
            print "    listen 80;"; print "    listen [::]:80;"; print "    server_name " host ";"; print "    return 404; # managed by Certbot"; print "}" }' \
  > "$NG/sites-available/$OLD.conf"
ln -s "$NG/sites-available/$OLD.conf" "$NG/sites-enabled/$OLD.conf"

# ---------- stubs ----------
cat > "$SB/bin/nginx" <<EOF
#!/bin/bash
exec "$NGINX_REAL" -e "$SB/logs/error.log" "\$@"
EOF
cat > "$SB/bin/fake-api.py" <<'EOF'
import http.server, json, sys
envf = sys.argv[1]
env = {}
for line in open(envf):
    line = line.strip()
    if line and not line.startswith('#') and '=' in line:
        k, v = line.split('=', 1); env[k.strip()] = v.strip()
port = int(env['PORT']); pub = [o.strip() for o in env['PUBLIC_ORIGINS'].split(',') if o.strip()]; adm = env['ADMIN_ORIGIN']
class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def out(self, code, body=b'', hdrs=None):
        self.send_response(code)
        for k, v in (hdrs or {}).items(): self.send_header(k, v)
        self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)
    def do_GET(self):
        if self.path == '/v1/health': self.out(200, b'{"status":"ok"}')
        elif self.path == '/v1/content': self.out(404, b'{"error":"not_published"}')
        elif self.path.startswith('/admin/v1/auth/me'): self.out(401, b'{"error":"unauthenticated"}')
        else: self.out(404, b'{}')
    def do_OPTIONS(self):
        o = self.headers.get('Origin'); h = {'Vary': 'Origin'}
        if self.path.startswith('/v1/') and o in pub: h['Access-Control-Allow-Origin'] = o
        if self.path.startswith('/admin/v1/'): h['Access-Control-Allow-Origin'] = adm; h['Access-Control-Allow-Credentials'] = 'true'
        self.out(204, b'', h)
http.server.ThreadingHTTPServer(('127.0.0.1', port), H).serve_forever()
EOF
cat > "$SB/bin/api-ctl" <<EOF
#!/bin/bash
[ -f "$SB/run/api.pid" ] && kill \$(cat "$SB/run/api.pid") 2>/dev/null; sleep 0.3
if [ -f "$SB/fail-api-once" ]; then rm -f "$SB/fail-api-once"; exit 0; fi   # simulate: service starts but never becomes healthy
nohup python3 "$SB/bin/fake-api.py" "$ENVF" >/dev/null 2>&1 &
echo \$! > "$SB/run/api.pid"; sleep 0.5
EOF
cat > "$SB/bin/systemctl" <<EOF
#!/bin/bash
case "\$1" in
  reload)   [ "\$2" = nginx ] && exec "$SB/bin/nginx" -c "$NG/nginx.conf" -s reload ;;
  is-active) for a in "\$@"; do n=\$a; done; [ "\$n" = nginx ] && kill -0 \$(cat "$SB/run/nginx.pid") 2>/dev/null; exit \$? ;;
  restart)  [ "\$2" = lattice-api ] && exec "$SB/bin/api-ctl" ;;
  show)     echo /etc/systemd/system/lattice-api.service ;;
  list-timers) echo "Mon 2026-11-10 snap.certbot.renew.timer snap.certbot.renew.service" ;;
esac
exit 0
EOF
cat > "$SB/bin/certbot" <<EOF
#!/bin/bash
LE="$LE"; SB="$SB"
case "\$1" in
  --version) echo "certbot 2.11.0"; exit 0 ;;
  show_account) exit 0 ;;
  renew) exit 0 ;;
  certonly) ;;
  *) exit 1 ;;
esac
echo "\$*" >> "\$SB/logs/certbot-calls.log"
shift; w= n= d= dry=0
while [ \$# -gt 0 ]; do case "\$1" in -w) w=\$2; shift;; --cert-name) n=\$2; shift;; -d) d=\$2; shift;; --dry-run) dry=1;; esac; shift; done
if [ -f "\$SB/fail-cert" ]; then echo "Certbot failed to authenticate some domains (simulated)"; exit 1; fi
tok=\$(openssl rand -hex 8); mkdir -p "\$w/.well-known/acme-challenge"; echo "\$tok" > "\$w/.well-known/acme-challenge/\$tok"
got=\$(curl -s -m 5 --resolve "\$d:80:127.0.0.1" "http://\$d/.well-known/acme-challenge/\$tok"); rm -f "\$w/.well-known/acme-challenge/\$tok"
[ "\$got" = "\$tok" ] || { echo "http-01 challenge failed (got '\$got')"; exit 1; }
[ \$dry = 1 ] && { echo "The dry run was successful."; exit 0; }
. /dev/null
a="\$LE/archive/\$n"; mkdir -p "\$a" "\$LE/live/\$n"
openssl req -newkey rsa:2048 -nodes -subj "/CN=\$d" -keyout "\$a/privkey1.pem" -out "\$a/r.csr" 2>/dev/null
openssl x509 -req -in "\$a/r.csr" -CA "\$SB/ca/ca.pem" -CAkey "\$SB/ca/ca.key" -CAcreateserial -days 90 -extfile <(printf 'subjectAltName=DNS:%s\n' "\$d") -out "\$a/cert1.pem" 2>/dev/null
cat "\$a/cert1.pem" "\$SB/ca/ca.pem" > "\$a/fullchain1.pem"; rm -f "\$a/r.csr"
ln -sfn "\$a/fullchain1.pem" "\$LE/live/\$n/fullchain.pem"; ln -sfn "\$a/privkey1.pem" "\$LE/live/\$n/privkey.pem"
printf 'authenticator = webroot\nwebroot_path = %s\nrenew_hook = systemctl reload nginx\n' "\$w" > "\$LE/renewal/\$n.conf"
echo "Successfully received certificate."
EOF
cat > "$SB/bin/npm" <<EOF
#!/bin/bash
. "$SB/bin/gen-builds.sh"
case "\$4" in
  @lattice/web)
    if [ -f "$SB/fail-build-web" ]; then rm -rf "$REPO/apps/web/out/_next"; echo "Error: simulated build failure (out/ half deleted)"; exit 1; fi
    gen_web "$REPO/apps/web/out" "\$NEXT_PUBLIC_API_URL" ;;
  @lattice/admin) gen_admin "$REPO/apps/admin/dist" "\$VITE_API_URL" ;;
  *) exit 1 ;;
esac
EOF
# node: on WSL, the Windows node.exe needs Windows paths.
cat > "$SB/bin/node" <<EOF
#!/bin/bash
args=()
for a in "\$@"; do
  if [[ "$NODE_REAL" == *.exe && "\$a" == /* && -e "\$a" ]]; then args+=("\$(wslpath -w "\$a")"); else args+=("\$a"); fi
done
exec "$NODE_REAL" "\${args[@]}"
EOF
chmod +x "$SB/bin/"*

export PATH="$SB/bin:$PATH"
export REPO NGINX_DIR=$NG LE_DIR=$LE API_ENV=$ENVF BACKUP_ROOT=$SB/backups ACME_ROOT=$SB/www/letsencrypt-zdu
export API_CONFIG_JS=$ROOT/apps/api/dist/config.js SUDO="" NGINX_BIN=$SB/bin/nginx NGINX_ARGS="-c $NG/nginx.conf" NODE_BIN=$SB/bin/node
export TEST_CURL_OPTS="--resolve $NEW:443:127.0.0.1 --resolve $NEW:80:127.0.0.1 --cacert $SB/ca/ca.pem"
export HOME=$SB

"$SB/bin/nginx" -c "$NG/nginx.conf" -t >/dev/null 2>&1 || { "$SB/bin/nginx" -c "$NG/nginx.conf" -t; echo "sandbox nginx config invalid"; exit 2; }
"$SB/bin/nginx" -c "$NG/nginx.conf"
"$SB/bin/api-ctl"
cleanup() { [ -f "$SB/run/nginx.pid" ] && kill "$(cat "$SB/run/nginx.pid")" 2>/dev/null; [ -f "$SB/run/api.pid" ] && kill "$(cat "$SB/run/api.pid")" 2>/dev/null; }
trap cleanup EXIT

S=$REPO/deploy/migrate-domain.sh
run() {  # name, then args; saves output
  local name=$1; shift
  LOG=$SB/logs/$name.log bash "$S" "$@" > "$SB/logs/$name.out" 2>&1; local rc=$?
  echo "$rc" > "$SB/logs/$name.rc"; return $rc
}
show_tail() { echo "      --- last lines of $1 ---"; tail -n "${2:-25}" "$SB/logs/$1.out" | sed 's/^/      /'; }
fingerprint() {  # everything the migration may touch, plus the whole nginx tree
  { (cd "$NG" && find . -type f -print0 | sort -z | xargs -0 sha256sum; find . -type l -printf '%p -> %l\n' | sort)
    sha256sum "$ENVF" | cut -c1-64
    (cd "$REPO/apps/web/out" && find . -type f -print0 | sort -z | xargs -0 sha256sum)
    (cd "$REPO/apps/admin/dist" && find . -type f -print0 | sort -z | xargs -0 sha256sum); } | sha256sum | cut -c1-64
}
tenants() { for h in baroplatform.onepercenttech.com shop.example.test; do
  printf '%s %s %s\n' "$h" "$(curl -s --cacert "$SB/ca/ca.pem" --resolve "$h:443:127.0.0.1" "https://$h/")" "$(curl -s --resolve "$h:80:127.0.0.1" "http://$h/" -o /dev/null -w '%{http_code}')"; done; }
old_ok() { [[ $(curl -s --cacert "$SB/ca/ca.pem" --resolve "$OLD:443:127.0.0.1" "https://$OLD/v1/health") == *ok* ]] && \
           [ "$(curl -s -o /dev/null -w '%{http_code}' --cacert "$SB/ca/ca.pem" --resolve "$OLD:443:127.0.0.1" "https://$OLD/")" = 200 ]; }
new_absent() { [ ! -e "$NG/sites-available/$NEW.conf" ] && [ ! -e "$NG/sites-enabled/$NEW.conf" ]; }
api_on_port() { [[ $(curl -s "http://127.0.0.1:$PORT/v1/health") == *ok* ]]; }
nginx_up() { kill -0 "$(cat "$SB/run/nginx.pid")" 2>/dev/null; }
grep_out() { grep -q -- "$2" "$SB/logs/$1.out"; }

echo "Sandbox: $SB"
BASE=$(fingerprint); TEN=$(tenants)
echo "Baseline: tenants -> $(echo $TEN)"
check "baseline: old site + API on port $PORT work" old_ok

echo; echo "T1 preflight (EXPECT_API_PORT=$PORT) is read-only"
EXPECT_API_PORT=$PORT run t1-preflight preflight; rc=$?
check "exit 0" test "$rc" = 0 || show_tail t1-preflight 40
check "nothing changed (nginx tree, api.env, builds)" test "$(fingerprint)" = "$BASE"
check "3 shadow nginx -t runs passed" test "$(grep -c 'PASS  shadow nginx -t' "$SB/logs/t1-preflight.out")" = 3
check "port 4310 detected from api.env and the live vhost" grep_out t1-preflight "proxies /v1/ and /admin/v1/ to 127.0.0.1:$PORT"

echo; echo "T2 preflight with the wrong expected port stops"
EXPECT_API_PORT=4100 run t2-port preflight; rc=$?
check "exit 1" test "$rc" = 1
check "explains the port mismatch" grep_out t2-port "but you expected 4100"
check "nothing changed" test "$(fingerprint)" = "$BASE"

echo; echo "T3 duplicate-directive guards"
echo "limit_req_zone \$binary_remote_addr zone=lattice_zdu:1m rate=1r/s;" > "$NG/conf.d/zz-clash.conf"
EXPECT_API_PORT=$PORT run t3a-zone preflight; check "existing zone lattice_zdu elsewhere -> stop" grep_out t3a-zone "limit_req_zone named lattice_zdu already exists"
rm -f "$NG/conf.d/zz-clash.conf"
printf 'server { listen 80; server_name %s; return 200; }\n' "$NEW" > "$NG/conf.d/zz-claim.conf"
EXPECT_API_PORT=$PORT run t3b-claim preflight; check "another file already claiming $NEW -> stop" grep_out t3b-claim "already appears in the nginx configuration"
rm -f "$NG/conf.d/zz-claim.conf"
printf 'server { listen 8089; server_name zone-user.test; location / { limit_req zone=lattice_api; return 200; } }\n' > "$NG/conf.d/zz-zoneuser.conf"
EXPECT_API_PORT=$PORT run t3c-zoneuse preflight; check "old site's zone used by another site -> stop (phase2 would break it)" grep_out t3c-zoneuse "is used by another file"
rm -f "$NG/conf.d/zz-zoneuser.conf"
check "nothing changed" test "$(fingerprint)" = "$BASE"

echo; echo "T4 phase1, certificate issuance fails -> full automatic revert"
touch "$SB/fail-cert"; EXPECT_API_PORT=$PORT run t4-cert phase1; rc=$?; rm -f "$SB/fail-cert"
check "exit 1" test "$rc" = 1
check "revert verified by the script" grep_out t4-cert "Revert verified"
check "nginx tree, api.env and builds identical to before" test "$(fingerprint)" = "$BASE"
check "no $NEW site left" new_absent
check "nginx running, old site fine" bash -c "kill -0 \$(cat $SB/run/nginx.pid) && true"; check "old site ok" old_ok
check "ACME webroot removed again" test ! -e "$SB/www/letsencrypt-zdu"

echo; echo "T5 phase1, web build fails half way (out/ partly deleted) -> builds restored"
touch "$SB/fail-build-web"; EXPECT_API_PORT=$PORT run t5-build phase1; rc=$?; rm -f "$SB/fail-build-web"
check "exit 1" test "$rc" = 1
check "builds restored and verified" grep_out t5-build "restored $REPO/apps/web/out (verified identical)"
check "everything identical to before" test "$(fingerprint)" = "$BASE"
check "old site ok" old_ok

echo; echo "T6 phase1, API does not come back after the env change -> api.env restored, API healthy"
touch "$SB/fail-api-once"; EXPECT_API_PORT=$PORT run t6-api phase1; rc=$?; rm -f "$SB/fail-api-once"
check "exit 1" test "$rc" = 1
check "api.env restored and API healthy" grep_out t6-api "api.env restored, API healthy"
check "everything identical to before" test "$(fingerprint)" = "$BASE"
check "API on $PORT healthy with old origins" api_on_port
check "old site ok" old_ok

echo; echo "T7 phase1 succeeds"
EXPECT_API_PORT=$PORT run t7-phase1 phase1; rc=$?
check "exit 0" test "$rc" = 0 || show_tail t7-phase1 60
check "all verify checks passed" grep_out t7-phase1 "ALL VERIFY CHECKS PASSED"
check "isolation: no other nginx file changed" grep_out t7-phase1 "no nginx file outside this site's own files changed"
check "other tenants answer exactly as before" test "$(tenants)" = "$TEN"
check "https://$NEW serves the new build with a valid cert" bash -c "curl -fsS --cacert $SB/ca/ca.pem --resolve $NEW:443:127.0.0.1 https://$NEW/ | grep -q 'home https://$NEW'"
check "API still on port $PORT" api_on_port
check "rendered site proxies to 127.0.0.1:$PORT" grep -q "proxy_pass http://127.0.0.1:$PORT;" "$NG/sites-available/$NEW.conf"
check "old site's file untouched in phase1" cmp -s "$NG/sites-available/$OLD.conf" "$(ls -d $SB/backups/2*/ | head -1)old-site.conf"
check "api.env: only PUBLIC_ORIGINS and ADMIN_ORIGIN changed" bash -c "diff <(grep -vE '^(PUBLIC_ORIGINS|ADMIN_ORIGIN)=' $ENVF) <(grep -vE '^(PUBLIC_ORIGINS|ADMIN_ORIGIN)=' $(ls -d $SB/backups/2*/ | tail -1)api.env) >/dev/null"
check "api.env origins" bash -c "grep -qx 'PUBLIC_ORIGINS=https://$NEW,https://$OLD' $ENVF && grep -qx 'ADMIN_ORIGIN=https://$NEW' $ENVF"
check "certbot used webroot only" grep -q -- "--webroot" "$SB/logs/certbot-calls.log"

cp "$NG/sites-available/$NEW.conf" "$SB/logs/rendered-$NEW.conf"
check "other-sites snapshot covers both other tenants" grep_out t7-phase1 "answer exactly as before (2 hostnames)"
echo; echo "T8 verify on its own"
run t8-verify verify; rc=$?
check "exit 0" test "$rc" = 0 || show_tail t8-verify 30
check "served JS is byte-identical to the local build" grep_out t8-verify "served /_next/static/chunks/app-"

echo; echo "T9 phase2"
EXPECT_API_PORT=$PORT run t9-phase2 phase2; rc=$?
check "exit 0" test "$rc" = 0 || show_tail t9-phase2 40
check "old host pages -> 301 to $NEW (path + query kept)" bash -c "[ \"\$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' --cacert $SB/ca/ca.pem --resolve $OLD:443:127.0.0.1 'https://$OLD/text/?q=1')\" = '301 https://$NEW/text/?q=1' ]"
check "old host API still answered (not redirected)" bash -c "curl -s --cacert $SB/ca/ca.pem --resolve $OLD:443:127.0.0.1 https://$OLD/v1/health | grep -q ok"
check "other tenants unchanged" test "$(tenants)" = "$TEN"
cp "$NG/sites-available/$OLD.conf" "$SB/logs/rendered-$OLD.conf"

echo; echo "T10 rollback -> exact pre-migration state"
run t10-rollback rollback; rc=$?
check "exit 0" test "$rc" = 0 || show_tail t10-rollback 30
check "nginx tree, api.env and builds byte-identical to the baseline" test "$(fingerprint)" = "$BASE"
check "script confirms /etc/nginx identical" grep_out t10-rollback "byte-identical to before the migration"
check "old site ok" old_ok; check "API on $PORT" api_on_port; check "nginx up" nginx_up
check "tenants unchanged" test "$(tenants)" = "$TEN"

echo; echo "T11 phase1 can run again after a rollback, and roll back again"
EXPECT_API_PORT=$PORT run t11a phase1; check "phase1 again: exit 0" test $? = 0 || show_tail t11a 30
run t11b rollback; check "rollback again: exit 0" test $? = 0
check "identical to the baseline" test "$(fingerprint)" = "$BASE"

echo; echo "T12 an interrupted phase1 blocks re-runs until rollback"
mkdir -p "$SB/backups"; echo "PHASE1=started" >> "$SB/backups/state"
EXPECT_API_PORT=$PORT run t12 phase1; check "phase1 refuses to start" grep_out t12 "run: bash deploy/migrate-domain.sh rollback"
rm -f "$SB/backups/state"
check "nothing changed" test "$(fingerprint)" = "$BASE"

echo; echo "RESULT: $PASSES passed, $FAILS failed   (sandbox and logs: $SB)"
[ "$FAILS" = 0 ]
