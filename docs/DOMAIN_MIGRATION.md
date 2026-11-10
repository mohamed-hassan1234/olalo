# Domain migration: zakariye.elivateict.com → zdu.elivateict.com

New primary domain: **https://zdu.elivateict.com/**. The old hostname becomes a permanent redirect (phase 2).
Server: shared Ubuntu VPS `104.237.2.66` (other sites live on it), nginx, app in `/var/www/zakariye`,
API `lattice-api` on `127.0.0.1:<PORT from /etc/lattice/api.env>` (4310 on this VPS).

## State found on 2026-11-10 (before any server change)

| Check | Result |
| --- | --- |
| Authoritative NS for `elivateict.com` | `dns1.registrar-servers.com`, `dns2.registrar-servers.com` (Namecheap BasicDNS) |
| `zdu` A record (both authoritative NS, 1.1.1.1, 8.8.8.8, 9.9.9.9, local default resolver) | `104.237.2.66`, all agree. No AAAA record. |
| `zakariye` A record | **missing** (NXDOMAIN on both authoritative NS). The old site is unreachable by name. |
| `https://zdu.elivateict.com/` | served by another site's default vhost (`CN=baroplatform.onepercenttech.com`) |
| Built JS on the server | hard-codes `https://zakariye.elivateict.com` as the API origin, so web + admin must be rebuilt |

The domain is not hard-coded in the application source: it is baked in at build time (`NEXT_PUBLIC_API_URL`,
`VITE_API_URL`) and read at runtime from `/etc/lattice/api.env` (`PUBLIC_ORIGINS`, `ADMIN_ORIGIN`).

## How the script works (`deploy/migrate-domain.sh`)

| Command | Changes | What it does |
| --- | --- | --- |
| `preflight` | nothing | DNS, nginx health, finds the one file serving the old host, checks the API port (api.env = live `proxy_pass` = listening socket = `EXPECT_API_PORT`), validates api.env with the API's own loader, checks certbot, **runs `nginx -t` for every planned config on a copy of `/etc/nginx`**, shows the config diff, records how every other site on the server answers |
| `phase1` | new zdu site, cert, api.env origins, web/admin build | backup → HTTP-only zdu site → ACME reachability probe → `certbot certonly --webroot` (dry run first) → rebuild web + admin → validated api.env change → restart `lattice-api` only → full HTTPS site → isolation checks → `verify` |
| `verify` | nothing | TLS chain + hostname, http→https, pages, 404, served files byte-identical to the build, no old origin, no mixed content, API health/content, CORS allowed/refused, admin auth required, `certbot renew --dry-run`, renewal timer |
| `phase2` | the old site's own file | re-verifies, then old host: pages and `/console/` → `301 https://zdu.elivateict.com$request_uri`; `/v1/` and `/admin/v1/` still proxied |
| `rollback` | restores | old site file, removes zdu site, api.env, web + admin builds, then proves `/etc/nginx` is byte-identical to the pre-migration snapshot |
| `rollback-phase2` | restores | only the old site file |
| `render` | nothing | prints the configs it would install |

Safety properties:

1. **Other sites are never modified.** It writes only `sites-available/zdu.elivateict.com.conf`, its `sites-enabled` link,
   and (phase2 only) the one file that serves `zakariye.elivateict.com`. Every other file under `/etc/nginx` is checksummed
   before and after; any difference stops the run and reverts. Other sites' HTTP answers are compared before and after.
   certbot runs in `--webroot` mode, so it edits no nginx file. nginx is only reloaded, never restarted.
2. **No duplicate directives.** The new site declares its own zone `lattice_zdu`; the old site's `lattice_api` zone is left alone.
   Preflight stops if `lattice_zdu` already exists, if any other file already claims `zdu.elivateict.com`, or if another
   site uses a zone that phase2 would remove. `nginx -t` warnings about conflicting server names also stop it.
3. **Backups before any change** in `/var/backups/lattice-domain-migration/<timestamp>-<pid>/` (root-only): full
   `etc-nginx.tgz`, checksum manifest of `/etc/nginx`, the old site file, `api.env`, `web-out`, `admin-dist`, git HEAD.
   The backup is verified (tar readable, build copies hash-identical) before continuing.
