/**
 * Feature flag helpers
 *
 * Centralises feature toggles that we want to consume on both the server and client.
 * Flags can be driven by environment variables so we can pause or resume
 * functionality without code changes.
 */

/**
 * Convenience parsing that treats anything except the string "true" (case-insensitive)
 * as a falsy toggle. New engineers can read this and quickly understand that we default
 * to off unless an environment explicitly enables it.
 */
const parseBooleanFlag = (rawValue?: string): boolean => {
  if (!rawValue) {
    return false;
  }

  return rawValue.trim().toLowerCase() === "true";
};

/**
 * Rewards system toggle. We prioritise the server-side `REWARDS_ENABLED` flag when set,
 * then fall back to `NEXT_PUBLIC_REWARDS_ENABLED` so that client bundles receive
 * the same value.
 */
export const rewardsEnabled = (): boolean => {
  const serverRaw = process.env.REWARDS_ENABLED;
  if (typeof serverRaw === "string") {
    return parseBooleanFlag(serverRaw);
  }

  const clientRaw = process.env.NEXT_PUBLIC_REWARDS_ENABLED;
  if (typeof clientRaw === "string") {
    return parseBooleanFlag(clientRaw);
  }

  return false;
};

/**
 * Partner-discount portal (SSO) toggle — the SAME concept the SSO route gates on
 * (`PARTNER_DISCOUNT_SSO_ENABLED`, see `src/app/api/partner-discount/sso/route.ts`).
 * Kept OFF by default until the SSO integration ships. Gates the portal UI entry
 * points (dashboard-hero "Reward portal" button + the Rewards-page "Open partner
 * portal" button, which shows "Coming soon" meanwhile).
 *
 * The route reads the **server** var; these buttons are **client-rendered**, so the
 * client needs the `NEXT_PUBLIC_` twin (same `rewardsEnabled` precedent above). Set
 * BOTH to the same value: `PARTNER_DISCOUNT_SSO_ENABLED` (gates the route) and
 * `NEXT_PUBLIC_PARTNER_DISCOUNT_SSO_ENABLED` (gates the UI).
 */
export const partnerDiscountSsoEnabled = (): boolean => {
  const serverRaw = process.env.PARTNER_DISCOUNT_SSO_ENABLED;
  if (typeof serverRaw === "string") {
    return parseBooleanFlag(serverRaw);
  }

  const clientRaw = process.env.NEXT_PUBLIC_PARTNER_DISCOUNT_SSO_ENABLED;
  if (typeof clientRaw === "string") {
    return parseBooleanFlag(clientRaw);
  }

  return false;
};
