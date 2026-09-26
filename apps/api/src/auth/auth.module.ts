import { Module, forwardRef } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { SessionGuard } from './guards/session.guard.js';
import { ApiKeyGuard } from './guards/api-key.guard.js';
import { LoginThrottlerGuard } from './guards/login-throttler.guard.js';
import { RegisterThrottlerGuard } from './guards/register-throttler.guard.js';
import { ResendVerificationThrottlerGuard } from './guards/resend-verification-throttler.guard.js';
import { ForgotPasswordThrottlerGuard } from './guards/forgot-password-throttler.guard.js';
import { ResetPasswordThrottlerGuard } from './guards/reset-password-throttler.guard.js';
import { PasswordResetService } from './password-reset.service.js';
import { AuditModule } from '../audit/audit.module.js';
import { ApiKeysModule } from '../api-keys/api-keys.module.js';
import { UsersModule } from '../users/users.module.js';
import { EmailVerificationService } from '../email/email-verification.service.js';
import { NotificationHubService } from '../email/notification-hub.service.js';

@Module({
  // UsersModule ⇄ AuthModule: UsersModule needs SessionGuard from here, and
  // PasswordResetService needs SessionsService from there (revokeAll on
  // reset). forwardRef on both edges — same pattern as ⇄ ApiKeysModule.
  imports: [
    AuditModule,
    forwardRef(() => ApiKeysModule),
    forwardRef(() => UsersModule),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    SessionGuard,
    ApiKeyGuard,
    LoginThrottlerGuard,
    RegisterThrottlerGuard,
    ResendVerificationThrottlerGuard,
    ForgotPasswordThrottlerGuard,
    ResetPasswordThrottlerGuard,
    PasswordResetService,
    EmailVerificationService,
    NotificationHubService,
  ],
  exports: [AuthService, SessionGuard, ApiKeyGuard],
})
export class AuthModule {}
