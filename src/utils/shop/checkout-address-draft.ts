/**
 * The in-progress delivery address, kept in `sessionStorage` so a refresh at the
 * card step does not wipe what the customer typed.
 *
 * WHY sessionStorage AND NOT localStorage: this is a half-finished form, not a
 * saved preference. It should die with the tab. The DURABLE copy lives on the user
 * document (`User.shippingAddress`), written only when an order is actually paid —
 * see `finalizeShopOrder`.
 *
 * PRIVACY: a delivery address is PII, so the key is registered in
 * `utils/auth/total-sign-out.ts` and cleared at sign-out. Without that, the next
 * person to sign in on a shared device would find the previous customer's home
 * address already typed into the checkout form.
 *
 * Every function is defensive about storage being unavailable — Safari private
 * mode throws on `sessionStorage` access, and losing a form draft must never take
 * the checkout page down with it.
 */

/** Registered in `USER_SESSION_KEYS` — keep the two in step. */
export const CHECKOUT_ADDRESS_DRAFT_KEY = "ta-checkout-address-draft";

export interface CheckoutAddressDraft {
  firstName: string;
  lastName: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  deliveryInstructions: string;
}

const FIELDS: readonly (keyof CheckoutAddressDraft)[] = [
  "firstName",
  "lastName",
  "phone",
  "addressLine1",
  "addressLine2",
  "city",
  "state",
  "postalCode",
  "deliveryInstructions",
];

/**
 * Reads only the known keys, as strings.
 *
 * A stored blob is attacker-controllable in the sense that anything can write to
 * sessionStorage, and it is also just old — a shape from a previous deploy. Picking
 * known fields means a stale or hostile payload can at worst prefill a field, never
 * inject a new one or a non-string into React state.
 */
export function readCheckoutAddressDraft(): Partial<CheckoutAddressDraft> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(CHECKOUT_ADDRESS_DRAFT_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    const source = parsed as Record<string, unknown>;
    const out: Partial<CheckoutAddressDraft> = {};
    for (const field of FIELDS) {
      const value = source[field];
      if (typeof value === "string" && value.length > 0) out[field] = value;
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch {
    return null;
  }
}

/** Writes the draft. A completely empty form clears the key rather than storing `{}`. */
export function writeCheckoutAddressDraft(draft: CheckoutAddressDraft): void {
  if (typeof window === "undefined") return;
  try {
    const hasAnything = FIELDS.some((f) => (draft[f] ?? "").trim().length > 0);
    if (!hasAnything) {
      window.sessionStorage.removeItem(CHECKOUT_ADDRESS_DRAFT_KEY);
      return;
    }
    window.sessionStorage.setItem(CHECKOUT_ADDRESS_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* storage unavailable — a lost draft must not break checkout */
  }
}

/** Called once an order is paid: the durable copy is on the user document now. */
export function clearCheckoutAddressDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(CHECKOUT_ADDRESS_DRAFT_KEY);
  } catch {
    /* nothing to do */
  }
}
