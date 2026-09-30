// Env var secret handling now lives in @myplatform/auth (shared with
// worker-deploy, which decrypts at container start). This module re-exports
// it plus the API-only masking helpers.
export {
  encryptSecret,
  decryptSecret,
  isEncryptedValue,
} from '@myplatform/auth';

import type { EnvVar } from '@myplatform/database';

/** Ordinary list/read mask — matches UI "••••••••" and API-key create-once pattern. */
export const SECRET_MASK = '••••••••';

export type PublicEnvVar = Omit<EnvVar, 'value'> & { value: string };

export function toPublicEnvVar(row: EnvVar): PublicEnvVar {
  if (row.isSecret) {
    return { ...row, value: SECRET_MASK };
  }
  return { ...row };
}

export function toPublicEnvVars(rows: EnvVar[]): PublicEnvVar[] {
  return rows.map(toPublicEnvVar);
}
