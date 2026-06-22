import { NextRequest, NextResponse } from "next/server";

/**
 * Origins permitted to make state-changing requests to our cookie-authenticated
 * API routes. The browser always sends an `Origin` header on cross-origin (and
 * same-origin non-GET) requests, so an allowlist check is a lightweight CSRF
 * defence that complements the NextAuth session cookie's `sameSite=lax`.
 */
const allowedOrigins = [
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://toolsaustralia.com.au",
  "http://localhost:3000",
];

const isAllowedOrigin = (origin: string): boolean =>
  allowedOrigins.some((allowed) => {
    try {
      return new URL(allowed).origin === origin;
    } catch {
      return false;
    }
  });

/**
 * CSRF guard for cookie-authenticated, state-changing routes.
 *
 * Returns a 403 `NextResponse` when the request carries a cross-site `Origin`
 * header, otherwise `null` (allowed). A request is treated as same-origin when
 * its `Origin` matches the request's own origin (`request.nextUrl.origin`) — so
 * it works in every environment (production, Vercel preview deploys, localhost)
 * without an env-specific list. The static `allowedOrigins` list is an extra
 * escape hatch for explicitly-trusted origins.
 *
 * Requests with no `Origin` header are allowed: same-origin GETs and
 * server-to-server callers omit it, and the `sameSite=lax` session cookie
 * already blocks the cross-site POST case (the cookie — and therefore the
 * session — simply isn't sent).
 *
 * Supersedes the same-origin check originally inlined in `/api/auth/login`.
 */
export function requireSameOrigin(request: NextRequest): NextResponse | null {
  const origin = request.headers.get("origin");
  if (!origin) {
    return null;
  }
  if (origin === request.nextUrl.origin || isAllowedOrigin(origin)) {
    return null;
  }
  return NextResponse.json({ success: false, error: "Origin not allowed" }, { status: 403 });
}
