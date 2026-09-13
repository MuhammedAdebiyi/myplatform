import { randomBytes, createHash } from 'node:crypto';

const API_KEY_BYTES = 32;
const API_KEY_PREFIX = 'mp_';

export interface ApiKeyResult {
  raw: string;
  prefix: string;
  hash: string;
}

export function generateApiKey(): ApiKeyResult {
  const rawBytes = randomBytes(API_KEY_BYTES);
  const raw = API_KEY_PREFIX + rawBytes.toString('base64url');
  const hash = createHash('sha256').update(raw).digest('hex');
  const prefix = raw.slice(0, 12);
  return { raw, prefix, hash };
}

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}
