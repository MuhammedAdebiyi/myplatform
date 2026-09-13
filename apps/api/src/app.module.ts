import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { OAuthModule } from './oauth/oauth.module.js';
import { OrganizationsModule } from './organizations/organizations.module.js';
import { RbacModule } from './rbac/rbac.module.js';
import { ApiKeysModule } from './api-keys/api-keys.module.js';
import { ProjectsModule } from './projects/projects.module.js';
import { ServicesModule } from './services/services.module.js';

@Module({
  imports: [
    AuthModule,
    OAuthModule,
    OrganizationsModule,
    RbacModule,
    ApiKeysModule,
    ProjectsModule,
    ServicesModule,
  ],
})
export class AppModule {}
