import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { prisma, ActorType } from '@myplatform/database';
import {
  generateVerificationCode,
  hashVerificationCode,
  verifyVerificationCode,
} from '@myplatform/auth';
import { AuditService } from '../audit/audit.service.js';
import { NotificationHubService } from './notification-hub.service.js';
import {
  renderVerificationCodeEmail,
  renderAccountActivatedEmail,
} from './email-templates.js';

const CODE_TTL_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function appUrl(): string {
  return (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
}

@Injectable()
export class EmailVerificationService {
  private readonly logger = new Logger(EmailVerificationService.name);

  constructor(
    private readonly audit: AuditService,
    private readonly notificationHub: NotificationHubService,
  ) {}

  /**
   * Issue + send a verification code. Called on password registration.
   * Never throws on NotificationHub failure (account creation must not
   * depend on email delivery) — returns whether the send succeeded.
   */
  async issueCode(user: { id: string; email: string; name: string }): Promise<{ sent: boolean }> {
    const code = generateVerificationCode();
    const codeHash = await hashVerificationCode(code);

    // One live code per user: kill anything outstanding before storing.
    await prisma.emailVerificationCode.updateMany({
      where: { userId: user.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    const row = await prisma.emailVerificationCode.create({
      data: {
        userId: user.id,
        codeHash,
        expiresAt: new Date(Date.now() + CODE_TTL_MS),
      },
      select: { id: true },
    });

    const email = renderVerificationCodeEmail({
      name: user.name,
      code,
      appUrl: appUrl(),
    });

    const result = await this.notificationHub.sendEmail({
      recipientEmail: user.email,
      subject: email.subject,
      html: email.html,
      type: 'verification-code',
      idempotencyKey: `verify-email:${row.id}`,
    });

    // RULE 07: metadata never contains the code, hashed or otherwise.
    this.audit.log({
      actorType: ActorType.USER,
      actorUserId: user.id,
      action: 'user.email_verification_sent',
      resourceType: 'User',
      resourceId: user.id,
      metadata: { channel: 'email', sent: result.sent, type: 'verification-code' },
    });

    if (!result.sent) {
      this.logger.warn(`verification email not delivered for user ${user.id}: ${result.error}`);
    }
    return { sent: result.sent };
  }

  async verify(userId: string, code: string): Promise<{ verified: true }> {
    const active = await prisma.emailVerificationCode.findFirst({
      where: {
        userId,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!active) {
      this.audit.log({
        actorType: ActorType.USER,
        actorUserId: userId,
        action: 'user.email_verification_failed_attempt',
        resourceType: 'User',
        resourceId: userId,
        metadata: { reason: 'no_active_code' },
      });
      throw new BadRequestException('No active verification code. Request a new one.');
    }

    const ok = await verifyVerificationCode(code, active.codeHash);

    if (!ok) {
      const attempts = active.attempts + 1;
      const locked = attempts >= MAX_ATTEMPTS;

      await prisma.emailVerificationCode.update({
        where: { id: active.id },
        data: locked
          ? // Invalidate entirely — no further guesses on this code.
            { attempts, consumedAt: new Date() }
          : { attempts },
      });

      this.audit.log({
        actorType: ActorType.USER,
        actorUserId: userId,
        action: 'user.email_verification_failed_attempt',
        resourceType: 'User',
        resourceId: userId,
        metadata: { reason: 'wrong_code', attempts, locked },
      });

      if (locked) {
        throw new BadRequestException('Too many wrong attempts. Request a new code.');
      }
      throw new BadRequestException('Incorrect code.');
    }

    const [, user] = await prisma.$transaction([
      prisma.emailVerificationCode.update({
        where: { id: active.id },
        data: { consumedAt: new Date() },
      }),
      prisma.user.update({
        where: { id: userId },
        data: { emailVerified: true },
        select: { id: true, email: true, name: true },
      }),
    ]);

    this.audit.log({
      actorType: ActorType.USER,
      actorUserId: userId,
      action: 'user.email_verified',
      resourceType: 'User',
      resourceId: userId,
      metadata: { channel: 'email' },
    });

    // Confirmation email — best effort, verification already committed.
    const email = renderAccountActivatedEmail({ name: user.name, appUrl: appUrl() });
    await this.notificationHub.sendEmail({
      recipientEmail: user.email,
      subject: email.subject,
      html: email.html,
      type: 'account-activated',
      idempotencyKey: `account-activated:${userId}:${active.id}`,
    });

    return { verified: true };
  }

  /**
   * Invalidate any live code, issue + send a new one.
   * Rate limited by ResendVerificationThrottlerGuard (3/hour/user).
   */
  async resend(user: { id: string; email: string; name: string }): Promise<{ sent: boolean }> {
    return this.issueCode(user);
  }
}
