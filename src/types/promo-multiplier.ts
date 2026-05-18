/**
 * Single source of truth for promo multiplier values across admin UI, API validators,
 * Mongoose enums, and client display. Extend PROMO_MULTIPLIERS when adding new tiers.
 *
 * Values 2, 3, 5, 10, 12, 15, 20 predate the 2026-05-14 upsell remap and are kept
 * to avoid invalidating historical promo records.
 */

export type PromoMultiplier =
  | 2 | 3 | 5 | 10 | 12 | 15 | 20
  | 25 | 30 | 40 | 50 | 60 | 70 | 75 | 80 | 90 | 100;

export const PROMO_MULTIPLIERS = [
  2, 3, 5, 10, 12, 15, 20,
  25, 30, 40, 50, 60, 70, 75, 80, 90, 100,
] as const;

/** Multipliers that have bundled image assets (badges, some banners) shipped in-repo */
export const PROMO_MULTIPLIERS_WITH_ASSETS = [2, 3, 5, 10, 12, 15, 20] as const;

export type PromoMultiplierWithAssets = (typeof PROMO_MULTIPLIERS_WITH_ASSETS)[number];

export function hasBundledMultiplierAssets(n: number): n is PromoMultiplierWithAssets {
  return (PROMO_MULTIPLIERS_WITH_ASSETS as readonly number[]).includes(n);
}

export function isPromoMultiplier(n: number): n is PromoMultiplier {
  return (PROMO_MULTIPLIERS as readonly number[]).includes(n);
}
