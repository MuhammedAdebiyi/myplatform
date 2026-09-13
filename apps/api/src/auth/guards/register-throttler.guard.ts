import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { throttleCheck } from '../../common/throttler.js';

@Injectable()
export class RegisterThrottlerGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    throttleCheck(`register:${req.ip}`, 60 * 60 * 1000, 3);
    return true;
  }
}
