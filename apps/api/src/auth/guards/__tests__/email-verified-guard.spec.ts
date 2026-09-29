/**
 * EmailVerifiedGuard — RULE 01/25 security boundary unit tests.
 *
 * The guard blocks unverified email/password sessions from tenant-mutating
 * routes with a stable error code, while never standing in front of API-key
 * auth (mp_ tokens) or tokenless requests (authenticated upstream or by other
 * mechanisms such as webhook signatures).
 */
import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { EmailVerifiedGuard } from '../email-verified.guard.js';

function ctx(headers: Record<string, string | undefined>): ExecutionContext {
  const req = { headers };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

const bearer = (token: string) => ctx({ authorization: `Bearer ${token}` });

function bearerFor(token: string, user?: object): ExecutionContext {
  const c = bearer(token);
  (c as any).switchToHttp().getRequest().user = user;
  return c;
}

describe('EmailVerifiedGuard', () => {
  const guard = new EmailVerifiedGuard();

  it('blocks an unverified session token with stable code EMAIL_NOT_VERIFIED', () => {
    expect.assertions(4);
    try {
      guard.canActivate(
        bearerFor('sess_unverified', { id: 'u1', emailVerified: false }),
      );
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenException);
      const body = (err as ForbiddenException).getResponse() as any;
      expect(body.statusCode).toBe(403);
      expect(body.error).toBe('EMAIL_NOT_VERIFIED');
      expect(body.message).toBe('Email address not verified');
    }
  });

  it('allows a verified session token (OAuth users are born verified)', () => {
    expect(
      guard.canActivate(bearerFor('sess_verified', { id: 'u2', emailVerified: true })),
    ).toBe(true);
  });

  it('exempts API-key tokens (mp_ prefix) — not session-authenticated here', () => {
    expect(guard.canActivate(bearer('mp_live_abc123'))).toBe(true);
  });

  it('allows tokenless requests — upstream SessionGuard/webhook guards decide', () => {
    expect(guard.canActivate(ctx({}))).toBe(true);
  });

  it('allows when request.user is absent (SessionGuard not wired on this route)', () => {
    expect(guard.canActivate(bearer('sess_unknown_user'))).toBe(true);
  });

  it('rejects non-Bearer authorization schemes as tokenless (fail open to upstream)', () => {
    expect(guard.canActivate(ctx({ authorization: 'Basic dXNlcjpwYXNz' }))).toBe(true);
  });
});
