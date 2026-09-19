import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module.js';
import { OAuthModule } from './oauth/oauth.module.js';
import { OrganizationsModule } from './organizations/organizations.module.js';
import { RbacModule } from './rbac/rbac.module.js';
import { ApiKeysModule } from './api-keys/api-keys.module.js';
import { ProjectsModule } from './projects/projects.module.js';
import { ServicesModule } from './services/services.module.js';
import { UsersModule } from './users/users.module.js';
import { GitHubModule } from './github/github.module.js';

@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [
        {
          name: 'default',
          ttl: 60_000,
          limit: 100,
          getTracker: async (req: Record<string, any>) => {
            if (req.user?.id) return req.user.id;
            if (req.apiKeyContext?.organizationId) return req.apiKeyContext.organizationId;
            return req.ip;
          },
        },
      ],
    }),
    AuthModule,
    OAuthModule,
    OrganizationsModule,
    RbacModule,
    ApiKeysModule,
    ProjectsModule,
    ServicesModule,
    UsersModule,
    GitHubModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
