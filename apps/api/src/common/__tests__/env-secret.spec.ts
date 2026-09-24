import {
  decryptSecret,
  encryptSecret,
  isEncryptedValue,
  toPublicEnvVar,
  SECRET_MASK,
} from '../env-secret';
import type { EnvVar } from '@myplatform/database';

const KEY = Buffer.alloc(32, 7).toString('base64');

describe('env-secret (RULE 07)', () => {
  const prev = process.env.ENV_VAR_ENCRYPTION_KEY;

  beforeAll(() => {
    process.env.ENV_VAR_ENCRYPTION_KEY = KEY;
  });

  afterAll(() => {
    if (prev === undefined) delete process.env.ENV_VAR_ENCRYPTION_KEY;
    else process.env.ENV_VAR_ENCRYPTION_KEY = prev;
  });

  it('round-trips encrypt/decrypt', () => {
    const plain = 'sk_live_super_secret_123';
    const enc = encryptSecret(plain);
    expect(isEncryptedValue(enc)).toBe(true);
    expect(enc).not.toContain(plain);
    expect(decryptSecret(enc)).toBe(plain);
  });

  it('uses unique IVs (same plaintext → different ciphertext)', () => {
    const a = encryptSecret('same');
    const b = encryptSecret('same');
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe(decryptSecret(b));
  });

  it('fails closed when key missing', () => {
    delete process.env.ENV_VAR_ENCRYPTION_KEY;
    expect(() => encryptSecret('x')).toThrow(/ENV_VAR_ENCRYPTION_KEY/);
    process.env.ENV_VAR_ENCRYPTION_KEY = KEY;
  });

  it('rejects wrong-length keys', () => {
    process.env.ENV_VAR_ENCRYPTION_KEY = Buffer.alloc(16, 1).toString('base64');
    expect(() => encryptSecret('x')).toThrow(/32 bytes/);
    process.env.ENV_VAR_ENCRYPTION_KEY = KEY;
  });

  it('masks secret values on ordinary reads', () => {
    const row = {
      id: 'e1',
      serviceId: 's1',
      key: 'API_KEY',
      value: 'plaintext-should-not-leak',
      isSecret: true,
    } as EnvVar;
    const pub = toPublicEnvVar(row);
    expect(pub.value).toBe(SECRET_MASK);
    expect(pub.value).not.toContain('plaintext');
    expect(pub.isSecret).toBe(true);
    expect(pub.key).toBe('API_KEY');
  });

  it('leaves non-secret values readable', () => {
    const row = {
      id: 'e2',
      serviceId: 's1',
      key: 'API_BASE_URL',
      value: 'https://api.example.com',
      isSecret: false,
    } as EnvVar;
    expect(toPublicEnvVar(row).value).toBe('https://api.example.com');
  });

  it('treats legacy plaintext as decryptable (server-side only)', () => {
    expect(decryptSecret('legacy-plaintext')).toBe('legacy-plaintext');
  });
});
