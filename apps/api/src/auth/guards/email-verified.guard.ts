import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

/**
 * Security boundary (RULE 01/25) for email/password signups: a session token
 * minted at register works directly against the API, so the frontend redirect
 * to /verify-email is UX only — this guard is what actually blocks tenant
 * mutations until the address is verified. OAuth users are born verified
 * (emailVerified=true at creation), so they never hit it.
 *
 * Placement: per-controller, immediately AFTER SessionGuard (which populates
 * request.user for session tokens) and before ApiKeyGuard/OrganizationGuard.
 *
 * Exemptions:
 *  - API-key requests (Bearer mp_…): SessionGuard defers mp_ tokens, so by the
 *    time we run the token prefix is the reliable signal (ApiKeyGuard has not
 *    run yet and request.apiKeyContext is unset). Keys are only creatable by
 *    verified users once this guard covers api-key creation, so possession of
 *    a valid key already proves verification at issuance.
 *  - No Bearer token at all: the request is not session-authenticated — either
 *    a route-level guard upstream already rejected it (SessionGuard runs first
 *    everywhere we are wired), or it is authenticated by another mechanism
 *    (e.g. GitHub webhook signature on routes where this guard is not used).
 */
@Injectable()
export class EmailVerifiedGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const token = extractBearerToken(request);

    if (!token || token.startsWith('mp_')) {
      return true;
    }

    const user = request.user;
    if (!user || user.emailVerified === true) {
      return true;
    }

    throw new ForbiddenException({
      statusCode: 403,
      error: 'EMAIL_NOT_VERIFIED',
      message: 'Email address not verified',
    });
  }
}

function extractBearerToken(request: any): string | null {
  const auth = request.headers?.authorization;
  if (!auth) return null;
  const [scheme, token] = auth.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token;
}
