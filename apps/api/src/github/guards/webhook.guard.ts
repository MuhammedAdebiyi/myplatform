import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { verifyWebhookSignature } from '@myplatform/github';

@Injectable()
export class WebhookGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const rawBody = request.rawBody;

    if (!rawBody) {
      throw new UnauthorizedException('Missing raw body for webhook verification');
    }

    const signature = request.headers['x-hub-signature-256'] as string | undefined;
    const secret = process.env.GITHUB_WEBHOOK_SECRET!;

    const payload = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');

    if (!verifyWebhookSignature(payload, signature, secret)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    return true;
  }
}
