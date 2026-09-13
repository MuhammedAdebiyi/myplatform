import { randomBytes, createHash } from 'node:crypto';

const SESSION_TOKEN_BYTES = 32;
const SESSION_EXPIRY_DAYS = 30;

export interface SessionToken {
  raw: string;
  hash: string;
  prefix: string;
}

export function generateSessionToken(): SessionToken {
  const raw = randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
  const hash = createHash('sha256').update(raw).digest('hex');
  const prefix = raw.slice(0, 8);
  return { raw, hash, prefix };
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function sessionExpiresAt(): Date {
  const now = new Date();
  now.setDate(now.getDate() + SESSION_EXPIRY_DAYS);
  return now;
}
