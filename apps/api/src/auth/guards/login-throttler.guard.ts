import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { throttleCheck } from '../../common/throttler.js';

@Injectable()
export class LoginThrottlerGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const email = req.body?.email ?? 'unknown';
    await throttleCheck(`login:${req.ip}:${email}`, 15 * 60 * 1000, 5);
    return true;
  }
}
