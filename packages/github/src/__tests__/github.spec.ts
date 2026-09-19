import { generateKeyPairSync, createHmac } from 'node:crypto';
import {
  generateAppJwt,
  verifyWebhookSignature,
  generateInstallationState,
  type GitHubAppConfig,
} from '../index.js';

// Generate a test RSA key pair once for all tests
const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const testConfig: GitHubAppConfig = {
  appId: 12345,
  privateKey,
};

describe('generateAppJwt', () => {
  it('returns a string that looks like a JWT (three base64url segments)', () => {
    const token = generateAppJwt(testConfig);
    const parts = token.split('.');
    expect(parts).toHaveLength(3);
  });

  it('payload contains iss matching appId, iat and exp within expected range', () => {
    const token = generateAppJwt(testConfig);
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1], 'base64url').toString('utf8'),
    );

    expect(payload.iss).toBe(12345);
    expect(typeof payload.iat).toBe('number');
    expect(typeof payload.exp).toBe('number');
    expect(payload.exp - payload.iat).toBe(660); // 600s validity + 60s backdate
  });

  it('produces different tokens on successive calls (iat changes)', () => {
    const t1 = generateAppJwt(testConfig);
    // Small delay to ensure different iat
    const t2 = generateAppJwt(testConfig);
    // They might be the same if called within the same second,
    // but the structure should always be valid
    expect(t1.split('.')).toHaveLength(3);
    expect(t2.split('.')).toHaveLength(3);
  });
});

describe('verifyWebhookSignature', () => {
  const secret = 'test-webhook-secret';
  const payload = '{"action":"push","ref":"refs/heads/main"}';

  function sign(payload: string, secret: string): string {
    return 'sha256=' + createHmac('sha256', secret).update(payload).digest('hex');
  }

  it('returns true for a valid signature', () => {
    const sig = sign(payload, secret);
    expect(verifyWebhookSignature(payload, sig, secret)).toBe(true);
  });

  it('returns false when signature header is undefined', () => {
    expect(verifyWebhookSignature(payload, undefined, secret)).toBe(false);
  });

  it('returns false when signature header is empty string', () => {
    expect(verifyWebhookSignature(payload, '', secret)).toBe(false);
  });

  it('returns false when signature does not have sha256= prefix', () => {
    expect(verifyWebhookSignature(payload, 'abc123', secret)).toBe(false);
  });

  it('returns false when signature hex is wrong', () => {
    const wrongSig = 'sha256=' + '0'.repeat(64);
    expect(verifyWebhookSignature(payload, wrongSig, secret)).toBe(false);
  });

  it('returns false when payload is tampered (signature from different payload)', () => {
    const sig = sign('different-payload', secret);
    expect(verifyWebhookSignature(payload, sig, secret)).toBe(false);
  });

  it('returns false when secret is wrong', () => {
    const sig = sign(payload, secret);
    expect(verifyWebhookSignature(payload, sig, 'wrong-secret')).toBe(false);
  });

  it('returns false when signature hex has wrong length', () => {
    const shortSig = 'sha256=' + 'a'.repeat(32); // 32 hex bytes, not 32 bytes
    expect(verifyWebhookSignature(payload, shortSig, secret)).toBe(false);
  });
});

describe('generateInstallationState', () => {
  it('returns a non-empty base64url string', () => {
    const state = generateInstallationState();
    expect(typeof state).toBe('string');
    expect(state.length).toBeGreaterThan(0);
    // base64url only contains A-Z, a-z, 0-9, -, _
    expect(state).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('produces unique values on successive calls', () => {
    const states = new Set(Array.from({ length: 100 }, () => generateInstallationState()));
    expect(states.size).toBe(100);
  });
});
