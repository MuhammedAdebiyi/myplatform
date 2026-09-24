import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { EnvVar } from '@myplatform/database';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const PREFIX = 'enc:v1:';

/** Public shape returned by ordinary API responses (secrets never include plaintext after create). */
export type PublicEnvVar = Omit<EnvVar, 'value'> & { value: string };

function getKey(): Buffer {
  const raw = process.env.ENV_VAR_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'ENV_VAR_ENCRYPTION_KEY is not set (base64-encoded 32-byte key required to store secret env vars)',
    );
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('ENV_VAR_ENCRYPTION_KEY must decode to exactly 32 bytes');
  }
  return key;
}

export function isEncryptedValue(value: string): boolean {
  return value.startsWith(PREFIX);
}

export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
}

export function decryptSecret(stored: string): string {
  if (!isEncryptedValue(stored)) {
    // Legacy plaintext rows (pre-encryption). Still usable server-side only.
    return stored;
  }
  const key = getKey();
  const [ivB64, tagB64, dataB64] = stored.slice(PREFIX.length).split(':');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error('Malformed encrypted env var value');
  }
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new Error('Malformed encrypted env var value');
  }
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

/** Ordinary list/read mask — matches UI “••••••••” and API-key create-once pattern. */
export const SECRET_MASK = '••••••••';

export function toPublicEnvVar(row: EnvVar): PublicEnvVar {
  if (row.isSecret) {
    return { ...row, value: SECRET_MASK };
  }
  return { ...row };
}

export function toPublicEnvVars(rows: EnvVar[]): PublicEnvVar[] {
  return rows.map(toPublicEnvVar);
}
