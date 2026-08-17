/**
 * Shop cart pricing — the single source of the money math.
 *
 * The cart drawer, the summary endpoints and the PaymentIntent all read from
 * here, so a figure can never drift between what a customer is quoted and what
 * they are charged. The flat-shipping rule previously existed in seven places.
 *
 * TWO RULES THIS MODULE EXISTS TO ENFORCE
 *
 * 1. Money is INTEGER CENTS, never a float. `0.1 + 0.2 !== 0.3`, and Stripe
 *    charges in cents anyway, so dollars-with-rounding is a conversion bug
 *    waiting to happen. Callers convert to dollars only at a display or
 *    API-response boundary, via `centsToDollars`.
 *
 * 2. Prices are GST-INCLUSIVE. Every price in the admin catalog is entered
 *    inclusive, so GST is reported as the component already inside the total
 *    (`total / 11`) and is NEVER added. The previous code added 10% on top,
 *    overcharging every cart by exactly that much.
 */
import { GST_DIVISOR, SHOP_CONFIG } from "@/config/shop";

export interface CartLine {
  /** Unit price in integer cents. */
  priceCents: number;
  quantity: number;
}

export interface PriceCartOptions {
  /** Member tier shop discount: Tradie 5, Foreman 10, Boss 20. Guests and packs 0. */
  shopDiscountPercent?: number;
  freeShippingThresholdCents?: number;
  flatShippingRateCents?: number;
}

export interface CartTotals {
  subtotalCents: number;
  discountCents: number;
  shippingCents: number;
  totalCents: number;
  /** GST already INSIDE totalCents. Display only — never add it to anything. */
  gstCents: number;
  totalItems: number;
}

export const dollarsToCents = (dollars: number): number => Math.round(dollars * 100);
export const centsToDollars = (cents: number): number => cents / 100;

export function priceCart(lines: readonly CartLine[], opts: PriceCartOptions = {}): CartTotals {
  const {
    shopDiscountPercent = 0,
    freeShippingThresholdCents = SHOP_CONFIG.freeShippingThresholdCents,
    flatShippingRateCents = SHOP_CONFIG.flatShippingRateCents,
  } = opts;

  const subtotalCents = lines.reduce((sum, l) => sum + l.priceCents * l.quantity, 0);
  const totalItems = lines.reduce((sum, l) => sum + l.quantity, 0);

  // An empty cart costs nothing. Without this the threshold comparison
  // (0 >= 10000 is false) charges flat shipping on a cart with nothing in it.
  if (totalItems === 0) {
    return {
      subtotalCents: 0,
      discountCents: 0,
      shippingCents: 0,
      totalCents: 0,
      gstCents: 0,
      totalItems: 0,
    };
  }

  const discountCents = Math.round(subtotalCents * (shopDiscountPercent / 100));
  const discountedCents = subtotalCents - discountCents;

  // The threshold is tested against the DISCOUNTED value — what the customer
  // actually pays. Testing the pre-discount subtotal would ship a $90 order free
  // against a $100 threshold and quietly lose the fee on every discounted cart.
  const shippingCents = discountedCents >= freeShippingThresholdCents ? 0 : flatShippingRateCents;

  const totalCents = discountedCents + shippingCents;

  return {
    subtotalCents,
    discountCents,
    shippingCents,
    totalCents,
    gstCents: Math.round(totalCents / GST_DIVISOR),
    totalItems,
  };
}

/**
 * Dollar view of the totals, for API responses and display.
 *
 * The cart endpoints have long returned dollars, and their clients still expect
 * that shape — this is the one place the conversion happens.
 */
export function toDollarSummary(totals: CartTotals) {
  return {
    totalItems: totals.totalItems,
    subtotal: centsToDollars(totals.subtotalCents),
    discount: centsToDollars(totals.discountCents),
    shipping: centsToDollars(totals.shippingCents),
    totalAmount: centsToDollars(totals.totalCents),
    /** GST already INSIDE totalAmount. Display only. */
    tax: centsToDollars(totals.gstCents),
  };
}
