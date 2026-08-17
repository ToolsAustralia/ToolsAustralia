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
  /** Order value (after discount) at or above which shipping is free. */
  freeShippingThresholdCents: 100_00,
  /** Flat domestic shipping charged below the threshold. */
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
