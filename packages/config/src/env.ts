import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  // NOTE: JWT_SECRET was required-but-unused and has been removed. Sessions
  // are server-side (hashed tokens in the DB) — there is nothing to sign.
  GITHUB_APP_ID: z.string().optional(),
  // base64-encoded PEM of the GitHub App private key (matches .env.example
  // and the code that reads it — previously documented under the wrong name).
  GITHUB_APP_PRIVATE_KEY_BASE64: z.string().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().optional(),
  // URL slug of the GitHub App (installations/new link)
  GITHUB_APP_SLUG: z.string().optional(),
  // AES-256 key material for secret env vars (base64 32 bytes). Optional so
  // non-secret-only deployments boot; createEnvVar fails closed if missing.
  ENV_VAR_ENCRYPTION_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
    throw new Error('Invalid environment configuration');
  }
  return parsed.data;
}
