# Deployment

Three independently deployed parts. Nothing here has been deployed; these are the instructions and configuration.

```
public site (static, CDN)  ──GET content.json / POST events, feedback──▶  API (Node, Express)  ──▶  MongoDB (managed)
admin app (static, own subdomain)  ──credentialed, CSRF, 2FA──────────▶  API /admin/v1
```

## 1. MongoDB

- A managed cluster (for example MongoDB Atlas) in the region with the lowest latency to Somalia (measure first).
- Enable authentication, TLS and IP allow-listing to the API host only.
- Create one database user for the API with `readWrite` on the app database only.
- Turn on automated backups; run one restore test before launch (`npm run backup -w @lattice/api` / `-- --restore <folder>` into an empty database is the logical fallback).
- The API creates collections, `$jsonSchema` validators and indexes (including TTL retention) on start; it is idempotent.

## 2. API (`apps/api`)

```bash
npm ci
npm run build:shared
npm run build -w @lattice/api
NODE_ENV=production node apps/api/dist/server.js
```

Required environment (see `apps/api/.env.example`):

| Variable | Production value |
| --- | --- |
| `NODE_ENV` | `production` |
| `MONGODB_URI` / `MONGODB_DB` | the managed cluster connection string (TLS) |
| `PUBLIC_ORIGINS` | the public site origin, e.g. `https://lattice.example.org` |
| `ADMIN_ORIGIN` | the admin origin, e.g. `https://admin.lattice.example.org` |
| `TOTP_ENC_KEY` | 32 random bytes, base64 (required; the API refuses to start without it) |
| `COOKIE_SECURE` | `true` (required; the API refuses to start in production without HTTPS cookies) |
| `TRUST_PROXY` | number of proxies in front (usually `1`) |
| `REQUIRE_2FA` | `true` |
| `PUBLISH_DIR` | optional: folder synced to the CDN where `content.json` is written on publish |

Run behind HTTPS (the platform's TLS terminator or a reverse proxy). Health check: `GET /v1/health`. Keep the admin and public origins on the same registrable domain (for example `admin.example.org` and `api.example.org`) so the SameSite=Strict admin cookie is sent.

Create the first owner with `npm run admin:create` (see README). Owners and publishers must enable 2FA before they can publish or manage users.

## 3. Public site (`apps/web`)

```bash
NEXT_PUBLIC_API_URL=https://api.lattice.example.org npm run build -w @lattice/web
```

Upload `apps/web/out/` to a static host/CDN. `apps/web/public/_headers` contains the security headers for Netlify / Cloudflare Pages (replace the API origin in its CSP). For other CDNs, configure the same headers. `robots.txt` blocks indexing until launch approval.

## 4. Admin app (`apps/admin`)

```bash
VITE_API_URL=https://api.lattice.example.org npm run build -w @lattice/admin
```

Serve `apps/admin/dist/` on its own subdomain, never linked from the public site, with `X-Robots-Tag: noindex` and a strict CSP (`default-src 'self'; connect-src 'self' https://api.lattice.example.org; frame-ancestors 'none'`).

## 5. Before go-live

Work through [LAUNCH.md](LAUNCH.md). Technical readiness is not launch approval.
