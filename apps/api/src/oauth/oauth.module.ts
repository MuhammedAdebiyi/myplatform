import { Module } from '@nestjs/common';
import { OAuthService } from './oauth.service.js';
import { OAuthController } from './oauth.controller.js';
import { AuditModule } from '../audit/audit.module.js';

@Module({
  imports: [AuditModule],
  controllers: [OAuthController],
  providers: [OAuthService],
  exports: [OAuthService],
})
export class OAuthModule {}
