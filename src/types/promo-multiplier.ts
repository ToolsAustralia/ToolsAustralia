/**
 * Single source of truth for promo multiplier values across admin UI, API validators,
 * Mongoose enums, and client display. Extend PROMO_MULTIPLIERS when adding new tiers.
 */

export type PromoMultiplier = 2 | 3 | 5 | 10 | 12 | 15 | 20;

export const PROMO_MULTIPLIERS = [2, 3, 5, 10, 12, 15, 20] as const;

/** Multipliers that have bundled image assets (badges, some banners) shipped in-repo */
export const PROMO_MULTIPLIERS_WITH_ASSETS = [2, 3, 5, 10, 12, 15, 20] as const;

export type PromoMultiplierWithAssets = (typeof PROMO_MULTIPLIERS_WITH_ASSETS)[number];

export function hasBundledMultiplierAssets(n: number): n is PromoMultiplierWithAssets {
  return (PROMO_MULTIPLIERS_WITH_ASSETS as readonly number[]).includes(n);
}

export function isPromoMultiplier(n: number): n is PromoMultiplier {
  return (PROMO_MULTIPLIERS as readonly number[]).includes(n);
}
