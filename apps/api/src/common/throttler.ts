import { HttpException } from '@nestjs/common';
import { getRedisConnection } from '@myplatform/queue';

const PREFIX = 'throttle:';

// Lua script: atomic increment + conditional TTL set.
// Returns count after increment. TTL is set only on first hit (count==1).
const INCR_SCRIPT = `
local key = KEYS[1]
local ttl = tonumber(ARGV[1])
local count = redis.call('INCR', key)
if count == 1 then
  redis.call('PEXPIRE', key, ttl)
end
return count
`;

export async function throttleCheck(key: string, ttlMs: number, limit: number): Promise<void> {
  const redis = getRedisConnection();
  const count = await redis.eval(INCR_SCRIPT, 1, `${PREFIX}${key}`, String(ttlMs)) as number;
  if (count > limit) {
    throw new HttpException('Too Many Requests', 429);
  }
}

export async function throttleReset(key: string): Promise<void> {
  const redis = getRedisConnection();
  await redis.del(`${PREFIX}${key}`);
}

export async function throttleClear(): Promise<void> {
  const redis = getRedisConnection();
  const keys = await redis.keys(`${PREFIX}*`);
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}
