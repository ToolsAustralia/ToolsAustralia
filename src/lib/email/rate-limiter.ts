/**
 * Rate Limiter
 * In-memory rate limiting (upgradeable to Redis in future)
 */

import { RateLimitResult } from './types';
import { isDevelopment } from '@/lib/environment';

class RateLimiter {
  private store: Map<string, { count: number; resetTime: number }> = new Map();
  private readonly windowMs: number;
  private readonly maxAttempts: number;

  constructor(windowMs: number = 60 * 60 * 1000, maxAttempts: number = 5) {
    this.windowMs = windowMs;
    this.maxAttempts = maxAttempts;
  }

  /**
   * Check if email sending is allowed for given identifier
   */
  public checkLimit(identifier: string): RateLimitResult {
    // Skip rate limiting in development
    if (isDevelopment()) {
      return {
        allowed: true,
        remainingAttempts: 999,
        resetTime: Date.now() + this.windowMs,
      };
    }

    const now = Date.now();
    const key = `email_${identifier}`;
    const current = this.store.get(key);

    if (!current || now > current.resetTime) {
      // Reset or initialize
      const resetTime = now + this.windowMs;
      this.store.set(key, { count: 1, resetTime });
      return {
        allowed: true,
        remainingAttempts: this.maxAttempts - 1,
        resetTime,
      };
    }

    if (current.count >= this.maxAttempts) {
      return {
        allowed: false,
        remainingAttempts: 0,
        resetTime: current.resetTime,
      };
    }

    // Increment count
    current.count++;
    this.store.set(key, current);

    return {
      allowed: true,
      remainingAttempts: this.maxAttempts - current.count,
      resetTime: current.resetTime,
    };
  }

  /**
   * Clear rate limit for identifier (for testing/admin)
   */
  public clearLimit(identifier: string): void {
    this.store.delete(`email_${identifier}`);
  }
}

// Export singleton instances for different rate limit configurations
export const emailVerificationRateLimiter = new RateLimiter(
  60 * 60 * 1000, // 1 hour
  parseInt(process.env.EMAIL_VERIFICATION_RATE_LIMIT_PER_HOUR || '5', 10)
);

export const passwordResetRateLimiter = new RateLimiter(
  60 * 60 * 1000, // 1 hour
  5
);






