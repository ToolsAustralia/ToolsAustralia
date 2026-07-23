/**
 * Centralized Base URL Utility
 * 
 * Single source of truth for base URL generation across the application.
 * Replaces duplicate getBaseUrl() functions in multiple API route files.
 * 
 * @returns Base URL for the application
 * @throws Error in production if NEXT_PUBLIC_APP_URL is not set
 */
export function getBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    // Normalize away any trailing slash so callers can safely append `/path`
    // without producing `//path` (matches layout.tsx / sitemap.ts / requireSameOrigin.ts).
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("NEXT_PUBLIC_APP_URL must be set in production environment");
  }

  // Development fallback
  return "http://localhost:3000";
}
