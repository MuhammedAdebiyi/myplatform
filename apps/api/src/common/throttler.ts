import { Injectable, CanActivate, ExecutionContext, HttpException } from '@nestjs/common';

const store = new Map<string, { count: number; expiresAt: number }>();

export function throttleCheck(key: string, ttlMs: number, limit: number): void {
  const now = Date.now();
  const existing = store.get(key);
  if (existing && existing.expiresAt > now) {
    existing.count++;
    if (existing.count > limit) throw new HttpException('Too Many Requests', 429);
  } else {
    store.set(key, { count: 1, expiresAt: now + ttlMs });
  }
}

export function throttleReset(key: string): void {
  store.delete(key);
}

export function throttleClear(): void {
  store.clear();
}

function cleanup() {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) store.delete(key);
  }
}
setInterval(cleanup, 60_000).unref();
