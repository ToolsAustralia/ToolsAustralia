/**
 * Single source of truth for Pixel / CAPI environment gating (server-side).
 * Client components should mirror production host checks via `window.location.hostname`
 * (see `isProductionBrowserHostname` in FacebookPixel.tsx).
 */
export type PixelEnvironment = "production" | "staging" | "development";

export function getPixelEnv(): PixelEnvironment {
  if (process.env.VERCEL_ENV === "production") return "production";
  if (process.env.VERCEL_ENV === "preview") return "staging";
  if (process.env.NODE_ENV === "development") return "development";

  const host = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "";
  if (host.includes("staging.")) return "staging";
  if (host.includes("toolsaustralia.com.au") && !host.includes("staging.")) return "production";
  return "development";
}

export function isProductionPixelEnv(): boolean {
  return getPixelEnv() === "production";
}
