import argon2 from 'argon2';

/** OWASP-recommended Argon2id parameters (19 MiB, 2 iterations, parallelism 1). */
const OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

/** A short list of the most common breached passwords; a full breached-password check is a documented follow-up. */
const COMMON = new Set([
  'password1234', 'password12345', '123456789012', 'qwertyuiop12', 'iloveyou1234', 'adminadmin12', 'welcome12345',
  'passwordpassword', '111111111111', 'abc123456789', 'somalia12345', 'hormuud12345', 'mogadishu123',
]);

export function passwordProblem(pw: string, email?: string): string | null {
  if (pw.length < 12) return 'Password must be at least 12 characters.';
  if (pw.length > 200) return 'Password is too long.';
  if (COMMON.has(pw.toLowerCase())) return 'Password is too common.';
  if (email && pw.toLowerCase().includes(email.split('@')[0]!.toLowerCase())) return 'Password must not contain your email name.';
  if (new Set(pw).size < 5) return 'Password is too repetitive.';
  return null;
}

export const hashPassword = (pw: string) => argon2.hash(pw, OPTIONS);
export async function verifyPassword(hash: string, pw: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, pw);
  } catch {
    return false;
  }
}

/** Hash used to keep login timing similar when the account does not exist. */
let dummy: string | undefined;
export async function dummyVerify(pw: string): Promise<void> {
  dummy ??= await argon2.hash('not-a-real-password-xyz', OPTIONS);
  await verifyPassword(dummy, pw);
}
