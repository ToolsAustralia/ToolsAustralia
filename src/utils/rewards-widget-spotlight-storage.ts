/**
 * localStorage helpers for one-time-per-account rewards widget spotlight.
 * Key: rewardsWidgetSpotlightSeen_${userId}
 */

export const hasSeenRewardsSpotlight = (userId: string): boolean =>
  typeof window !== "undefined" && !!localStorage.getItem(`rewardsWidgetSpotlightSeen_${userId}`);

export const markRewardsSpotlightSeen = (userId: string): void => {
  if (typeof window !== "undefined") {
    localStorage.setItem(`rewardsWidgetSpotlightSeen_${userId}`, "true");
  }
};

/**
 * One-time-per-account nudge toward the NEW partner catalogue
 * (`/my-account/rewards/catalogue`).
 *
 * Separate key from the widget spotlight above so the two features can be retired
 * independently — a member who dismissed the widget years ago should still be shown a
 * surface that did not exist then.
 *
 * It resolves on ARRIVAL, not on click: the catalogue page marks it seen when it mounts, so
 * the indicator disappears once the member has actually been there, and survives them
 * clicking past it. Same shape as its sibling, and the `partnerCatalogueSpotlightSeen_`
 * prefix is registered in `utils/auth/total-sign-out.ts` — a per-user breadcrumb must not
 * follow the next person to sign in on a shared device.
 *
 * Key: partnerCatalogueSpotlightSeen_${userId}
 */
export const hasSeenPartnerCatalogueSpotlight = (userId: string): boolean =>
  typeof window !== "undefined" && !!localStorage.getItem(`partnerCatalogueSpotlightSeen_${userId}`);

export const markPartnerCatalogueSpotlightSeen = (userId: string): void => {
  if (typeof window !== "undefined") {
    localStorage.setItem(`partnerCatalogueSpotlightSeen_${userId}`, "true");
  }
};
