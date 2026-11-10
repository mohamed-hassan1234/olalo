# Delivery report: The Lattice (technical implementation)

Date: 2026-11-10 · Repository: this folder (local git repo, nothing committed or pushed) · ~8,000 lines of TypeScript.

**Bottom line:** all ten scenes, the three interactive 3D worlds, the API, the MongoDB layer and the admin dashboard are implemented and verified by automated tests against the real stack, with screenshots of the running application. **Public launch remains BLOCKED**: every candidate fact, initiative and milestone is a labelled placeholder, and the approvals in [LAUNCH.md](LAUNCH.md) do not exist yet. Real-device performance and production deployment have **not** been verified.

## 1. Feature status matrix

| Area | Feature | Status | Evidence / note |
| --- | --- | --- | --- |
| Scene 01 | Entrance: identity, portrait frame, holographic ?, ENTER, sound, settings, language, reduced motion, text link | COMPLETE | e2e + axe; paints with no WebGL. Portrait shows a labelled placeholder until an approved photo exists. Logo shows "LOGO TBC" |
| Scene 02 | Real-time Awakening (darkness → light → Nexus seams → rings → three bridges), GSAP camera, Skip from 0 s | COMPLETE | e2e screenshot `02-awakening`; LITE / reduced motion use a 1.2 s cut |
| Scene 03 | Hub: three portals, guided orbit (swipe, arrows, ← →, tap 3D world), return navigation | COMPLETE | e2e (orbit both ways, keyboard) |
| Scene 04 | Waxbarasho: instanced crystal helix (300–2,400 shards), light column, 4 plinths with live canvas-drawn holographic panels, shard assembly animation, station sheets | COMPLETE | e2e screenshots `04a`, `04b` |
| Scene 05 | Midnimo: 7 hex platforms, agora, shader-animated emerald filaments that stay lit once explored (device-local only) | COMPLETE | e2e asserts "1 / 7 lit" |
| Scene 06 | Hoggaan: deck, geodesic dome, transparent Ledger Pillar, station pylons, roadmap ring | COMPLETE | e2e screenshot `06` |
| Scene 07 | Roadmap: 3D ring with status-shaped nodes, swipe/next/prev, filters, mission cards (7 fields), accessible list with timeline | COMPLETE | e2e: navigation, list view, asserts no "Completed" status shown |
| Scene 08 | Profile: portrait, tabs (bio, academics, experience, philosophy, activities, initiatives); only verified facts shown as fact | COMPLETE (placeholders) | Content BLOCKED until supplied and verified |
| Scene 09 | Optional feedback (Haa / Qayb ahaan / Maya + comment), not-a-vote notice, once per session, aggregate only | COMPLETE | e2e submits against the API; API tests cover dedupe, honeypot, scrubbing |
| Scene 10 | Exit: pull-back to the lattice, revisit, manifesto, share (link + title only), exit | COMPLETE | Manifesto shows "not yet published" (no PDF supplied) |
| 3D | Procedural authored geometry, PBR + emissive materials, procedural image-based lighting, fog, sky, instanced skyline/shards, custom GLSL (reveal, arc draw-on, energy flow, glow), camera rig, bloom (HIGH) | COMPLETE | Screenshots. Software-rendered in tests |
| 3D | Blender-modelled assets and baked lightmaps | NOT STARTED | Blender is not installed here; all geometry is procedural code |
| Quality | HIGH / BALANCED / LITE / TEXT detection, live frame-rate step-down, manual lock | COMPLETE | Unit tests; observed live downgrade under software GL |
| Audio | Original synthesized cues and beds (Web Audio), off by default | COMPLETE | Not reviewed by a sound designer; no third-party audio |
| i18n | Somali / English throughout | PARTIAL | Somali strings are drafts needing native review |
| Text mode | `/text` plus `/profile`, `/roadmap`, `/about`; all content without WebGL | COMPLETE | e2e + axe on all four pages |
| Responsive | Phone portrait (Pixel 7) and desktop (1440×900) | COMPLETE | e2e on both |
| Responsive | Phone landscape, tablets, real low-end Android, real iPhones | NOT STARTED | Not tested; no devices available |
| API | Public ingestion, bot/burst filter, rate limits, feedback, content snapshot, health | COMPLETE | 21 API tests on a real MongoDB |
| API | Admin auth (Argon2id, sessions, lockout), TOTP 2FA, CSRF, RBAC, password change, user management | COMPLETE | API tests |
| API | Content versions, validation rules, two-person publish, rollback, publish lock, audit log, settings, retention | COMPLETE | API tests |
| MongoDB | 9 collections, `$jsonSchema` validators, indexes, TTL retention, retention job | COMPLETE | Tests confirm validator rejects extra fields and TTL values |
| MongoDB | Backup / restore script | PARTIAL | Script written; a backup + restore drill was not executed |
| Admin | Sign-in, overview (traffic, unique estimate, funnel, worlds, stations, performance, errors, feedback, sources, alerts), comments, content, users, audit, settings, account/2FA | COMPLETE | e2e: wrong-password, owner sign-in, live aggregates, axe. 2FA enrolment is tested at API level, not through the browser UI |
| Admin | DEMO DATA seeding with banner | COMPLETE | `seed:demo` refuses production; dashboard shows the banner when present |
| Security | Headers, CSP, HSTS (prod), secrets handling, no default admin | COMPLETE | See [SECURITY.md](SECURITY.md) |
| Security | Independent scan (OWASP ZAP / pentest) | NOT STARTED | Tool not available here |
| Performance | Entrance budget ≤ 250 KB | PARTIAL | 245 KB gzipped HTML+CSS+JS; self-hosted fonts add ~100 KB |
| Performance | Real-device frame rate, memory, thermal | NOT STARTED | Only software-rendered headless measurements exist |
| Deployment | Production deployment | NOT STARTED | Config and instructions in [DEPLOYMENT.md](DEPLOYMENT.md) |
| Launch | Public launch | BLOCKED | Permissions, election-rule confirmation, verified content, photo, manifesto |

