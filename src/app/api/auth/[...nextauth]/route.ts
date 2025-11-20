import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";
import { NextRequest } from "next/server";
import { createRateLimiter, getClientIdentifier } from "@/utils/security/rateLimiter";

/**
 * Rate limiter for NextAuth credentials sign-in attempts.
 * Matches the custom login endpoint settings for consistency:
 * - 5 attempts per minute per IP
 * - 60 second window
 * - Separate bucket from custom login endpoint
 */
const nextAuthRateLimiter = createRateLimiter("nextauth-credentials", {
  windowMs: 60 * 1000, // 1 minute window
  maxRequests: 5, // 5 attempts per minute per IP
});

const handler = NextAuth(authOptions);

/**
 * POST handler with rate limiting for credentials sign-in.
 *
 * Rate limiting is applied only to credentials sign-in attempts (`/callback/credentials`).
 * OAuth flows (Google sign-in) are intentionally excluded from rate limiting as they
 * are handled by the OAuth provider and have their own security measures.
 *
 * Security considerations:
 * - Extracts IP from x-real-ip or x-forwarded-for headers (supports proxies/load balancers)
 * - Returns HTTP 429 with Retry-After header when rate limited
 * - Fails gracefully if rate limiter errors occur (logs but doesn't block)
 */
export async function POST(req: NextRequest, context: { params: Promise<{ nextauth: string[] }> }) {
  try {
    // Use req.nextUrl.pathname instead of constructing URL from req.url
    // This is the proper Next.js App Router way and avoids URL construction errors
    const pathname = req.nextUrl.pathname;

    // Only apply rate limiting to credentials sign-in callback
    // NextAuth credentials sign-in uses /api/auth/callback/credentials
    if (pathname.includes("/callback/credentials")) {
      // Extract client IP for rate limiting
      // Supports proxy/load balancer setups via x-real-ip and x-forwarded-for headers
      const identifier = getClientIdentifier(req.headers.get("x-real-ip"), req.headers.get("x-forwarded-for"));

      // Check rate limit
      const rateCheck = nextAuthRateLimiter.check(identifier);

      if (!rateCheck.success) {
        // Return 429 Too Many Requests with Retry-After header
        return new Response(
          JSON.stringify({
            error: "Too many login attempts. Please wait a moment before trying again.",
          }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "Retry-After": rateCheck.retryAfterSeconds.toString(),
            },
          }
        );
      }
    }
    // If not credentials sign-in or rate limit check passed, continue to NextAuth handler
  } catch (error) {
    // Fail gracefully: if rate limiter errors occur, log but don't block
    // This ensures NextAuth continues to work even if rate limiter has issues
    console.error("Rate limit check error (non-blocking):", error);
  }

  // Pass through to NextAuth handler with proper context
  return handler(req, context);
}

/**
 * GET handler - no rate limiting needed (used for OAuth callbacks, session checks, etc.)
 */
export async function GET(req: NextRequest, context: { params: Promise<{ nextauth: string[] }> }) {
  return handler(req, context);
}
