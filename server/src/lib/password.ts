import { hash, verify } from '@node-rs/argon2';

/**
 * Password hashing with argon2id.
 *
 * Chosen over bcrypt because it is memory-hard: an attacker with GPUs gains far
 * less advantage. Parameters follow the OWASP recommendation of 19 MiB memory,
 * 2 iterations and 1 degree of parallelism, which costs roughly 50ms per hash
 * on a typical Render instance - slow enough to matter, fast enough to log in.
 */
/**
 * `Algorithm.Argon2id` is an ambient const enum, which `verbatimModuleSyntax`
 * refuses to import. 2 is the value that enum member compiles to.
 */
const ARGON2ID = 2;

const ARGON2_OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19_456, // KiB
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, ARGON2_OPTIONS);
}

/**
 * Verifies a password. Returns false rather than throwing on a malformed hash,
 * so a corrupt record reads as "wrong password" instead of a 500.
 */
export async function verifyPassword(hashed: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashed, plain, ARGON2_OPTIONS);
  } catch {
    return false;
  }
}
