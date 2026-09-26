import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common';
import { BadRequestException } from '@nestjs/common';
import { prisma, ActorType } from '@myplatform/database';
import {
  generatePasswordResetToken,
  hashPasswordResetToken,
  passwordResetExpiresAt,
  hashPassword,
} from '@myplatform/auth';
import { AuditService } from '../audit/audit.service.js';
import { NotificationHubService } from '../email/notification-hub.service.js';
import { SessionsService } from '../users/sessions.service.js';
import {
  renderPasswordResetEmail,
  renderOAuthOnlyResetNoticeEmail,
  renderPasswordChangedEmail,
} from '../email/email-templates.js';

// Credential shape: a 32-byte (256-bit) random TOKEN in a link — NOT a
// human-typed 6-digit code. Entropy, not hash slowness, is what makes it
// unguessable, so it's hashed with sha256 (same convention as session
// tokens in packages/auth/src/session.ts). argon2id stays reserved for
// low-entropy secrets a human invents: passwords and verification codes.
// 30-min TTL lives in packages/auth/src/reset-token.ts (passwordResetExpiresAt).

// The ONLY response forgot-password ever produces — for unknown emails,
// OAuth-only accounts, and suspended accounts alike. Never varies in
// content or status (enforced by @HttpCode(200) on a single return path).
const GENERIC_RESPONSE = Object.freeze({
  message: "If an account exists for that email, we've sent a reset link.",
});

const INVALID_LINK_MESSAGE = 'This reset link is invalid or has expired';

