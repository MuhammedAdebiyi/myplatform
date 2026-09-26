import argon2 from 'argon2';
import { randomInt } from 'node:crypto';

// Same argon2id parameters as passwords: a 6-digit code has only 1e6
// combinations, so fast hashes (sha256/bcrypt) would fall to offline
// brute force instantly if the DB leaked. Attempts are capped online;
// argon2 covers the offline case.
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
};

export function generateVerificationCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

export async function hashVerificationCode(code: string): Promise<string> {
  return argon2.hash(code, ARGON2_OPTIONS);
}

export async function verifyVerificationCode(
  code: string,
  hash: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, code, ARGON2_OPTIONS);
  } catch {
    return false;
  }
}
