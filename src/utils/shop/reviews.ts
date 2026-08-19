/**
 * When a product's reviews may be shown at all.
 *
 * Two conditions, both required: at least one real review, and an average of
 * four stars or better. Below either bar the whole section is hidden — no tab,
 * no empty shell, no "Reviews (0)" beside a row of grey stars, which is what a
 * brand-new print-to-order garment would otherwise show forever.
 *
 * This lives in its own module because four surfaces have to agree on the
 * threshold — the tab, the star row above the price, the JSON-LD, and the
 * listing card. A duplicated literal is exactly the drift that produced the
 * $99/$100 free-shipping mismatch recorded in src/config/shop.ts.
 */

export const MIN_DISPLAY_RATING = 4;

export function shouldShowReviews(input: { rating?: unknown; reviewCount?: number }): boolean {
  const rating =
    typeof input.rating === "number" && Number.isFinite(input.rating) ? input.rating : 0;
  const count = input.reviewCount ?? 0;
  return count >= 1 && rating >= MIN_DISPLAY_RATING;
}
