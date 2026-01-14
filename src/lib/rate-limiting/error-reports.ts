/**
 * Rate Limiting for Error Reports
 * 
 * Prevents abuse and database flooding by limiting the number of error reports
 * that can be submitted per user/IP within a time window.
 * 
 * Rate Limits:
 * - Authenticated users: 5 reports per hour per user
 * - Anonymous users: 3 reports per hour per IP
 */

import { createRateLimiter, getClientIdentifier } from "@/utils/security/rateLimiter";
import { NextRequest } from "next/server";

/**
 * Rate limiter for authenticated users
 * 5 reports per hour per user ID
 */
const authenticatedUserRateLimiter = createRateLimiter("error-reports-authenticated", {
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 5, // 5 reports per hour
});

/**
 * Rate limiter for anonymous users (by IP)
 * 3 reports per hour per IP address
 */
const anonymousUserRateLimiter = createRateLimiter("error-reports-anonymous", {
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 3, // 3 reports per hour
});

/**
 * Check rate limit for error report submission
 * 
 * @param userId - User ID if authenticated, undefined for anonymous users
 * @param request - NextRequest object to extract IP address
 * @returns Rate limit check result
 */
export function checkErrorReportRateLimit(
  userId: string | undefined,
  request: NextRequest
): {
  allowed: boolean;
  retryAfterSeconds?: number;
  remaining?: number;
} {
  // Get client identifier (IP address)
  const ipAddress = getClientIdentifier(
    request.headers.get("x-real-ip"),
    request.headers.get("x-forwarded-for")
  );

  if (userId) {
    // Authenticated user: rate limit by user ID
    const rateCheck = authenticatedUserRateLimiter.check(userId);

    if (!rateCheck.success) {
      return {
        allowed: false,
        retryAfterSeconds: rateCheck.retryAfterSeconds,
        remaining: rateCheck.remaining,
      };
    }

    return {
      allowed: true,
      remaining: rateCheck.remaining,
    };
  } else {
    // Anonymous user: rate limit by IP address
    const rateCheck = anonymousUserRateLimiter.check(ipAddress);

    if (!rateCheck.success) {
      return {
        allowed: false,
        retryAfterSeconds: rateCheck.retryAfterSeconds,
        remaining: rateCheck.remaining,
      };
    }

    return {
      allowed: true,
      remaining: rateCheck.remaining,
    };
  }
}

/**
 * Get rate limit information for a user/IP
 * Useful for displaying rate limit status to users
 * 
 * @param userId - User ID if authenticated, undefined for anonymous users
 * @param request - NextRequest object to extract IP address
 * @returns Rate limit information
 */
export function getErrorReportRateLimitInfo(
  userId: string | undefined,
  request: NextRequest
): {
  maxRequests: number;
  windowMinutes: number;
  remaining?: number;
} {
  if (userId) {
    // Authenticated user limits
    return {
      maxRequests: 5,
      windowMinutes: 60,
    };
  } else {
    // Anonymous user limits
    return {
      maxRequests: 3,
      windowMinutes: 60,
    };
  }
}

