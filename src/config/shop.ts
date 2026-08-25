/**
 * Shop commerce configuration.
 *
 * Deliberately narrow: only the money knobs. Legal identity (licence, ABN,
 * notification number) already lives in `src/constants/legal.ts` and must not be
 * duplicated here — a second copy is how a stale licence number ships.
 *
 * All amounts are INTEGER CENTS. Money never touches a float in this codebase's
 * shop path: `0.1 + 0.2 !== 0.3`, and a rounding helper papering over that is a
 * band-aid rather than a fix.
 */
export const SHOP_CONFIG = {
  /**
   * Flat domestic delivery, charged on EVERY order.
   *
   * There is deliberately no free-shipping threshold. One existed ($100, tested
   * against the discounted total) and it was removed on 2026-08-25 for two
   * reasons, one commercial and one structural.
   *
   * Commercially, the approved pricing works out to a flat $10 with nothing to
   * calculate — a threshold quietly inverted that. A $109.95 jacket shipped free
   * while the courier still billed $9.50-$15, so the sale earned $10 less than the
   * costing said. Worse, the test runs against what the customer PAYS, so a deeper
   * member discount pushed orders back under the line: a Foreman crossing $100
   * turned a price rise into a margin cut.
   *
   * Structurally, a threshold is a promise restated on five surfaces — two SEO
   * descriptions, a product tab, and two chatbot answers. It had already drifted
   * twice (see the label note below). One unconditional rule cannot drift.
   */
  flatShippingRateCents: 10_00,
} as const;

/**
 * A GST-inclusive amount divided by 11 is the GST component.
 *
 * Australian retail prices are quoted inclusive, so GST is never *added* — it is
 * reported as the portion already inside the total. Shipping is inside it too:
 * under ATO ruling GSTD 2002/3 a delivery charge supplied with taxable goods is
 * itself a taxable supply.
 */
export const GST_DIVISOR = 11;

export type ShopConfig = typeof SHOP_CONFIG;

/**
 * The delivery charge formatted for customer-facing copy — `"$10"`.
 *
 * Exists so no page hard-codes the figure. A previous threshold was restated as
 * "over $99" on two surfaces while `priceCart` used $100, so a $99.50 order was
 * promised free delivery and billed $10 at checkout. Copy that retypes a config
 * value drifts from it; import this instead.
 *
 * Whole dollars when the rate is whole, cents only when it is not.
 */
const dollarLabel = (cents: number) =>
  cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;

export const FLAT_SHIPPING_RATE_LABEL = dollarLabel(SHOP_CONFIG.flatShippingRateCents);
