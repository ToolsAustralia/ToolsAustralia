/**
 * Resolves promo banner badge text from variant override, draw status, scheduled text, and multiplier.
 * Keeps badge priority logic in one place (10x → "BIGGEST BONUS"; else draw/scheduled/alternating).
 */

export interface ResolveBadgeTextParams {
  variantBadgeText?: string;
  drawStatus: "today" | "tomorrow" | null;
  activeScheduledText?: string | null;
  alternatingDefault: string;
  /** Effective multiplier for current tab (or membership for 10x rule) */
  multiplier: number | null;
}

const BIGGEST_BONUS_TEXT = "BIGGEST BONUS";

/**
 * Resolve badge text for the promo banner.
 * Priority: variant override → 10x multiplier → draw status → scheduled text → alternating default.
 */
export function resolveBadgeText(params: ResolveBadgeTextParams): string {
  const {
    variantBadgeText,
    drawStatus,
    activeScheduledText,
    alternatingDefault,
    multiplier,
  } = params;

  if (variantBadgeText && variantBadgeText.trim().length > 0) {
    return variantBadgeText.trim();
  }

  if (multiplier === 10) {
    return BIGGEST_BONUS_TEXT;
  }

  if (drawStatus === "today") return "DRAWN TONIGHT";
  if (drawStatus === "tomorrow") return "DRAWN TOMORROW";
  if (activeScheduledText) return activeScheduledText;

  return alternatingDefault;
}
