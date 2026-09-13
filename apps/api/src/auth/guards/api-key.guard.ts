import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiKeysService } from '../../api-keys/api-keys.service.js';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedException();
    }

    if (!token.startsWith('mp_')) {
      return true;
    }

    const keyData = await this.apiKeysService.validateKey(token);
    if (!keyData) {
      throw new UnauthorizedException();
    }

    request.apiKeyContext = {
      organizationId: keyData.organizationId,
      permissions: keyData.permissions,
      authenticationMethod: 'API_KEY' as const,
    };

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
