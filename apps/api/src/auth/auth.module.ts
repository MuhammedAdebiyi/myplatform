import { Module, forwardRef } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { SessionGuard } from './guards/session.guard.js';
import { ApiKeyGuard } from './guards/api-key.guard.js';
import { LoginThrottlerGuard } from './guards/login-throttler.guard.js';
import { AuditModule } from '../audit/audit.module.js';
import { ApiKeysModule } from '../api-keys/api-keys.module.js';

@Module({
  imports: [AuditModule, forwardRef(() => ApiKeysModule)],
  controllers: [AuthController],
  providers: [AuthService, SessionGuard, ApiKeyGuard, LoginThrottlerGuard],
  exports: [AuthService, SessionGuard, ApiKeyGuard],
})
export class AuthModule {}
