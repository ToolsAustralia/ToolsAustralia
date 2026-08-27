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

type DistributedRateLimiter = {
  check: (identifier: string) => Promise<RateLimiterResult>;
  /**
   * Give back a token consumed by `check()` when the guarded action did not
   * actually happen (e.g. the SMS gateway failed, so no credit was spent and no
   * code was delivered).
   *
   * Needed because `check()` consumes on call — there is no "peek". Without a
   * refund, a transient downstream failure permanently eats one of the caller's
   * allowance, which matters a lot on a small budget like 3 SMS/day.
   *
   * Only ever decrements a LIVE window and never below zero, so a stray refund
   * cannot mint allowance. Best-effort and silent: a failed refund must never
   * fail the request the caller is already handling.
   */
  refund: (identifier: string) => Promise<void>;
};

/**
 * Mongo-backed rate limiter, shared across all serverless instances.
 *
 * The in-memory `createRateLimiter` above keeps its counters in per-instance
 * `globalThis` memory, so on Vercel an attacker can dodge the limit by hitting
 * different lambda instances. Use this variant for brute-force-sensitive auth
 * endpoints (login / OTP verify / auto-login). It **fails open**: if the store is
 * unreachable, it allows the request rather than locking everyone out.
 *
 * The model + connection are imported lazily so this module stays free of a
 * top-level Mongoose dependency.
 */
export const createDistributedRateLimiter = (
  bucketKey: string,
  options: RateLimiterOptions
): DistributedRateLimiter => {
  return {
    check: async (identifier: string): Promise<RateLimiterResult> => {
      const key = `${bucketKey}:${identifier}`;
      const now = Date.now();
      try {
        const [{ default: connectDB }, { default: RateLimit }] = await Promise.all([
          import("@/lib/mongodb"),
          import("@/models/RateLimit"),
        ]);
        await connectDB();

        // Atomically increment within a still-live window.
        const updated = await RateLimit.findOneAndUpdate(
          { _id: key, resetAt: { $gt: new Date(now) } },
          { $inc: { count: 1 } },
          { new: true }
        ).lean();

        if (updated) {
          if (updated.count > options.maxRequests) {
            const retryAfterSeconds = Math.ceil((new Date(updated.resetAt).getTime() - now) / 1000);
            return { success: false, remaining: 0, retryAfterSeconds: Math.max(retryAfterSeconds, 1) };
          }
          return {
            success: true,
            remaining: Math.max(options.maxRequests - updated.count, 0),
            retryAfterSeconds: 0,
          };
        }

        // No live window (new or expired) — start a fresh one.
        await RateLimit.updateOne(
          { _id: key },
          { $set: { count: 1, resetAt: new Date(now + options.windowMs) } },
          { upsert: true }
        );
        return { success: true, remaining: options.maxRequests - 1, retryAfterSeconds: 0 };
      } catch (err) {
        // Fail OPEN: never block legitimate auth because the limiter store hiccuped.
        console.error("Distributed rate limiter error (failing open):", err);
        return { success: true, remaining: options.maxRequests, retryAfterSeconds: 0 };
      }
    },

    refund: async (identifier: string): Promise<void> => {
      const key = `${bucketKey}:${identifier}`;
      try {
        const [{ default: connectDB }, { default: RateLimit }] = await Promise.all([
          import("@/lib/mongodb"),
          import("@/models/RateLimit"),
        ]);
        await connectDB();
        // `count: { $gt: 0 }` stops a double refund going negative (which would
        // hand out free allowance); `resetAt: { $gt: now }` stops a late refund
        // resurrecting an expired window.
        await RateLimit.updateOne(
          { _id: key, count: { $gt: 0 }, resetAt: { $gt: new Date() } },
          { $inc: { count: -1 } }
        );
      } catch (err) {
        // Best-effort only. The caller is already handling a failure; losing one
        // token is strictly better than throwing a second error on top of it.
        console.error("Distributed rate limiter refund failed (ignored):", err);
      }
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
