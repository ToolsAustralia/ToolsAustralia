import type { RenewalProgress } from "@/types/admin/membershipAnalytics";

/**
 * Turn raw base/renewed counts into a display-ready renewal-progress block.
 * - rate is renewed/base as a 0–100 percentage (1 decimal place), capped at 100,
 *   and null when base is 0 (no snapshot / empty period).
 * - renewed is clamped to base when base is known, so the rate can never exceed 100%.
 */
export function summarizeRenewalProgress(input: {
  base: number;
  renewed: number;
  baseAsOf: string | null;
  isComplete: boolean;
}): RenewalProgress {
  const base = Math.max(0, Math.round(input.base));
  const renewedRaw = Math.max(0, Math.round(input.renewed));
  const renewed = base > 0 ? Math.min(renewedRaw, base) : renewedRaw;
  const rate = base > 0 ? Math.min(100, Math.round((renewed / base) * 1000) / 10) : null;
  const remaining = base > 0 ? Math.max(0, base - renewed) : 0;
  return { base, renewed, rate, remaining, baseAsOf: input.baseAsOf, isComplete: input.isComplete };
}
