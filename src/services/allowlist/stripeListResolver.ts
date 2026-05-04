import type Stripe from "stripe";

/**
 * The Stripe SDK v18 exposes the radar resource as an inline object on the
 * Stripe instance (no exported `Stripe.RadarResource` type). We pull the
 * type directly from `Stripe["radar"]` so callers can pass `stripe.radar`.
 */
type StripeRadar = Stripe["radar"];

let cachedListId: string | null = null;
let inflight: Promise<string> | null = null;

/**
 * Resolves the Stripe Radar `allow_card_fingerprint` value list ID.
 * Cached for the process lifetime — the alias is stable per Stripe account.
 */
export async function getAllowCardFingerprintListId(stripeRadar: StripeRadar): Promise<string> {
  if (cachedListId) return cachedListId;
  if (inflight) return inflight;

  inflight = (async () => {
    const lists = await stripeRadar.valueLists.list({ alias: "allow_card_fingerprint" });
    const list = lists.data[0];
    if (!list) {
      throw new Error(
        "Stripe Radar built-in `allow_card_fingerprint` value list not found. " +
          "Verify Radar is enabled on this Stripe account."
      );
    }
    cachedListId = list.id;
    return list.id;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

/** Test-only helper to reset the cache between tests. */
export function _resetAllowCardFingerprintListIdCache(): void {
  cachedListId = null;
  inflight = null;
}
