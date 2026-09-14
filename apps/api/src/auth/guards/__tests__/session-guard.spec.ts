import { UnauthorizedException } from '@nestjs/common';
import { SessionGuard } from '../session.guard.js';

describe('SessionGuard: revoked session rejection', () => {
  it('rejects a token whose session has been revoked', async () => {
    // Mock AuthService.validateSession to return null (as it does for revoked sessions)
    const mockAuthService = {
      validateSession: jest.fn().mockResolvedValue(null),
    };

    const guard = new SessionGuard(mockAuthService as any);
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { authorization: 'Bearer abc123' },
        }),
      }),
    } as any;

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    expect(mockAuthService.validateSession).toHaveBeenCalledWith(expect.any(String));
  });

  it('allows a valid, non-revoked session', async () => {
    const mockAuthService = {
      validateSession: jest.fn().mockResolvedValue({
        sessionId: 'sess-1',
        userId: 'user-1',
        user: { id: 'user-1', email: 'test@test.com', name: 'Test', status: 'ACTIVE' },
      }),
    };

    const guard = new SessionGuard(mockAuthService as any);
    const mockRequest: any = {
      headers: { authorization: 'Bearer abc123' },
    };
    const context = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
    } as any;

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
    expect(mockRequest.user).toEqual({ id: 'user-1', email: 'test@test.com', name: 'Test', status: 'ACTIVE' });
    expect(mockRequest.sessionId).toBe('sess-1');
  });

  it('defers mp_-prefixed tokens to ApiKeyGuard (returns true without validation)', async () => {
    const mockAuthService = {
      validateSession: jest.fn(),
    };

    const guard = new SessionGuard(mockAuthService as any);
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { authorization: 'Bearer mp_apikey123' },
        }),
      }),
    } as any;

    const result = await guard.canActivate(context);
    expect(result).toBe(true);
    // validateSession should NOT be called for mp_ tokens
    expect(mockAuthService.validateSession).not.toHaveBeenCalled();
  });

  it('rejects when no Authorization header is present', async () => {
    const mockAuthService = { validateSession: jest.fn() };
    const guard = new SessionGuard(mockAuthService as any);
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ headers: {} }),
      }),
    } as any;

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });
});
