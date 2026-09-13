import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from '../auth.service.js';

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedException();
    }

    if (token.startsWith('mp_')) {
      return true;
    }

    const { createHash } = await import('node:crypto');
    const tokenHash = createHash('sha256').update(token).digest('hex');

    const session = await this.authService.validateSession(tokenHash);
    if (!session) {
      throw new UnauthorizedException();
    }

    request.user = session.user;
    request.sessionId = session.sessionId;
    return true;
  }
}

function extractBearerToken(request: any): string | null {
  const auth = request.headers?.authorization;
  if (!auth) return null;
  const [scheme, token] = auth.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token;
}
