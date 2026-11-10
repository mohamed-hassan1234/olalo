# Security and privacy review

Scope: the code in this repository as of the delivery report. This is a self-review by the implementer, not an independent audit.

## Privacy model (what is and is not collected)

| Collected | Not collected |
| --- | --- |
| Anonymous event type, scene/world/station, device class, quality profile, language, optional QR poster code, minute-rounded server time | IP addresses (used transiently by the rate limiter only, in memory), user agents, cookies, persistent visitor IDs, fingerprints, names, contact details, voting intent |
| A once-per-day "new today" flag computed in the browser (local storage date only) | Any per-visitor record or session replay |
| Voluntary feedback answer (Haa / Qayb ahaan / Maya) and an optional comment scrubbed of numbers, emails, links and configured names | Any link between a feedback answer and other events |

Enforced in three layers: the Zod schemas reject unknown fields (`.strict()`), the MongoDB `$jsonSchema` validator on `events_raw` and `feedback` uses `additionalProperties: false`, and the report API returns totals only (no endpoint exposes raw events).

Retention: raw events 14 days (TTL index), hourly totals 90 days (TTL), daily totals 400 days (job; set this to "6 months after the election" in settings), feedback comments 90 days (job), sessions 8 h idle / 24 h absolute (TTL), audit log 1 year (TTL).

## Controls

| Area | Implementation | Verified by |
| --- | --- | --- |
| Passwords | Argon2id (19 MiB, t=2, p=1), ≥ 12 chars, common-password list, no email-name reuse | API tests |
| Sessions | 32-byte random token in an HttpOnly, SameSite=Strict, `Path=/admin` cookie (Secure in production); only its SHA-256 is stored; idle + absolute expiry; rotated per login; all sessions revoked on password change, disable, role change or 2FA reset | API tests |
| 2FA | TOTP (RFC 6238) required for publisher-level and owner actions; secrets AES-256-GCM encrypted at rest | API tests (enrol + login with code) |
| Lockout | 5 failures → 15 min account lock; generic errors; dummy hash for unknown accounts (timing) | API tests |
| CSRF | Synchroniser token on every admin write + Origin check | API tests |
| Authorisation | viewer < editor < publisher < owner, checked per route; two-person publishing rule; cannot demote/disable self or remove the last owner | API tests |
| Honesty rules | Pre-election only Proposed/Needs approval; completed needs evidence + date; verified facts need source + verifier; launch cannot be approved with placeholders | Shared + API tests |
| Input validation | Zod on every endpoint; body limits (64 KB public, 512 KB admin); MongoDB validators | Tests |
| Rate limiting | events 60/min, feedback 5/min, login 10/min per IP | API test (429) |
| Bot filtering | UA filter, burst filter; filtered counts reported, never stored per request | API tests |
| XSS | React escaping; no `dangerouslySetInnerHTML`; content is structured JSON; CSP | Code review |
| Headers | Helmet on the API (CSP `default-src 'none'`, HSTS in production, frame-ancestors none); `_headers` for the static site | Code review |
| Audit | Append-only `audit_log` for logins, failures, lockouts, content, users, settings, retention; truncated IPs | API tests |
| Secrets | `.env` files gitignored; production refuses to start without `TOTP_ENC_KEY` and Secure cookies; no default admin | Code review |
| Dependencies | `npm audit --omit=dev`: 0 vulnerabilities at delivery | Command output |

## Known gaps and accepted risks

1. The static site CSP needs `script-src 'unsafe-inline'` because a statically exported Next.js app inlines its bootstrap; no user HTML is ever rendered.
2. The breached-password check is a short local list, not a full breach corpus.
3. Rate limits and the feedback session de-duplication are in memory: with several API instances they become per-instance. Use a shared store (for example Redis) if scaling out.
4. TOTP codes are not replay-protected within their 90-second window.
5. Unique-visitor numbers are browser estimates (±20–30%) and are labelled as such.
6. No independent penetration test or OWASP ZAP scan has been run (ZAP is not installed in this environment).
