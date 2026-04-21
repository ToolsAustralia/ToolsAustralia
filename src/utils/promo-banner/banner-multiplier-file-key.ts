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
