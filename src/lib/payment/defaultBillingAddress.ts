/**
 * Stripe PaymentElement with `billingDetails: "never"` still requires a full address
 * on `confirmPayment`. Prefer the user's saved address when available.
 */

export interface StripeBillingAddress {
  line1: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
}

const DEFAULT: StripeBillingAddress = {
  country: "AU",
  state: "NSW",
  city: "Sydney",
  postal_code: "2000",
  line1: "1 Martin Place",
};

export const DEFAULT_BILLING_ADDRESS: Readonly<StripeBillingAddress> = DEFAULT;

type AddressLike = Partial<{
  line1: string;
  city: string;
  state: string;
  postal_code: string;
  postalCode: string;
  country: string;
  address: string;
  street: string;
}>;

/** Session user or IUser slice may expose address-like fields now or in the future */
export function resolveBillingAddress(user: unknown): StripeBillingAddress {
  if (!user || typeof user !== "object") {
    return { ...DEFAULT };
  }
  const u = user as { billingAddress?: AddressLike; address?: AddressLike };
  const src = u.billingAddress ?? u.address;
  if (!src) return { ...DEFAULT };

  const line1 = src.line1 ?? src.street ?? src.address ?? DEFAULT.line1;
  const city = src.city ?? DEFAULT.city;
  const state = src.state ?? DEFAULT.state;
  const postal = src.postal_code ?? src.postalCode ?? DEFAULT.postal_code;
  const country = (src.country ?? DEFAULT.country).toUpperCase().slice(0, 2) || DEFAULT.country;

  return {
    line1,
    city,
    state,
    postal_code: postal,
    country,
  };
}
