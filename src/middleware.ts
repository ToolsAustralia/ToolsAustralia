import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import { generateNonce } from "@/utils/security/nonce";
import { buildSecurityHeaders } from "@/utils/security/csp";

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;
    const token = req.nextauth.token;

    // Generate nonce for CSP (only in production)
    // In development, CSP headers are disabled to allow Next.js dev tools to work
    const isProduction = process.env.NODE_ENV === "production";
    const nonce = isProduction ? generateNonce() : undefined;

    // Protected routes that require authentication
    const protectedRoutes = ["/rewards", "/my-account"];
    const isProtectedRoute = protectedRoutes.some((route) => pathname.startsWith(route));

    // Admin-only routes (UI + API namespaces)
    const adminRoutes = ["/admin", "/api/admin"];
    const isAdminRoute = adminRoutes.some((route) => pathname.startsWith(route));

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

    // Check admin role for admin routes
    if (isAdminRoute && (!token || token.role !== "admin")) {
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

    // In production, set CSP with nonce and attach nonce to request headers
    if (isProduction && nonce) {
      buildSecurityHeaders(nonce).forEach(({ key, value }) => {
        response.headers.set(key, value);
      });
      // Attach nonce to request headers so server components can read it
      response.headers.set("x-nonce", nonce);
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

        // For admin routes, require admin role
        const adminRoutes = ["/admin", "/api/admin"];
        const isAdminRoute = adminRoutes.some((route) => pathname.startsWith(route));

        if (isAdminRoute) {
          // Admin routes require both a valid subject and admin role.
          return !!token?.sub && token?.role === "admin";
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
