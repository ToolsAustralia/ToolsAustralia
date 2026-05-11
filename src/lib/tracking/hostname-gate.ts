// src/lib/tracking/hostname-gate.ts

const BASE_PRODUCTION_HOSTNAMES = ["toolsaustralia.com.au", "www.toolsaustralia.com.au"];

/**
 * Hostnames where browser pixels are allowed to fire.
 *
 * Defaults to production. Set `NEXT_PUBLIC_PIXEL_ALLOWED_HOSTNAMES` (comma-separated)
 * in staging Vercel env to opt that environment in for end-to-end pixel testing —
 * combine with `FACEBOOK_TEST_EVENT_CODE` (server) so test pixels route to Meta's
 * Test Events tab instead of polluting production aggregates.
 *
 * Read lazily on every call so flipping a Vercel env var takes effect on the next
 * render without a redeploy.
 */
export function getAllowedHostnames(): string[] {
  const extra = process.env.NEXT_PUBLIC_PIXEL_ALLOWED_HOSTNAMES;
  if (!extra) return BASE_PRODUCTION_HOSTNAMES;
  const extras = extra.split(",").map((h) => h.trim()).filter(Boolean);
  return [...BASE_PRODUCTION_HOSTNAMES, ...extras];
}
