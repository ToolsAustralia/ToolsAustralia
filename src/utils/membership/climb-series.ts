/**
 * Cumulative "standing entries" series for the membership climb chart.
 *
 * Month 1 = base * promo (signup boost), each later month adds `base` only —
 * mirrors the subscription entries accumulation model. Returns a length-`months`
 * array of cumulative totals.
 */
export function buildClimbSeries(baseEntries: number, promo: number, months: number): number[] {
  return Array.from(
    { length: Math.max(0, months) },
    (_, i) => baseEntries * promo + baseEntries * i,
  );
}