function appUrl(): string {
  return (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
}

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly audit: AuditService,
    private readonly notificationHub: NotificationHubService,
    @Inject(forwardRef(() => SessionsService))
    private readonly sessions: SessionsService,
  ) {}

  /**
   * POST /auth/forgot-password — PUBLIC.
   *
   * Timing: the same crypto work runs on every branch (token generation +
   * sha256 happen BEFORE the user lookup, even when the result is discarded),
   * and the NotificationHub send is never awaited — an awaited HTTP round trip
   * on the "user exists" branch would be a 200ms+ timing oracle against the
   * ~1ms "no such user" branch. Response shape/status identical by
   * construction: one return path, one frozen constant.
   */
  async forgotPassword(
    email: string,
    ip?: string,
    userAgent?: string,
  ): Promise<{ message: string }> {
    // Constant-work preamble — always hash something, per the enumeration rule.
    const token = generatePasswordResetToken();

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, passwordHash: true },
    });

    if (!user) {
      // No such account: discard the token, same generic response.
      return { ...GENERIC_RESPONSE };
    }

    if (!user.passwordHash) {
      // OAuth-only account: no password exists to reset. A different email
      // goes to the real owner only — informative to them, not a leak: the
      // caller gets the same generic response either way.
      const emailHtml = renderOAuthOnlyResetNoticeEmail({
        name: user.name,
        appUrl: appUrl(),
      });
      void this.notificationHub
        .sendEmail({
          recipientEmail: user.email,
          subject: emailHtml.subject,
          html: emailHtml.html,
          type: 'password-reset-oauth-notice',
          idempotencyKey: `password-reset-oauth:${user.id}:${Date.now()}`,
        })
        .then((result) => {
          if (!result.sent) {
            this.logger.warn(
              `oauth-only reset notice not delivered for user ${user.id}: ${result.error}`,
            );
          }
        });

      this.audit.log({
        actorType: ActorType.USER,
        actorUserId: user.id,
        action: 'password.reset_oauth_only_attempt',
        resourceType: 'User',
        resourceId: user.id,
        metadata: { channel: 'email', reason: 'oauth_only' },
        ipAddress: ip,
        userAgent,
      });

      return { ...GENERIC_RESPONSE };
    }

    // Real password account: kill any outstanding link (one live reset token
    // per user — a second forgot-password invalidates the first), store the new one.
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, consumedAt: null },
      data: { consumedAt: new Date() },
    });

    const row = await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: token.hash,
        expiresAt: passwordResetExpiresAt(),
      },
      select: { id: true },
    });

    const emailHtml = renderPasswordResetEmail({
      name: user.name,
      resetUrl: `${appUrl()}/reset-password?token=${encodeURIComponent(token.raw)}`,
      appUrl: appUrl(),
    });

    // Fire-and-forget: never block (or time) the response on NH latency.
    void this.notificationHub
      .sendEmail({
        recipientEmail: user.email,
        subject: emailHtml.subject,
        html: emailHtml.html,
        type: 'password-reset-link',
        idempotencyKey: `password-reset:${row.id}`,
      })
      .then((result) => {
        if (!result.sent) {
          this.logger.warn(
            `password reset link not delivered for user ${user.id}: ${result.error}`,
          );
        }
      });

    // RULE 07: metadata never contains the token (raw or hashed).
    this.audit.log({
      actorType: ActorType.USER,
      actorUserId: user.id,
      action: 'password.reset_requested',
      resourceType: 'User',
      resourceId: user.id,
      metadata: { channel: 'email', type: 'password-reset-link' },
      ipAddress: ip,
      userAgent,
    });

    return { ...GENERIC_RESPONSE };
  }

  /**
   * POST /auth/reset-password — PUBLIC.
   *
   * Invalid, expired, and already-consumed tokens all collapse into one
   * generic error so the response never reveals which check failed.
   * On success: argon2id (same params as registration) for the new password,
   * atomic single-use claim on the token, and EVERY session revoked — a
   * compromised account shouldn't keep an attacker's session alive.
   */
  async resetPassword(
    rawToken: string,
    newPassword: string,
    ip?: string,
    userAgent?: string,
  ): Promise<{ message: string }> {
    const tokenHash = hashPasswordResetToken(rawToken);

    const row = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        consumedAt: true,
        user: { select: { email: true, name: true } },
      },
    });

    if (!row || row.consumedAt || row.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException(INVALID_LINK_MESSAGE);
    }

    // argon2id with registration's params (hashPassword from @myplatform/auth).
    const passwordHash = await hashPassword(newPassword);

    // Atomic single-use claim: updateMany filtered on consumedAt: null means a
    // concurrent replay of the same token loses the race (count 0) instead of
    // resetting the password twice.
    const claimed = await prisma.$transaction(async (tx) => {
      const result = await tx.passwordResetToken.updateMany({
        where: { id: row.id, consumedAt: null, expiresAt: { gt: new Date() } },
        data: { consumedAt: new Date() },
      });
      if (result.count !== 1) return false;
      await tx.user.update({
        where: { id: row.userId },
        data: { passwordHash },
      });
      return true;
    });

    if (!claimed) {
      throw new BadRequestException(INVALID_LINK_MESSAGE);
    }

    // Revoke ALL sessions (includeCurrent: true — there is no "current"
    // session on this public endpoint; if the account was compromised the
    // attacker's session must die too). Reuses sessions.service so the
    // session.revoked bulk audit is written by the same code path as the
    // settings-page "sign out everywhere" action.
    const { revokedCount } = await this.sessions.revokeAll(
      row.userId,
      '',
      true,
      ip,
      userAgent,
    );

    this.audit.log({
      actorType: ActorType.USER,
      actorUserId: row.userId,
      action: 'password.reset_completed',
      resourceType: 'User',
      resourceId: row.userId,
      metadata: { channel: 'email', sessionsRevoked: revokedCount },
      ipAddress: ip,
      userAgent,
    });

    // Confirmation email — best effort; the reset is already committed, so a
    // NotificationHub outage must not stall or fail the response.
    const emailHtml = renderPasswordChangedEmail({
      name: row.user.name,
      appUrl: appUrl(),
    });
    void this.notificationHub
      .sendEmail({
        recipientEmail: row.user.email,
        subject: emailHtml.subject,
        html: emailHtml.html,
        type: 'password-changed',
        idempotencyKey: `password-changed:${row.id}`,
      })
      .then((result) => {
        if (!result.sent) {
          this.logger.warn(
            `password-changed notice not delivered for user ${row.userId}: ${result.error}`,
          );
        }
      });

    return { message: 'Password has been reset successfully.' };
  }
}
