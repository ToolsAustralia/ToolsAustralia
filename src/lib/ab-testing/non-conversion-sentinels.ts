/**
 * Sentinel slug registry — the one definition, readable from BOTH server and client.
 *
 * It lives in `src/lib/` and imports nothing, because both sides need it:
 *   • server — `get-user-experiment-assignment.ts` excludes these from purchase attribution
 *   • client — the admin dashboard suppresses legacy conversion panels for them
 *
 * It cannot live in `get-user-experiment-assignment.ts`: that module imports mongoose and
 * the repositories, so a client component importing from it pulls the whole DB layer into
 * the browser bundle. (A related trap already bit this codebase once — a Server Component
 * importing a constant from a `"use client"` module received a client reference instead of
 * the value, silently disabling a whole feature. See docs/ab-testing/gotchas.md.)
 */

import { PROMO_THEME_SLUG } from "@/lib/ab-testing/promo-theme-slug";

/**
 * Cosmetic site-wide experiments that must never be credited with purchases.
 *
 * These target a sentinel slug that can never match a real prize page, so they cannot
 * shadow a slug-targeted promo experiment. The trade-off is deliberate: they are excluded
 * from the single purchase stamp, so their LEGACY event-count conversion/revenue panels
 * read zero by design. They are scored from the user-level Bayesian card instead, which
 * computes from the durable assignment + PaymentEvent tables rather than from events.
 */
export const NON_CONVERSION_SENTINEL_SLUGS = new Set<string>([
  "__membership-theme__",
  PROMO_THEME_SLUG,
]);

/**
 * True when EVERY target is a non-conversion sentinel — i.e. this experiment can never
 * accrue legacy conversion/purchase events, so showing those panels (and a chi-square
 * derived from them) is guaranteed-misleading rather than merely empty.
 *
 * Mirrors `attributionRank`'s `.every(...)` test so the UI and the attribution logic agree:
 * a mixed target list still earns real attribution and must keep its legacy panels.
 */
export function isNonConversionSentinelExperiment(slugTargets: readonly string[] | undefined): boolean {
  if (!slugTargets || slugTargets.length === 0) return false;
  return slugTargets.every((s) => NON_CONVERSION_SENTINEL_SLUGS.has(s));
}
