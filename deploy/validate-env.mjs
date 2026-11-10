// Validates a candidate /etc/lattice/api.env (read from stdin) with the API's own config loader,
// plus the rules the domain migration needs. Prints key names and verdicts only, never values.
//
// Usage: node deploy/validate-env.mjs <apps/api/dist/config.js> <expected-port> <primary-origin> [<extra-public-origin>...]
// Exit code 0 = valid, 1 = invalid, 2 = usage error.
import { pathToFileURL } from 'node:url';

const [configPath, expectedPort, primary, ...extra] = process.argv.slice(2);
if (!configPath || !expectedPort || !primary) {
  console.error('usage: validate-env.mjs <config.js> <expected-port> <primary-origin> [extra-origin...]');
  process.exit(2);
}

const text = await new Promise((resolve, reject) => {
  let s = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (d) => (s += d));
  process.stdin.on('end', () => resolve(s));
  process.stdin.on('error', reject);
});

/** systemd EnvironmentFile subset: KEY=VALUE, blank lines, # comments, optional matching quotes. */
function parseEnv(src) {
  const env = {};
  for (const raw of src.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2];
    if (v.length >= 2 && ((v[0] === '"' && v.at(-1) === '"') || (v[0] === "'" && v.at(-1) === "'"))) v = v.slice(1, -1);
    env[m[1]] = v;
  }
  return env;
}

const env = parseEnv(text);
let cfg;
try {
  const { loadConfig } = await import(pathToFileURL(configPath).href);
  cfg = loadConfig(env);
} catch (e) {
  const detail = Array.isArray(e?.issues) ? e.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') : String(e?.message ?? e);
  console.log(`    FAIL  the API's config loader rejects the file (${detail})`);
  process.exit(1);
}

const ORIGIN = /^https:\/\/[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const checks = [
  ['API config loader accepts the file', true],
  ['NODE_ENV is production', cfg.env === 'production'],
  [`PORT is unchanged (${expectedPort})`, cfg.port === Number(expectedPort)],
  [`ADMIN_ORIGIN is exactly ${primary}`, cfg.adminOrigin === primary],
  [`PUBLIC_ORIGINS contains ${primary}`, cfg.publicOrigins.includes(primary)],
  ...extra.map((o) => [`PUBLIC_ORIGINS contains ${o}`, cfg.publicOrigins.includes(o)]),
  ['every origin is https://host (no path, slash, port or upper case)', [...cfg.publicOrigins, cfg.adminOrigin].every((o) => ORIGIN.test(o))],
  ['PUBLIC_ORIGINS has no duplicates', new Set(cfg.publicOrigins).size === cfg.publicOrigins.length],
  ['COOKIE_SECURE is true', cfg.cookieSecure === true],
  ['TRUST_PROXY is at least 1 (behind nginx)', cfg.trustProxy >= 1],
  ['MONGODB_URI is set', typeof cfg.mongoUri === 'string' && cfg.mongoUri.length > 0],
];
let failed = 0;
for (const [label, pass] of checks) {
  console.log(`    ${pass ? 'PASS' : 'FAIL'}  ${label}`);
  if (!pass) failed++;
}
if (!cfg.require2fa) console.log('    WARN  REQUIRE_2FA is false');
process.exit(failed ? 1 : 0);
