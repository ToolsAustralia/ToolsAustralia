/**
 * Shop cart pricing — the single source of the money math.
 *
 * The cart drawer, the summary endpoint and the PaymentIntent all read from
 * here, so a figure can never drift between what a customer is quoted and what
 * they are charged. Before this module the flat-shipping rule existed in three
 * places and GST in one, and they disagreed.
 *
 * ALL PRICES ARE GST-INCLUSIVE. Australian retail is quoted inclusive, and every
 * price entered in the admin catalog assumes it. GST is therefore reported as a
 * COMPONENT of the total (`total / 11`) and is never added on top — the previous
 * `/api/cart/summary` added 10% to an already-inclusive price, overcharging by
 * exactly that much.
 *
 * Shipping is inside the GST component too: under ATO ruling GSTD 2002/3 a
 * delivery charge supplied with taxable goods is itself a taxable supply.
 */

export interface CartLine {
  price: number;
  quantity: number;
}

export interface PriceCartOptions {
  /** Member tier shop discount: Tradie 5, Foreman 10, Boss 20. Guests and packs 0. */
  shopDiscountPercent?: number;
  /** Order value at or above which shipping is free. */
  freeShippingThreshold?: number;
  flatShipping?: number;
}

export interface CartTotals {
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  /** The GST already inside `total`. Display only — never add it to anything. */
  gstComponent: number;
  totalItems: number;
}

/** GST-inclusive price / 11 = the GST component (10% of the ex-GST base). */
export const GST_DIVISOR = 11;
export const DEFAULT_FREE_SHIPPING_THRESHOLD = 100;
export const DEFAULT_FLAT_SHIPPING = 10;

const money = (n: number): number => Math.round(n * 100) / 100;

export function priceCart(lines: readonly CartLine[], opts: PriceCartOptions = {}): CartTotals {
  const {
    shopDiscountPercent = 0,
    freeShippingThreshold = DEFAULT_FREE_SHIPPING_THRESHOLD,
    flatShipping = DEFAULT_FLAT_SHIPPING,
  } = opts;

  const subtotal = money(lines.reduce((sum, l) => sum + l.price * l.quantity, 0));
  const totalItems = lines.reduce((sum, l) => sum + l.quantity, 0);

  // An empty cart costs nothing. Without this the threshold comparison (0 >= 100
  // is false) charges the flat shipping fee on a cart with nothing in it.
  if (totalItems === 0) {
    return { subtotal: 0, discount: 0, shipping: 0, total: 0, gstComponent: 0, totalItems: 0 };
  }

  const discount = money(subtotal * (shopDiscountPercent / 100));
  const discounted = money(subtotal - discount);

  // The threshold is tested against the DISCOUNTED value — what the customer
  // actually pays. Testing the pre-discount subtotal would ship a $90 order free
  // against a $100 threshold and quietly lose the fee on every discounted cart.
  const shipping = discounted >= freeShippingThreshold ? 0 : flatShipping;

  const total = money(discounted + shipping);

  return {
    subtotal,
    discount,
    shipping,
    total,
    gstComponent: money(total / GST_DIVISOR),
    totalItems,
  };
}
