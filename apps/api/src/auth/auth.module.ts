import { Module } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { SessionGuard } from './guards/session.guard.js';
import { ApiKeyGuard } from './guards/api-key.guard.js';
import { AuditModule } from '../audit/audit.module.js';
import { ApiKeysModule } from '../api-keys/api-keys.module.js';

@Module({
  imports: [AuditModule, ApiKeysModule],
  controllers: [AuthController],
  providers: [AuthService, SessionGuard, ApiKeyGuard],
  exports: [AuthService, SessionGuard, ApiKeyGuard],
})
export class AuthModule {}
