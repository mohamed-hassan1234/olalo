# Zakariye Digital Universe — The Lattice

A cinematic, mobile-first 3D web experience (Waxbarasho · Midnimo · Hoggaan) with an anonymous-analytics API and a private admin dashboard.

> **Status: technically implemented, NOT approved for public launch.** The site ships with clearly labelled placeholder content and a visible "preview build" ribbon. Launch is blocked until the approvals in [docs/LAUNCH.md](docs/LAUNCH.md) exist.

## Repository layout

| Path | What it is |
| --- | --- |
| `packages/shared` | Content model (Zod), honesty rules, analytics event schema, UI strings (Somali/English), default placeholder content |
| `apps/web` | Public site: Next.js 16 static export + React Three Fiber. Scenes 01–10, text mode, `/profile`, `/roadmap`, `/about` |
| `apps/web/src/three` | 3D modules: Nexus, bridges, environment, the three worlds, camera rig, Awakening timeline, frame-rate guard |
| `apps/web/src/components` | HTML overlays (every 3D action has an accessible HTML control), content views, UI primitives |
| `apps/api` | Express 5 + TypeScript + MongoDB: public ingestion, feedback, content snapshot, admin auth/RBAC/2FA, reports, publishing, audit, retention |
| `apps/admin` | Separate Vite + React admin app (own origin): sign-in, reports, feedback, content publishing/rollback, users, audit, settings |
| `e2e` | Playwright end-to-end + axe accessibility tests (mobile and desktop) |
| `docs` | Deployment, security, launch checklist, delivery report, screenshots |

## Requirements

- Node.js ≥ 20.19 (developed on 22.14), npm 10
- MongoDB 7+ for production. For local work no install is needed: the dev script starts an embedded MongoDB (`mongodb-memory-server`; first run downloads the official binary, ~540 MB on Windows).

## Run locally

```bash
npm install
npm run build:shared
```

1. API on an embedded database (port 4000). Optional: copy `apps/api/.env.example` to `apps/api/.env`; `DEV_ADMIN_EMAIL` / `DEV_ADMIN_PASSWORD` there create one local owner.

```bash
npm run dev:memory -w @lattice/api
```

2. Public site (port 3000):

```bash
npm run dev:web
```

3. Admin app (port 5173):

```bash
npm run dev:admin
```

Create an admin against any database (there is no default administrator):

```bash
ADMIN_PASSWORD='a-long-unique-passphrase' npm run admin:create -w @lattice/api -- --email you@example.org --role owner
```

Optional demo data for reviewing the dashboard (refused in production; labelled DEMO DATA in the UI):

```bash
npm run seed:demo -w @lattice/api
```

## Quality checks

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run e2e
```

`npm test` runs the shared, API (against a real embedded MongoDB), web and admin unit/integration suites. `npm run e2e` builds nothing itself: build first, then it starts (or reuses) the API, the static site and the admin preview.

Quality profiles can be forced for testing with `?quality=high|balanced|lite|text`.

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md), [docs/SECURITY.md](docs/SECURITY.md) and [docs/DELIVERY_REPORT.md](docs/DELIVERY_REPORT.md).
