/**
 * Resolves promo banner badge text fallbacks (legacy / internal priority chain).
 * Left column is image-first; this mainly supports remaining text fallbacks where used.
 */

export interface ResolveBadgeTextParams {
  variantBadgeText?: string;
  drawStatus: "today" | "tomorrow" | null;
  alternatingDefault: string;
  /** Effective multiplier for current tab (or membership for 10x rule) */
  multiplier: number | null;
}

const BIGGEST_BONUS_TEXT = "BIGGEST BONUS";

/**
 * Resolve badge text when not overridden earlier in the component (gap, no-promo, draw today, scheduled defaults).
 * Priority: variant override → 10x multiplier → draw today → alternating default.
 */
export function resolveBadgeText(params: ResolveBadgeTextParams): string {
  const { variantBadgeText, drawStatus, alternatingDefault, multiplier } = params;

  if (variantBadgeText && variantBadgeText.trim().length > 0) {
    return variantBadgeText.trim();
  }

  if (multiplier === 10) {
    return BIGGEST_BONUS_TEXT;
  }

  if (drawStatus === "today") return "DRAWN TONIGHT";

  return alternatingDefault;
}