## 2. Repository structure

See the table in the [README](../README.md). Key modules: `packages/shared/src/content.ts` (honesty rules), `apps/api/src/routes/*`, `apps/api/src/services/aggregation.ts`, `apps/web/src/three/*`, `apps/web/src/components/overlays.tsx`, `apps/admin/src/App.tsx`.

## 3. Build and test results (run in this environment)

| Check | Result |
| --- | --- |
| `npm run lint` (ESLint 10, typescript-eslint, React hooks, Next rules) | 0 problems |
| `npm run typecheck` (all workspaces, TypeScript 5.9 strict) | 0 errors |
| Shared unit tests (Vitest) | 11 / 11 passed |
| API integration tests (Vitest + Supertest + embedded MongoDB 8.2.6) | 21 / 21 passed |
| Web unit tests | 7 / 7 passed |
| Admin unit tests | 2 / 2 passed |
| Production builds: shared, API (tsc), web (Next static export, 6 routes), admin (Vite) | all succeed |
| Playwright e2e, mobile + desktop (22 runs: journey, entrance + axe, reduced motion + keyboard, language, no-WebGL fallback, 4 static pages + axe, admin ×2) | 22 / 22 passed across runs. One full-suite run had the mobile journey time out while unit tests and builds ran in parallel; it passed when re-run alone (2.6 min). Software WebGL makes it timing-sensitive |
| `npm audit --omit=dev` | 0 vulnerabilities |
| `npm audit` (including dev tools) | 10 moderate, all in lint tooling via `minimatch` (not shipped) |

Fixes made because of these checks: button contrast (white on `#2E8BFF` was 3.4:1, now `#1F6FE0` at 4.8:1); feedback card overlapping the hub's Enter button; preview ribbon overlapping the header; three.js leaking into the entrance bundle (500 → 245 KB); camera shots placed inside light-bridges (washed-out frames); black metal surfaces (added procedural environment lighting); admin percentile display and alert layout.

## 4. Screenshots

`docs/screenshots/` holds 28 captures of the actual application (14 mobile, 14 desktop), taken by the e2e suite: entrance, awakening, hub, Waxbarasho (overview and station), Midnimo, Hoggaan, roadmap ring and list, profile, feedback, exit, text mode, admin. They are software-rendered (SwiftShader), so lighting and anti-aliasing will look better on a real GPU.

## 5. Known limitations

1. Placeholder content everywhere candidate-specific; nothing is presented as verified.
2. No Blender assets or baked lightmaps; environments are procedural.
3. Somali copy is draft quality.
4. No real-device testing; quality thresholds are starting hypotheses.
5. Fonts push the entrance over the 250 KB budget by about 100 KB (subsetting is the fix).
6. Rate limits and feedback de-duplication are in memory (single API instance).
7. The admin's 2FA enrolment UI shows the secret and otpauth URI as text (no QR code).
8. Documented security gaps in [SECURITY.md](SECURITY.md).

## 6. Run, deploy, launch

- Local run and quality commands: [README](../README.md)
- Deployment configuration: [DEPLOYMENT.md](DEPLOYMENT.md)
- Outstanding launch approvals: [LAUNCH.md](LAUNCH.md)
