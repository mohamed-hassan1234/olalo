# Domain migration: zakariye.elivateict.com → zdu.elivateict.com

New primary domain: **https://zdu.elivateict.com/**. The old hostname becomes a permanent redirect.
Server: Ubuntu VPS `104.237.2.66`, nginx 1.24, app in `/var/www/zakariye`, API `lattice-api` on `127.0.0.1:4100`.

## State found on 2026-11-10 (before any server change)

| Check | Result |
| --- | --- |
| Authoritative NS for `elivateict.com` | `dns1.registrar-servers.com`, `dns2.registrar-servers.com` (Namecheap BasicDNS) |
| `zdu` A record (both authoritative NS, 1.1.1.1, 8.8.8.8, 9.9.9.9, local default resolver) | `104.237.2.66`, all agree. No AAAA record. |
| `zakariye` A record | **missing** (NXDOMAIN on both authoritative NS). The old site is currently unreachable by name. |
| `http://zdu.elivateict.com/` | 301 → https (nginx catch-all) |
| `https://zdu.elivateict.com/` | **wrong site/cert**: served by another site's default vhost (`CN=baroplatform.onepercenttech.com`) |
| Old vhost when forced to the IP | works: valid cert `CN=zakariye.elivateict.com` (until 2027-02-08), `/v1/health` = ok |
| Built JS on the server | hard-codes `https://zakariye.elivateict.com` as the API origin → web + admin must be rebuilt |

Nothing in the application source hard-codes the domain. It is baked in only at build time (`NEXT_PUBLIC_API_URL`,
`VITE_API_URL` from `deploy/deploy.sh`) and read at runtime from `/etc/lattice/api.env` (`PUBLIC_ORIGINS`, `ADMIN_ORIGIN`).
There is no canonical URL, Open Graph URL, sitemap or share URL with a hostname in the code; `robots.txt` has no hostname.

## Repository changes

| File | Change |
| --- | --- |
| `deploy/deploy.sh` | default `DOMAIN` → `https://zdu.elivateict.com` |
| `deploy/nginx/zdu.elivateict.com.conf` | site config (renamed from the old file; only `server_name` changed; rate-limit zone moved out) |
| `deploy/nginx/lattice-ratelimit.conf` | new: `limit_req_zone lattice_api`, installed in `conf.d` so two site files can share it |
| `deploy/nginx/zakariye.elivateict.com.conf` | now the old-host config: 301 to the new domain for pages, assets and `/console/`; `/v1/` and `/admin/v1/` stay proxied |
| `deploy/migrate-domain.sh` | new: `preflight`, `phase1`, `verify`, `phase2`, `rollback` |
| `docs/DEPLOY_VPS.md` | new domain throughout |
| `docs/qr/zdu-elivateict-com.png` | QR code for `https://zdu.elivateict.com/` (decoded and verified) |

## What you run on the server

SSH in as your deploy user (password login; Claude has no access), then:

```bash
cd /var/www/zakariye && git pull --ff-only
bash deploy/migrate-domain.sh preflight
bash deploy/migrate-domain.sh phase1
```

`phase1` does, stopping on the first failure:

1. Backs up `/etc/nginx` and `/etc/lattice/api.env` to `/var/backups/lattice-domain-migration/<timestamp>/`.
2. Moves the `lattice_api` rate-limit zone to `/etc/nginx/conf.d/lattice-ratelimit.conf` (comments out the line in the old site file).
3. Installs `zdu.elivateict.com.conf`, runs `nginx -t`, reloads (and restores the backup automatically if the test fails).
4. `certbot --nginx -d zdu.elivateict.com --redirect` (Let's Encrypt, HTTP-01), checks that the served cert covers zdu.
5. Sets `PUBLIC_ORIGINS=https://zdu.elivateict.com,https://zakariye.elivateict.com` and `ADMIN_ORIGIN=https://zdu.elivateict.com`.
6. Rebuilds only `@lattice/web` and `@lattice/admin` for the new origin; restarts only `lattice-api`; reloads nginx.
   MongoDB, the database credentials and the API port are not touched.
7. Runs `verify`: pages, `/console/`, `/v1/health`, `/v1/content`, CORS preflight for `/v1/feedback` (allowed for zdu,
   refused for a foreign origin), admin API requires auth, built JS references only zdu, certificate, `certbot renew --dry-run`.

Then open https://zdu.elivateict.com/ in a normal browser (desktop and phone) and walk through the scenes, the three 3D worlds,
feedback and the admin console (sign in again at `https://zdu.elivateict.com/console/`; the session cookie is per hostname).

When that looks right:

```bash
bash deploy/migrate-domain.sh phase2
```

`phase2` replaces the old site file with the redirect config (pages → `301 https://zdu.elivateict.com$request_uri`;
API routes still served), runs `nginx -t` (restores the old file on failure) and checks the redirect.

## DNS actions for you (Namecheap → Domain List → elivateict.com → Advanced DNS)

- `zdu` A `104.237.2.66`: **already correct, leave it.**
- `zakariye`: the record is gone, so every old link and printed QR code currently fails. If old links should keep working,
  add **A, Host `zakariye`, Value `104.237.2.66`, TTL 5 min**. This is also needed for certbot to keep renewing the
  old certificate (it expires 2027-02-08). If you drop the old hostname for good, skip `phase2` instead.
- Do not touch the other records.

## Rollback

```bash
cd /var/www/zakariye && bash deploy/migrate-domain.sh rollback
```

Restores `/etc/nginx` and `api.env` from the first backup of the migration, removes the zdu site and the conf.d file, reloads nginx,
restarts `lattice-api` and rebuilds web + admin for `https://zakariye.elivateict.com`. To undo only `phase2`:
`sudo cp /etc/nginx/sites-available/zakariye.elivateict.com.conf.pre-redirect /etc/nginx/sites-available/zakariye.elivateict.com.conf && sudo nginx -t && sudo systemctl reload nginx`.
In git: `git revert` the migration commit.

## QR code

`docs/qr/zdu-elivateict-com.png` encodes `https://zdu.elivateict.com/` (33 modules plus quiet zone, error correction M).
It was checked by decoding the PNG and a blurred, downscaled copy. Scan it with a phone after phase1, and keep printed material
unchanged until the new domain is confirmed from several networks.
