/**
 * Mobile OTP policy — code generation, hashing, expiry and send rate limiting.
 *
 * Deliberately separate from `src/lib/sms.ts`: that module is the gateway adapter
 * (it puts a string on a handset and knows the vendor). This one owns the auth
 * policy and knows nothing about who delivers the message.
 *
 * Mirrors the hardened email-code path (`/api/auth/verify-login-code`) rather
 * than inventing a second scheme: crypto-random code, never stored in plaintext,
 * short expiry, attempt cap, constant-time compare, distributed limiter.
 *
 * @module utils/auth/mobile-otp
 */

import { createHmac, randomInt, timingSafeEqual } from "crypto";
import { isDevelopment } from "@/lib/environment";
import { createDistributedRateLimiter } from "@/utils/security/rateLimiter";

/** Codes are valid for 10 minutes from issue. */
export const OTP_EXPIRY_MINUTES = 10;
/** Sends allowed per identifier per rolling 24h. */
export const OTP_MAX_SENDS_PER_DAY = 3;
/** Minimum gap between two sends to the same identifier. */
export const OTP_RESEND_COOLDOWN_SECONDS = 60;
/** Wrong-code submissions allowed against a single issued code. */
export const OTP_MAX_VERIFY_ATTEMPTS = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

const dailyLimiter = createDistributedRateLimiter("sms-otp-send-daily", {
  windowMs: DAY_MS,
  maxRequests: OTP_MAX_SENDS_PER_DAY,
});

const cooldownLimiter = createDistributedRateLimiter("sms-otp-send-cooldown", {
  windowMs: OTP_RESEND_COOLDOWN_SECONDS * 1000,
  maxRequests: 1,
});

/**
 * Rate limiting is OFF in development so the flow can be exercised repeatedly.
 *
 * Set `SMS_OTP_RATE_LIMIT_IN_DEV=true` to force it back ON locally — without that
 * escape hatch the limiter could never be tested anywhere but production, which
 * is the same as not knowing whether it works.
 *
 * Production ALWAYS enforces; there is no env var that can disable it there.
 */
export function isOtpRateLimitBypassed(): boolean {
  if (!isDevelopment()) return false;
  return process.env.SMS_OTP_RATE_LIMIT_IN_DEV !== "true";
}

/**
 * A cryptographically random 6-digit code, `000000`–`999999`.
 *
 * Uses the full range and pads, rather than `randomInt(100000, 999999)`: that
 * common form silently excludes every code beginning with 0, throwing away ~10%
 * of the keyspace and biasing the first digit.
 */
export function generateOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/**
 * HMAC-SHA256 of the code, keyed with `NEXTAUTH_SECRET`.
 *
 * A bare SHA-256 would be useless here: there are only 10^6 possible codes, so
 * anyone with read access to the database could rainbow-table every live OTP in
 * milliseconds. Keying with a secret that lives only in the environment means a
 * database leak alone does not expose codes.
 */
export function hashOtpCode(code: string): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    // Fail loudly rather than silently degrading to an unkeyed digest.
    throw new Error("NEXTAUTH_SECRET is required to hash OTP codes");
  }
  return createHmac("sha256", secret).update(code).digest("hex");
}

/** Constant-time comparison of a submitted code against a stored hash. */
export function verifyOtpCode(submitted: string, storedHash: string | null | undefined): boolean {
  if (!storedHash) return false;
  let expected: string;
  try {
    expected = hashOtpCode(submitted);
  } catch {
    return false;
  }
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(storedHash, "utf8");
  // timingSafeEqual throws on length mismatch, so guard first. Both operands are
  // fixed-length hex digests, making this branch unreachable in practice.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Expiry timestamp for a code issued now. */
export function getOtpExpiry(): Date {
  return new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
}

/** True when `expiresAt` is absent or already past. */
export function isOtpExpired(expiresAt: Date | null | undefined): boolean {
  if (!expiresAt) return true;
  return Date.now() > new Date(expiresAt).getTime();
}

export type OtpSendAllowance =
  | {
      allowed: true;
      /** Sends left in the current 24h window AFTER this one. */
      remainingToday: number;
      /**
       * Hand the allowance back when the send did not actually happen (gateway
       * error, no credit, blocked number). Safe to call once; a no-op when rate
       * limiting is bypassed.
       */
      release: () => Promise<void>;
    }
  | {
      allowed: false;
      reason: "cooldown" | "daily";
      /** Seconds until the caller may try again. Drives the resend countdown. */
      retryAfterSeconds: number;
      remainingToday: number;
    };

/**
 * Claim permission to send one OTP to `identifier` (a user id, or a normalised
 * mobile when there is no session yet).
 *
 * Order matters. The daily cap is checked FIRST so that a daily-blocked caller
 * does not also consume a cooldown token; and if the cooldown then rejects, the
 * daily token is refunded, because no message was sent. Without that, three
 * rapid taps would exhaust a whole day's allowance while delivering nothing.
 *
 * Caveat, deliberate: `createDistributedRateLimiter` fails OPEN if Mongo is
 * unreachable, so a store outage lets sends through. That is the right trade for
 * auth (never lock everyone out) and the spend exposure is bounded by the prepaid
 * credit balance plus the caller-side eligibility gate — not unbounded.
 */
export async function claimOtpSendAllowance(identifier: string): Promise<OtpSendAllowance> {
  if (isOtpRateLimitBypassed()) {
    return { allowed: true, remainingToday: OTP_MAX_SENDS_PER_DAY, release: async () => {} };
  }

  const daily = await dailyLimiter.check(identifier);
  if (!daily.success) {
    return {
      allowed: false,
      reason: "daily",
      retryAfterSeconds: daily.retryAfterSeconds,
      remainingToday: 0,
    };
  }

  const cooldown = await cooldownLimiter.check(identifier);
  if (!cooldown.success) {
    // No send will happen, so the daily token must go back.
    await dailyLimiter.refund(identifier);
    return {
      allowed: false,
      reason: "cooldown",
      retryAfterSeconds: cooldown.retryAfterSeconds,
      remainingToday: daily.remaining + 1,
    };
  }

  let released = false;
  return {
    allowed: true,
    remainingToday: daily.remaining,
    release: async () => {
      if (released) return;
      released = true;
      await Promise.all([dailyLimiter.refund(identifier), cooldownLimiter.refund(identifier)]);
    },
  };
}

/**
 * Customer-facing copy for a refused send.
 *
 * Kept here so both OTP routes word it identically. Rule 11 safe — no gambling
 * or entry framing, and it never implies the member did something wrong.
 */
export function describeOtpRefusal(refusal: Extract<OtpSendAllowance, { allowed: false }>): string {
  if (refusal.reason === "cooldown") {
    const s = Math.max(refusal.retryAfterSeconds, 1);
    return `Please wait ${s} second${s === 1 ? "" : "s"} before requesting another code.`;
  }
  const hours = Math.ceil(Math.max(refusal.retryAfterSeconds, 1) / 3600);
  return `You've reached today's limit of ${OTP_MAX_SENDS_PER_DAY} codes. Please try again in ${hours} hour${hours === 1 ? "" : "s"}, or verify by email instead.`;
}
