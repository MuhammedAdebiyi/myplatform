import { Module, forwardRef } from '@nestjs/common';
import { OAuthService } from './oauth.service.js';
import { OAuthController } from './oauth.controller.js';
import { AuditModule } from '../audit/audit.module.js';
import { AuthModule } from '../auth/auth.module.js';

@Module({
  imports: [AuditModule, forwardRef(() => AuthModule)],
  controllers: [OAuthController],
  providers: [OAuthService],
  exports: [OAuthService],
})
export class OAuthModule {}