4. **Rollback restores everything it changed**: nginx site files, api.env (and restarts the API), both build outputs
   (verified hash-identical), and the ACME directory if it created it. It does not restore other sites' files from the tarball,
   so later changes by other tenants are never overwritten.
5. **No partial state.** Each step registers an undo action. A failure in certificate issuance, a build, the env change, the API
   restart or an nginx test reverts everything done so far, then checks `/etc/nginx` is byte-identical to before the run.
   An interrupted run (SSH drop, Ctrl-C) blocks re-runs until `rollback`. Run inside `tmux`.
6. **api.env is validated** by the API's own `loadConfig` plus migration rules (https origins without path or slash,
   `ADMIN_ORIGIN` exactly the new origin, `PORT` unchanged, `COOKIE_SECURE=true`, `TRUST_PROXY≥1`); only `PUBLIC_ORIGINS`
   and `ADMIN_ORIGIN` may differ from the original file. Secrets are never printed.
7. **Origin checks without false failures**: scans the built files on disk (new origin present, old origin absent), then checks
   that nginx serves exactly those bytes (`/`, `/console/`, the JS file containing the origin, the admin bundle).
8. **Port and data**: the port is read, cross-checked and never written; MongoDB is never touched.
9. Every failure prints the failed step, the reason, what was reverted, whether the revert was verified, and the next command.
10. **Tested without the server**: `deploy/test/sandbox-test.sh` runs every command against a disposable copy of a
    shared-VPS layout with a real nginx binary (58 checks, including injected failures). See "Test" below.

## Commands on the VPS

```bash
tmux new -s migrate        # or: tmux attach -t migrate
cd /var/www/zakariye && git pull --ff-only
EXPECT_API_PORT=4310 bash deploy/migrate-domain.sh preflight
```

Read the preflight output (especially the config diff and the list of other sites). Then:

```bash
EXPECT_API_PORT=4310 bash deploy/migrate-domain.sh phase1
```

Check https://zdu.elivateict.com/ in a normal browser on desktop and phone: the scenes, the 3D worlds, feedback, and
signing in at `/console/` (the admin session cookie is per hostname, so sign in again). If the certbot account has no email:
prefix the command with `CERTBOT_EMAIL=you@example.org`. Then, optionally:

```bash
EXPECT_API_PORT=4310 bash deploy/migrate-domain.sh phase2
```

Each run writes a log to `~/lattice-migrate-<command>-<timestamp>.log`.

## DNS actions (Namecheap → Domain List → elivateict.com → Advanced DNS)

- `zdu` A `104.237.2.66`: already correct, leave it.
- `zakariye`: the record is gone, so old links and printed QR codes fail. To make phase2's redirect reachable (and let certbot
  keep renewing the old certificate, which expires 2027-02-08), add **A, Host `zakariye`, Value `104.237.2.66`, TTL 5 min**.
- Do not touch the other records.

## Rollback

```bash
bash deploy/migrate-domain.sh rollback            # everything (phase1 + phase2)
bash deploy/migrate-domain.sh rollback-phase2     # only the redirect
```

The `zdu.elivateict.com` certificate is kept (harmless). Remove it with `sudo certbot delete --cert-name zdu.elivateict.com`.
Last resort: the full original `/etc/nginx` is in `<backup>/etc-nginx.tgz`. Restoring it overwrites other sites' later
changes, so extract single files from it rather than the whole archive.

## Test (no server involved)

On any Linux or WSL machine, as root, with an nginx binary (no install needed, e.g. `apt-get download nginx nginx-common`
and `dpkg -x` into a folder):

```bash
NGINX_REAL=/path/usr/sbin/nginx NGINX_MIME=/path/etc/nginx/mime.types NODE_REAL=$(command -v node) bash deploy/test/sandbox-test.sh
```

It covers: read-only preflight, wrong expected port, three duplicate/conflict guards, certificate failure, half-finished build
failure, API not coming back, successful phase1 + verify, phase2, rollback to a byte-identical state, a second
phase1/rollback cycle, and an interrupted run. It was run with nginx 1.28 and both gawk and mawk (Ubuntu's default awk).

## QR code

`docs/qr/zdu-elivateict-com.png` encodes `https://zdu.elivateict.com/` (error correction M, verified by decoding).
Scan it with a phone after phase1. Keep printed material unchanged until the new domain is confirmed from several networks.
