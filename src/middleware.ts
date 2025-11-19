import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;
    const token = req.nextauth.token;

    // Protected routes that require authentication
    const protectedRoutes = ["/rewards", "/my-account"];
    const isProtectedRoute = protectedRoutes.some((route) => pathname.startsWith(route));

    // Admin-only routes (UI + API namespaces)
    const adminRoutes = ["/admin", "/api/admin"];
    const isAdminRoute = adminRoutes.some((route) => pathname.startsWith(route));

    // Check authentication for protected routes
    if (isProtectedRoute && !token) {
      return NextResponse.redirect(new URL("/login", req.url));
    }

    // Check admin role for admin routes
    if (isAdminRoute && (!token || token.role !== "admin")) {
      return NextResponse.redirect(new URL("/", req.url));
    }
  },
  {
    callbacks: {
      authorized: ({ token, req }) => {
        const { pathname } = req.nextUrl;

        // Allow access to public routes
        const publicRoutes = ["/", "/shop", "/mini-draws", "/partner", "/contact", "/faq", "/winners", "/membership"];
        const isPublicRoute = publicRoutes.some((route) => pathname.startsWith(route));

        if (isPublicRoute) {
          return true;
        }

        // For protected routes, require authentication
        const protectedRoutes = ["/rewards", "/my-account"];
        const isProtectedRoute = protectedRoutes.some((route) => pathname.startsWith(route));

        if (isProtectedRoute) {
          return !!token;
        }

        // For admin routes, require admin role
        const adminRoutes = ["/admin", "/api/admin"];
        const isAdminRoute = adminRoutes.some((route) => pathname.startsWith(route));

        if (isAdminRoute) {
          return token?.role === "admin";
        }

        return true;
      },
    },
  }
);

export const config = {
  matcher: ["/rewards/:path*", "/my-account/:path*", "/admin/:path*", "/api/admin/:path*"],
};
