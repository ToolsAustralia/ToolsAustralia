import type { PromoMultiplierWithAssets } from "@/types/promo-multiplier";

/**
 * Map effective multiplier to a filename tier for static promo banner art.
 * 12/15/20 (and any unknown) → 10 until branded assets ship.
 */
export function bannerMultiplierFileKey(multiplier: number | null): PromoMultiplierWithAssets {
  if (multiplier === 2 || multiplier === 3 || multiplier === 5 || multiplier === 10) {
    return multiplier;
  }
  return 10;
}

/** Tiers shipped for SpecialPromo art (no 2x). 2/unknown → 10 (highest shipped). */
export type SpecialPromoMultiplierFileKey = 3 | 5 | 10;

/**
 * Map effective multiplier to a SpecialPromo filename tier. Only 3/5/10 ship for special promo;
 * anything else (2, 12, 15, 20, null, unknown) → 10. 2x is expected to be excluded from promos.
 */
export function specialPromoMultiplierFileKey(multiplier: number | null): SpecialPromoMultiplierFileKey {
  if (multiplier === 3 || multiplier === 5 || multiplier === 10) {
    return multiplier;
  }
  return 10;
}
