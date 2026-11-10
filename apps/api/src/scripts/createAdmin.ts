/**
 * Creates an admin account. There is no default administrator: run this once per person.
 *
 *   ADMIN_PASSWORD='…' npm run admin:create -w @lattice/api -- --email you@example.org --role owner
 *
 * The password is read from ADMIN_PASSWORD or, if unset, from the first line of stdin.
 */
import { createInterface } from 'node:readline';
import { loadConfig } from '../config.js';
import { connect, ensureSchema, type Role } from '../db.js';
import { hashPassword, passwordProblem } from '../lib/passwords.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function readPassword(): Promise<string> {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  process.stdout.write('Password (min 12 chars): ');
  const rl = createInterface({ input: process.stdin });
  const line = await new Promise<string>((resolve) => rl.once('line', resolve));
  rl.close();
  return line.trim();
}

async function main() {
  const email = arg('email')?.toLowerCase();
  const role = (arg('role') ?? 'viewer') as Role;
  if (!email || !/^[^@\s]+@[^@\s]+$/.test(email)) throw new Error('--email is required');
  if (!['viewer', 'editor', 'publisher', 'owner'].includes(role)) throw new Error('--role must be viewer|editor|publisher|owner');
  const password = await readPassword();
  const problem = passwordProblem(password, email);
  if (problem) throw new Error(problem);
  const cfg = loadConfig();
  const d = await connect(cfg.mongoUri, cfg.mongoDb);
  try {
    await ensureSchema(d);
    if (await d.c.users.findOne({ email })) throw new Error('That email already has an account.');
    await d.c.users.insertOne({
      email, passwordHash: await hashPassword(password), role, disabled: false, mustChangePassword: false,
      totpEnabled: false, failedLogins: 0, createdAt: new Date(),
    });
    await d.c.audit.insertOne({ ts: new Date(), action: 'users.created_cli', target: email, summary: `role ${role}`, requestId: 'cli', ipPrefix: 'local' });
    console.log(`Created ${role} ${email}. Sign in to the admin app and enable two-factor authentication.`);
  } finally {
    await d.client.close();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
