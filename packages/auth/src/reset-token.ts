import { randomBytes, createHash } from 'node:crypto';

// Password reset credentials are LINK tokens, not human-typed codes —
// 32 bytes (256 bits) of entropy. Unlike the 6-digit verification code
// (~20 bits, needs argon2id to survive offline brute force), a token
// this size is unguessable by construction, so we hash it with sha256
// exactly like session tokens (see session.ts): the entropy does the
// work, a slow hash would only burn CPU on every legitimate lookup.
const RESET_TOKEN_BYTES = 32;
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

export interface PasswordResetToken {
  raw: string;
  hash: string;
}

export function generatePasswordResetToken(): PasswordResetToken {
  const raw = randomBytes(RESET_TOKEN_BYTES).toString('base64url');
  const hash = createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}

export function hashPasswordResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function passwordResetExpiresAt(): Date {
  return new Date(Date.now() + RESET_TOKEN_TTL_MS);
}
