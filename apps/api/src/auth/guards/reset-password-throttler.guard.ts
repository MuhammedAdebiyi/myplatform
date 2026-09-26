import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { throttleCheck } from '../../common/throttler.js';

/**
 * Reset password: token is 256-bit entropy (unguessable), but the endpoint
 * is public and each attempt costs a DB round trip — a per-IP backstop
 * (10 per 15 min) keeps it from being a hammering surface, same pattern as
 * the login guard.
 */
@Injectable()
export class ResetPasswordThrottlerGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    await throttleCheck(`reset-password:ip:${req.ip}`, 15 * 60 * 1000, 10);
    return true;
  }
}
