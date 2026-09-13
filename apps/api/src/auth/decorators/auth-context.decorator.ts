import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthContext {
  actorUserId?: string;
  actorApiKeyId?: string;
  authenticationMethod: 'SESSION' | 'API_KEY';
}

export const AuthContext = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): AuthContext => {
    const request = ctx.switchToHttp().getRequest();

    if (request.apiKeyContext) {
      return {
        authenticationMethod: 'API_KEY',
      };
    }

    return {
      actorUserId: request.user?.id,
      authenticationMethod: 'SESSION',
    };
  },
);
