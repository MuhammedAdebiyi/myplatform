import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { throttleCheck } from '../../common/throttler.js';

/**
 * Forgot password: PUBLIC endpoint, so the throttle keys can't be per-user
 * (no session exists — the user is locked out by definition).
 *
 * Two limits, mirroring the identical-429 rule from login throttling:
 *  - per email (3/hour): stops hammering one target account. Keyed on the
 *    submitted email BEFORE any lookup, so the 429 fires identically for
 *    existing and non-existing accounts — no enumeration oracle.
 *  - per IP (10/hour, looser): backstop against spraying many emails from
 *    one source.
 *
 * Runs before ValidationPipe (guards precede pipes in Nest), so coerce the
 * body defensively and normalize the email key (case-variations share budget).
 */
@Injectable()
export class ForgotPasswordThrottlerGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const email = String(req.body?.email ?? '')
      .trim()
      .toLowerCase();

    await throttleCheck(`forgot-password:email:${email}`, 60 * 60 * 1000, 3);
    await throttleCheck(`forgot-password:ip:${req.ip}`, 60 * 60 * 1000, 10);
    return true;
  }
}
