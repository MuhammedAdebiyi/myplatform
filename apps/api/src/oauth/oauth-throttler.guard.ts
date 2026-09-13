import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { throttleCheck } from '../common/throttler.js';

@Injectable()
export class OAuthThrottlerGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    await throttleCheck(`oauth:${req.ip}`, 60 * 60 * 1000, 20);
    return true;
  }
}
