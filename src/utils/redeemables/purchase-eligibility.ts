import type { PurchaseRequirement } from "@/models/MonthlyEntryCampaign";

/** Minimal shape of the user fields needed to check a purchase requirement. */
export interface QualifyingPurchaseUser {
  subscription?: { isActive?: boolean } | null;
  oneTimePackages?: Array<{ purchaseDate: Date | string }> | null;
}

/** Minimal shape of the campaign window needed to bound a qualifying purchase. */
export interface QualifyingPurchaseWindow {
  startsAt: Date | string;
  endsAt?: Date | string | null;
  neverExpires?: boolean;
}

/**
 * Whether the user satisfies a monthly-coupon campaign's `purchaseRequirement`.
 *
 * A purchase-gated coupon may only be redeemed once the user has made a **real
 * qualifying purchase inside the campaign's active window** — NOT merely because
 * they hold a lifetime entry balance (`accumulatedEntries`) or an old
 * subscription. The previous enforcement used `accumulatedEntries === 0` as a
 * proxy, which let any past purchaser (or any active subscriber, for a one-time
 * requirement) redeem a "buy to unlock" coupon for free.
 *
 * - `"none"`       → always eligible.
 * - `"membership"` → an active subscription (members re-bill each cycle).
 * - `"one-time"`   → a one-time package purchased within `[startsAt, endsAt|now]`.
 * - `"any"`        → membership OR a one-time purchase in the window.
 *
 * Window floor is the campaign start (the natural "purchased during this
 * campaign" boundary); when the campaign never expires the ceiling is `now`.
 */
export function hasQualifyingPurchase(
  user: QualifyingPurchaseUser,
  campaign: QualifyingPurchaseWindow,
  requirement: PurchaseRequirement,
  now: Date = new Date()
): boolean {
  if (requirement === "none") return true;

  const hasMembership = user.subscription?.isActive === true;
  if (requirement === "membership") return hasMembership;

  const windowStart = new Date(campaign.startsAt).getTime();
  const windowEnd = campaign.endsAt ? new Date(campaign.endsAt).getTime() : now.getTime();
  const hasOneTimeInWindow = (user.oneTimePackages ?? []).some((pkg) => {
    const purchasedAt = new Date(pkg.purchaseDate).getTime();
    return Number.isFinite(purchasedAt) && purchasedAt >= windowStart && purchasedAt <= windowEnd;
  });

  if (requirement === "one-time") return hasOneTimeInWindow;
  // "any"
  return hasMembership || hasOneTimeInWindow;
}
