/**
 * Single source of truth for which routes should NOT fire ambient tracking events
 * (PageView, page(), Viewed Page).
 *
 * Conversion events (Purchase, CompleteRegistration, AddToCart on user action) are
 * NOT gated by this helper — they should always fire so revenue triggered from these
 * routes is still attributed. This only suppresses the "every navigation fires a
 * PageView" loop, which on internal/staff routes pollutes remarketing audiences and
 * drags Event Match Quality down with low-signal sessions.
 *
 * Mirrored in `src/lib/tracking/providers/{facebook,tiktok,snapchat}.ts` `loadPixel()`
 * functions, which check `shouldTrackRoute(window.location.pathname)` before emitting
 * the initial PageView line in their inline init scripts. The route-change effect in
 * `src/components/tracking/ConversionPixels.tsx` also gates against this list.
 * (Note: `src/components/FacebookPixel.tsx` is legacy dead code — its default export
 * is no longer mounted in the root layout. Only its named helper exports are used.)
 */
export const EXCLUDED_TRACKING_PREFIXES = [
  "/admin",       // Staff dashboard. Admins repeatedly entering remarketing audiences distorts ad targeting and EMQ.
  "/my-account",  // Authenticated customer area. Repeat sessions from existing customers don't help acquisition optimization.
  "/affiliate",   // Affiliate operators. Not consumer traffic.
  "/test-pixels", // Internal pixel test harness.
  "/dev",         // Internal developer tooling.
] as const;

/**
 * @returns true when ambient tracking events should fire for this pathname.
 * Returns true for null/undefined pathname so SSR / mid-hydration paths don't silently
 * drop legitimate events.
 */
export function shouldTrackRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return true;
  return !EXCLUDED_TRACKING_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}
