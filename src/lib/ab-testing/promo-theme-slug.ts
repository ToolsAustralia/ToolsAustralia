/**
 * Boundary-neutral home for the promo default-theme sentinel slug.
 *
 * `usePromoThemeExperiment` (`src/hooks/ab-testing/usePromoThemeExperiment.ts`) is a
 * `"use client"` module. A Server Component that imports a plain named constant (not a
 * component) from a `"use client"` file does not get the module's real runtime value —
 * it gets a client reference instead, which is not a string. `getActiveExperimentForSentinelSlug`
 * then matches nothing and silently returns null: no thrown error, no type error, the
 * feature just never activates. `/promotions/[slug]/page.tsx` and `ToolsetLandingPage.tsx`
 * are both Server Components that need this exact literal, so it lives here — a module with
 * no `"use client"` directive — and both the hook and the Server Components import it from
 * here instead of one side importing it from the other.
 */
export const PROMO_THEME_SLUG = "__promo-theme__";

/** Device-scoped marker: this device already resolved this experiment. */
export function promoThemeMarkerKey(experimentId: string): string {
  return `ta_promo_theme_${experimentId}`;
}
