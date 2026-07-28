import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import type { JWT } from "next-auth/jwt";
import { generateNonce } from "@/utils/security/nonce";
import { buildSecurityHeaders } from "@/utils/security/csp";
import {
  ANON_ID_COOKIE_NAME,
  ANON_ID_MAX_AGE,
  generateAnonymousId,
  isValidAnonymousId,
} from "@/lib/ab-testing/anon-id-cookie";

// Internal users = staff/admin userType, or the legacy role:"admin" bridge
// (kept until the Phase-5 migration drops the legacy field). Single definition so
// the entry gate (`authorized`) and the redirect (`middleware`) can never drift.
function isInternalUser(token: JWT | null): boolean {
  return token?.userType === "staff" || token?.userType === "admin" || token?.role === "admin";
}

// ---------------------------------------------------------------------------
// CSP route classes (2026-07-19 perf/caching — docs/security-csp/architecture.md)
//
// Anonymous marketing routes are served as cached/ISR HTML. Cached HTML cannot
// carry a per-request nonce (Next stamps the request's nonce into EVERY inline
// script — a cached copy would mismatch the fresh CSP header and every script
// would be blocked). So these routes get the no-nonce CSP variant
// ('unsafe-inline' script-src — the same fallback next.config.ts already ships)
// and NO x-nonce header; every OTHER route keeps the per-request nonce CSP and
// MUST render dynamically (per-page `export const dynamic = "force-dynamic"` or
// a naturally dynamic API). INVARIANT: a route is either nonce-class + dynamic
// or marketing-class + static — never mix. When adding a public page, pick its
// class explicitly; the `next build` route table is the enforcement check.
// ---------------------------------------------------------------------------
const STATIC_MARKETING_PATHS = ["/promotions", "/winners", "/draw-results", "/terms", "/competition-term-majordraw"];
function isStaticMarketingRoute(pathname: string): boolean {
  if (pathname === "/") return true;
  return STATIC_MARKETING_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;
    const token = req.nextauth.token;

    // Generate nonce for CSP (only in production, only for nonce-class routes —
    // marketing-class routes serve cached HTML and get the no-nonce CSP variant)
    const isProduction = process.env.NODE_ENV === "production";
    const nonce = isProduction && !isStaticMarketingRoute(pathname) ? generateNonce() : undefined;

    // Protected routes that require authentication
    const protectedRoutes = ["/rewards", "/my-account"];
    const isProtectedRoute = protectedRoutes.some((route) => pathname.startsWith(route));

    // Admin-only PAGE routes. (/api/admin is intentionally NOT listed: middleware
    // never runs for /api/** — the matcher excludes it — so /api/admin
    // authorization lives in the route handlers, not here.)
    const adminRoutes = ["/admin"];
    const isAdminRoute = adminRoutes.some((route) => pathname.startsWith(route));

    // Staff route block-list: staff accounts are not customer accounts.
    // If a staff user tries to load a customer-only route, redirect them to /admin.
    const STAFF_BLOCKED_PREFIXES = [
      "/my-account",
      "/affiliate",
      "/shop",
      "/checkout",
      "/purchase-success",
      "/major-draw",
      "/mini-draws",
      "/mini-draw-success",
      "/upsell-success",
      "/rewards",
      "/membership",
      "/partner",
    ];

    if (
      token?.userType === "staff" &&
      STAFF_BLOCKED_PREFIXES.some((p) => pathname.startsWith(p))
    ) {
      const url = req.nextUrl.clone();
      url.pathname = "/admin";
      url.search = "";
      return NextResponse.redirect(url);
    }

    // Check authentication for protected routes
    if (isProtectedRoute && !token) {
      const response = NextResponse.redirect(new URL("/login", req.url));
      // Apply security headers to redirect response
      if (isProduction && nonce) {
        buildSecurityHeaders(nonce).forEach(({ key, value }) => {
          response.headers.set(key, value);
        });
        response.headers.set("x-nonce", nonce);
      }
      return response;
    }

    // Check admin access for admin routes.
    if (isAdminRoute && (!token || !isInternalUser(token))) {
      const response = NextResponse.redirect(new URL("/", req.url));
      // Apply security headers to redirect response
      if (isProduction && nonce) {
        buildSecurityHeaders(nonce).forEach(({ key, value }) => {
          response.headers.set(key, value);
        });
        response.headers.set("x-nonce", nonce);
      }
      return response;
    }

    // For all other routes, create a response and apply security headers
    const response = NextResponse.next();

    // Mint the A/B anonymous id ONCE per visitor, here, so that concurrent
    // /assign calls on the same page share one identity. Each API handler
    // otherwise generates its own `anon_<uuid>` and Set-Cookies it (last write
    // wins), which produces two legal VariantAssignment rows — the unique index
    // is (experimentId, anonymousId) — and counts one visitor as two exposures.
    const existingAnonId = req.cookies.get(ANON_ID_COOKIE_NAME)?.value;
    if (!existingAnonId || !isValidAnonymousId(existingAnonId)) {
      response.cookies.set({
        name: ANON_ID_COOKIE_NAME,
        value: generateAnonymousId(),
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: ANON_ID_MAX_AGE,
        path: "/",
      });
    }

    // In production, set CSP with nonce and attach nonce to request headers
    if (isProduction && nonce) {
      buildSecurityHeaders(nonce).forEach(({ key, value }) => {
        response.headers.set(key, value);
      });
      // Attach nonce to request headers so server components can read it
      response.headers.set("x-nonce", nonce);
    }

    // Marketing class (production): explicit no-nonce security headers so the
    // policy served with cached HTML never depends on next.config fallback
    // ordering. No x-nonce header → getNonce() returns undefined → inline
    // scripts render un-nonced, allowed by this variant's 'unsafe-inline'.
    if (isProduction && !nonce) {
      buildSecurityHeaders().forEach(({ key, value }) => {
        response.headers.set(key, value);
      });
    }

    return response;
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const { pathname } = req.nextUrl;

        // Allow access to public routes
        const publicRoutes = [
          "/",
          "/shop",
          "/mini-draws",
          "/partner",
          "/contact",
          "/faq",
          "/winners",
          "/draw-results",
          "/membership",
          "/affiliate/login",
        ];
        const isPublicRoute = publicRoutes.some((route) => pathname.startsWith(route));

        if (isPublicRoute) {
          return true;
        }

        // For protected routes, require authentication
        const protectedRoutes = ["/rewards", "/my-account"];
        const isProtectedRoute = protectedRoutes.some((route) => pathname.startsWith(route));

        if (isProtectedRoute) {
          // Treat tokens without a valid subject as unauthenticated.
          // This ensures that when the JWT callback clears the token
          // for deleted/inactive users, protected routes become inaccessible.
          return !!token && !!token.sub;
        }

        // For admin PAGE routes, require an internal user. (/api/admin is gated by
        // per-handler checks, not here — middleware never runs for /api/**.)
        const adminRoutes = ["/admin"];
        const isAdminRoute = adminRoutes.some((route) => pathname.startsWith(route));

        if (isAdminRoute) {
          return !!token?.sub && isInternalUser(token);
        }

        return true;
      },
    },
  }
);

export const config = {
  // Match all page routes; exclude static assets and APIs so middleware doesn't run
  // (and incur JWT decode + CSP nonce generation) on bytes/handlers that don't need them.
  //
  // IMPORTANT: Multiple matcher entries are OR'd (Next.js include semantics), so all
  // exclusions must live in ONE regex's negative lookahead. The lookahead uses `|`
  // alternation to combine path-prefix excludes and extension excludes.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|manifest\\.json|sw\\.js|icon\\.ico|apple-icon\\.png|\\.well-known/|images/|fonts/|.*\\.(?:png|jpg|jpeg|gif|webp|avif|svg|ico|ttf|woff|woff2|otf|map|txt|xml|json)$).*)",
  ],
};
