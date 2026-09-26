import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { throttleCheck } from '../../common/throttler.js';

/**
 * Resend verification code: 3 per hour per user.
 * Each call is a real email through NotificationHub (cost per send) and a
 * brute-force surface on the 6-digit code — key by user id, not IP.
 */
@Injectable()
export class ResendVerificationThrottlerGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const userId = req.user?.id;
    if (!userId) {
      // SessionGuard runs first; reaching here means no session context.
      throw new UnauthorizedException();
    }
    await throttleCheck(`resend-verification:${userId}`, 60 * 60 * 1000, 3);
    return true;
  }
}
