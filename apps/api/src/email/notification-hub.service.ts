import { Injectable, Logger } from '@nestjs/common';

// NotificationHub production API (verified against the NotificationHub repo docs
// and source: POST /api/v1/notifications, X-Api-Key header, payload is a JSON
// string of {subject, html} — CreateNotificationCommand has no template
// reference; TemplateId exists only on Campaigns).
const DEFAULT_BASE_URL = 'https://api.notificationhub.space';

export interface SendEmailInput {
  recipientEmail: string;
  subject: string;
  html: string;
  /** Free-form notification type, e.g. "verification-code". */
  type: string;
  /** Optional idempotency key — prevents duplicate sends on retries. */
  idempotencyKey?: string;
}

export interface SendEmailResult {
  sent: boolean;
  publicId?: string;
  error?: string;
}

@Injectable()
export class NotificationHubService {
  private readonly logger = new Logger(NotificationHubService.name);

  private get baseUrl(): string {
    return (process.env.NOTIFICATIONHUB_URL || DEFAULT_BASE_URL).replace(/\/$/, '');
  }

  private get apiKey(): string | undefined {
    return process.env.NOTIFICATIONHUB_API_KEY;
  }

  get configured(): boolean {
    return Boolean(this.apiKey);
  }

  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    if (!this.apiKey) {
      // Fail open on registration: the account is created either way; the user
      // can hit resend once an operator configures the key.
      this.logger.warn(
        `NOTIFICATIONHUB_API_KEY not set — skipping "${input.type}" email to ${input.recipientEmail}`,
      );
      return { sent: false, error: 'notificationhub_not_configured' };
    }

    try {
      const headers: Record<string, string> = {
        'X-Api-Key': this.apiKey,
        'Content-Type': 'application/json',
      };
      if (input.idempotencyKey) {
        headers['Idempotency-Key'] = input.idempotencyKey;
      }

      const res = await fetch(`${this.baseUrl}/api/v1/notifications`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          recipientEmail: input.recipientEmail,
          type: input.type,
          channel: 'email',
          payload: JSON.stringify({ subject: input.subject, html: input.html }),
        }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        this.logger.error(`NotificationHub ${res.status}: ${body.slice(0, 500)}`);
        return { sent: false, error: `http_${res.status}` };
      }

      const data = (await res.json()) as { publicId?: string };
      return { sent: true, publicId: data.publicId };
    } catch (err: any) {
      this.logger.error(`NotificationHub request failed: ${err?.message}`);
      return { sent: false, error: err?.message ?? 'request_failed' };
    }
  }
}
