import { Injectable, CanActivate, ExecutionContext, HttpException } from '@nestjs/common';

const store = new Map<string, { count: number; expiresAt: number }>();

function getEntry(key: string, ttlMs: number): { count: number; expiresAt: number } {
  const now = Date.now();
  const existing = store.get(key);
  if (existing && existing.expiresAt > now) {
    return existing;
  }
  const entry = { count: 0, expiresAt: now + ttlMs };
  store.set(key, entry);
  return entry;
}

function cleanup() {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) store.delete(key);
  }
}
setInterval(cleanup, 60_000).unref();

@Injectable()
export class ApiKeysThrottlerGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const tracker = req.apiKeyContext?.organizationId ?? req.user?.id ?? req.ip;
    const key = `api-keys:${tracker}`;
    const ttlMs = 60 * 60 * 1000;
    const limit = 10;

    const entry = getEntry(key, ttlMs);
    entry.count++;

    if (entry.count > limit) {
      throw new HttpException('Too Many Requests', 429);
    }
    return true;
  }
}
