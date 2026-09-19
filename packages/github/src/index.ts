import jwt from 'jsonwebtoken';
import { randomBytes, createHmac, timingSafeEqual } from 'node:crypto';

// ─── App JWT ───────────────────────────────────────────────

export interface GitHubAppConfig {
  appId: number;
  privateKey: string; // PEM-decoded private key (NOT base64)
}

/**
 * Generate a short-lived JWT (expires in 10 min) for GitHub App authentication.
 * Per GitHub's spec: header alg=RS256, payload { iat, exp, iss }.
 */
export function generateAppJwt(config: GitHubAppConfig): string {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    { iat: now - 60, exp: now + 600, iss: config.appId },
    config.privateKey,
    { algorithm: 'RS256' },
  );
}

// ─── Installation Access Token ─────────────────────────────

export interface InstallationAccessToken {
  token: string;
  expiresAt: Date;
  permissions: Record<string, string>;
  repositorySelection: string;
}

/**
 * Exchange an App JWT for an installation-scoped access token.
 * Tokens are ~1hr lived and scoped to a single installation.
 * NEVER persisted to DB — generate on demand per RULE 07.
 *
 * @param appJwt - A valid JWT from generateAppJwt()
 * @param installationId - GitHub's installation ID
 */
export async function createInstallationAccessToken(
  appJwt: string,
  installationId: number,
): Promise<InstallationAccessToken> {
  const response = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${appJwt}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `GitHub installation token exchange failed (${response.status}): ${body}`,
    );
  }

  const data = (await response.json()) as {
    token: string;
    expires_at: string;
    permissions: Record<string, string>;
    repository_selection: string;
  };

  return {
    token: data.token,
    expiresAt: new Date(data.expires_at),
    permissions: data.permissions,
    repositorySelection: data.repository_selection,
  };
}

// ─── GitHub API helpers ────────────────────────────────────

export interface GitHubInstallationInfo {
  id: number;
  account: { login: string; type: string };
  target_type: string;
  repository_selection: string;
}

/**
 * Fetch installation details from GitHub using the App JWT.
 * Used during the callback flow to verify the installation exists
 * and get the account info.
 */
export async function getInstallationInfo(
  appJwt: string,
  installationId: number,
): Promise<GitHubInstallationInfo> {
  const response = await fetch(
    `https://api.github.com/app/installations/${installationId}`,
    {
      headers: {
        Authorization: `Bearer ${appJwt}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `GitHub get installation info failed (${response.status}): ${body}`,
    );
  }

  return response.json() as Promise<GitHubInstallationInfo>;
}

export interface GitHubInstallationReposResponse {
  total_count: number;
  repositories: Array<{
    id: number;
    name: string;
    full_name: string;
    private: boolean;
    default_branch: string;
  }>;
}

/**
 * List repositories accessible by an installation.
 * Uses installation access token (not App JWT).
 */
export async function listInstallationRepos(
  installationToken: string,
): Promise<GitHubInstallationReposResponse> {
  const response = await fetch(
    'https://api.github.com/installation/repositories',
    {
      headers: {
        Authorization: `Bearer ${installationToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `GitHub list installation repos failed (${response.status}): ${body}`,
    );
  }

  return response.json() as Promise<GitHubInstallationReposResponse>;
}

// ─── Webhook signature verification ────────────────────────

/**
 * Verify X-Hub-Signature-256 against a shared secret using timing-safe comparison.
 * Returns true if the signature is valid, false otherwise.
 */
export function verifyWebhookSignature(
  payload: string | Buffer,
  signatureHeader: string | undefined,
  secret: string,
): boolean {
  if (!signatureHeader) return false;

  const expectedPrefix = 'sha256=';
  if (!signatureHeader.startsWith(expectedPrefix)) return false;

  const signatureHex = signatureHeader.slice(expectedPrefix.length);
  const signatureBytes = Buffer.from(signatureHex, 'hex');

  const hmac = createHmac('sha256', secret).update(payload).digest();

  if (signatureBytes.length !== hmac.length) return false;

  return timingSafeEqual(signatureBytes, hmac);
}

// ─── State generation (CSRF protection for installation flow) ───

export function generateInstallationState(): string {
  return randomBytes(32).toString('base64url');
}
