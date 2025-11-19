/**
 * Lightweight in-memory rate limiter for API routes.
 * This is not a full WAF replacement, but it stops the most obvious brute-force attempts.
 * Use different bucket keys per endpoint so limits remain independent.
 */
type RateLimiterOptions = {
  windowMs: number;
  maxRequests: number;
};

type RateLimiterEntry = {
  hits: number;
  resetAt: number;
};

type RateLimiterResult = {
  success: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

type RateLimiter = {
  check: (identifier: string) => RateLimiterResult;
};

type RateLimiterGlobal = typeof globalThis & {
  __rateLimiterStore?: Map<string, Map<string, RateLimiterEntry>>;
};

const getLimiterStore = (): Map<string, Map<string, RateLimiterEntry>> => {
  const globalWithLimiter = globalThis as RateLimiterGlobal;
  if (!globalWithLimiter.__rateLimiterStore) {
    globalWithLimiter.__rateLimiterStore = new Map();
  }
  return globalWithLimiter.__rateLimiterStore;
};

export const createRateLimiter = (bucketKey: string, options: RateLimiterOptions): RateLimiter => {
  const store = getLimiterStore();
  if (!store.has(bucketKey)) {
    store.set(bucketKey, new Map());
  }

  const bucket = store.get(bucketKey)!;

  return {
    check: (identifier: string): RateLimiterResult => {
      const now = Date.now();
      const existing = bucket.get(identifier);

      if (!existing || existing.resetAt <= now) {
        bucket.set(identifier, { hits: 1, resetAt: now + options.windowMs });
        return { success: true, remaining: options.maxRequests - 1, retryAfterSeconds: 0 };
      }

      if (existing.hits >= options.maxRequests) {
        const retryAfterSeconds = Math.ceil((existing.resetAt - now) / 1000);
        return { success: false, remaining: 0, retryAfterSeconds };
      }

      existing.hits += 1;
      bucket.set(identifier, existing);

      return {
        success: true,
        remaining: Math.max(options.maxRequests - existing.hits, 0),
        retryAfterSeconds: 0,
      };
    },
  };
};

/**
 * Convenience helper: use the user's IP if available, otherwise fall back to a header fingerprint.
 */
export const getClientIdentifier = (ip?: string | null, forwardedFor?: string | null): string => {
  if (ip) {
    return ip;
  }
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? "unknown";
  }
  return "unknown";
};
