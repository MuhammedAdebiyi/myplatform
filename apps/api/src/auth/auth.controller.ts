import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { EmailVerificationService } from '../email/email-verification.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { VerifyEmailDto } from './dto/verify-email.dto.js';
import { LoginThrottlerGuard } from './guards/login-throttler.guard.js';
import { RegisterThrottlerGuard } from './guards/register-throttler.guard.js';
import { ResendVerificationThrottlerGuard } from './guards/resend-verification-throttler.guard.js';
import { SessionGuard } from './guards/session.guard.js';
import { CurrentUser, CurrentSessionId } from './decorators/current-user.decorator.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly emailVerification: EmailVerificationService,
  ) {}

  @UseGuards(LoginThrottlerGuard)
  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: any) {
    return this.authService.login(
      dto,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @UseGuards(RegisterThrottlerGuard)
  @Post('register')
  register(@Body() dto: RegisterDto, @Req() req: any) {
    return this.authService.register(
      dto,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @UseGuards(SessionGuard)
  @Post('verify-email')
  verifyEmail(@Body() dto: VerifyEmailDto, @CurrentUser() user: CurrentUser) {
    return this.emailVerification.verify(user.id, dto.code);
  }

  @UseGuards(SessionGuard, ResendVerificationThrottlerGuard)
  @Post('resend-verification-code')
  resendVerificationCode(@CurrentUser() user: CurrentUser) {
    return this.emailVerification.resend({
      id: user.id,
      email: user.email,
      name: user.name,
    });
  }

  @UseGuards(SessionGuard)
  @Post('logout')
  logout(
    @CurrentSessionId() sessionId: string,
    @CurrentUser() user: CurrentUser,
    @Req() req: any,
  ) {
    return this.authService.logout(sessionId, user.id, req.ip, req.headers['user-agent']);
  }
}
