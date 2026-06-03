// src/lib/internal-norm/rateLimits.ts
import { createRateLimiter } from "@/utils/security/rateLimiter";
import type { NormTier } from "./classification";

const TIER_LIMITS: Record<NormTier, { perMinute: number; perDay: number } | null> = {
  read: { perMinute: 120, perDay: 20_000 },
  write_safe: { perMinute: 30, perDay: 1_000 },
  trigger_norm_confirm: { perMinute: 20, perDay: 500 },
  trigger_human_approve: { perMinute: 10, perDay: 100 },
};

type Limiter = ReturnType<typeof createRateLimiter>;
const bucket = new Map<string, Limiter>();

function getLimiter(bucketKey: string, windowMs: number, maxRequests: number): Limiter {
  const k = `${bucketKey}:${windowMs}:${maxRequests}`;
  let l = bucket.get(k);
  if (!l) {
    l = createRateLimiter(`norm:${k}`, { windowMs, maxRequests });
    bucket.set(k, l);
  }
  return l;
}

export interface RateLimitInput {
  tier: NormTier;
  registryKey: string;
  clientKey: string;
  perEndpointPerMinute?: number;
  perEndpointPerDay?: number;
}
export interface RateLimitOutput {
  ok: boolean;
  remaining: number;
  limit: number;
  retryAfterSeconds: number;
}

export function checkNormRateLimit(input: RateLimitInput): RateLimitOutput {
  const tier = TIER_LIMITS[input.tier];
  if (!tier) return { ok: false, remaining: 0, limit: 0, retryAfterSeconds: 60 };

  const perMin = Math.min(tier.perMinute, input.perEndpointPerMinute ?? tier.perMinute);
  const perDay = Math.min(tier.perDay, input.perEndpointPerDay ?? tier.perDay);

  const minBucket = getLimiter(`tier:${input.tier}:${input.registryKey}:min`, 60_000, perMin);
  const dayBucket = getLimiter(`tier:${input.tier}:${input.registryKey}:day`, 86_400_000, perDay);

  const m = minBucket.check(input.clientKey);
  if (!m.success) return { ok: false, remaining: 0, limit: perMin, retryAfterSeconds: m.retryAfterSeconds };
  const d = dayBucket.check(input.clientKey);
  if (!d.success) return { ok: false, remaining: 0, limit: perDay, retryAfterSeconds: d.retryAfterSeconds };

  return { ok: true, remaining: Math.min(m.remaining, d.remaining), limit: perMin, retryAfterSeconds: 0 };
}

export function __resetForTests() {
  bucket.clear();
  const g = globalThis as typeof globalThis & { __rateLimiterStore?: Map<string, unknown> };
  g.__rateLimiterStore?.clear();
}
