/**
 * Which reviews a customer sees, and when the section appears at all.
 *
 * THE RULE, set by the business: only reviews of four stars or better are
 * displayed. A one-, two- or three-star review is stored exactly as written and
 * is simply not rendered.
 *
 * This is a deliberate commercial decision, recorded here rather than buried in a
 * component so nobody re-derives it or quietly changes the threshold. Two
 * consequences follow from it that the code must handle honestly, and does:
 *
 *  1. THE AVERAGE AND THE COUNT SHOWN MUST DESCRIBE THE REVIEWS SHOWN. If the
 *     page displayed four 5-star reviews under a 3.2 average computed from every
 *     review including the hidden ones, the number would contradict the list
 *     directly beneath it. `displayableReviews` and `displayAverage` are always
 *     used together for that reason — never mix a displayed list with
 *     `Product.rating`, which is the true average across everything.
 *  2. A PRODUCT WITH ONLY LOW REVIEWS SHOWS NO SECTION, not an empty one. Same
 *     treatment as a product nobody has reviewed yet.
 *
 * `Product.rating` and `Product.reviewCount` remain the honest figures over ALL
 * reviews — they are what admin and any future reporting should read. Nothing
 * here rewrites them.
 *
 * This lives in its own module because four surfaces must agree: the reviews tab,
 * the star row above the price, the JSON-LD, and the listing card. A duplicated
 * threshold is the drift that produced the $99/$100 free-shipping mismatch
 * recorded in src/config/shop.ts.
 */

/** Reviews below this many stars are not displayed. */
export const MIN_DISPLAY_RATING = 4;

export interface DisplayableReview {
  rating: number;
  comment?: string;
  createdAt?: string | Date;
  reviewer?: string;
}

/** The reviews that may be shown, newest first. */
export function displayableReviews<T extends { rating: number; createdAt?: string | Date }>(
  reviews: readonly T[] | undefined
): T[] {
  if (!Array.isArray(reviews)) return [];
  return reviews
    .filter((r) => typeof r.rating === "number" && r.rating >= MIN_DISPLAY_RATING)
    .slice()
    .sort((a, b) => {
      const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bt - at;
    });
}

/**
 * The average of the DISPLAYED reviews, to one decimal place.
 *
 * Not `Product.rating`. That is the true average over every review, which by
 * design is lower than what the visible list supports — printing it above a list
 * of 5-star reviews would read as a mistake.
 */
export function displayAverage(reviews: readonly { rating: number }[]): number {
  if (reviews.length === 0) return 0;
  const total = reviews.reduce((sum, r) => sum + r.rating, 0);
  return Math.round((total / reviews.length) * 10) / 10;
}

/**
 * Whether the reviews section appears.
 *
 * Takes the DISPLAYABLE count — a product with three 2-star reviews has none, and
 * is treated exactly like a product nobody has reviewed.
 */
export function shouldShowReviews(input: { displayableCount?: number }): boolean {
  return (input.displayableCount ?? 0) >= 1;
}
