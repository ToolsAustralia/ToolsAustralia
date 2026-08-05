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

/**
 * One-time "new" marker on the **Discounts** nav item, pointing at the public `/discount`.
 *
 * WHY localStorage AND NOT sessionStorage — the choice matters here.
 * sessionStorage is wiped when the tab closes, so the badge would return on every visit. A
 * "new" flag that reappears forever stops meaning new and starts meaning noise, which is the
 * exact failure this is meant to avoid. localStorage makes "once" actually mean once.
 *
 * WHY IT TAKES A NULLABLE userId, unlike its two siblings above.
 * `/discount` is a PUBLIC page — the visitor most worth nudging has no account yet. Signed-out
 * visitors share the `guest` bucket; signing in moves them to their own, so the badge can fire
 * once more for the person as a member. That re-fire is deliberate, not a bug: the page means
 * something different once you have an access level to measure against.
 *
 * The `discountNavNudgeSeen_` prefix is registered in `utils/auth/total-sign-out.ts`, so the
 * marker cannot follow the next person to sign in on a shared device (global auth-boundary
 * rule). Clearing the `guest` bucket at sign-out is intended — a shared device should treat
 * the next anonymous visitor as new.
 *
 * Key: discountNavNudgeSeen_${userId ?? "guest"}
 */
const discountNudgeKey = (userId: string | null | undefined): string =>
  `discountNavNudgeSeen_${userId || "guest"}`;

export const hasSeenDiscountNavNudge = (userId: string | null | undefined): boolean =>
  typeof window !== "undefined" && !!localStorage.getItem(discountNudgeKey(userId));

export const markDiscountNavNudgeSeen = (userId: string | null | undefined): void => {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(discountNudgeKey(userId), "true");
  } catch {
    // Private mode / storage disabled. The nudge simply shows again — a cosmetic repeat is a
    // far better failure than a thrown error inside a nav click handler.
  }
};
