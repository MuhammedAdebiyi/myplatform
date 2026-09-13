import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { throttleCheck } from '../common/throttler.js';

@Injectable()
export class ApiKeysThrottlerGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const tracker = req.apiKeyContext?.organizationId ?? req.user?.id ?? req.ip;
    await throttleCheck(`api-keys:${tracker}`, 60 * 60 * 1000, 10);
    return true;
  }
}
