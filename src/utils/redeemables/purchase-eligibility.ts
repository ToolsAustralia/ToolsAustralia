import type { PurchaseRequirement } from "@/models/MonthlyEntryCampaign";

/** Minimal shape of the user fields needed to check a purchase requirement. */
export interface QualifyingPurchaseUser {
  subscription?: { isActive?: boolean; startDate?: Date | string | null } | null;
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
 * qualifying purchase INSIDE the campaign's active window** — every leg is an
 * EVENT check, never a state check:
 *
 * - `"none"`       → always eligible.
 * - `"membership"` → an active subscription whose PURCHASE (`subscription.startDate` —
 *                    set on join/resubscribe, both charged) falls inside the window.
 *                    Merely *being* a member does NOT qualify: the previous state check
 *                    (`isActive === true`) let every recipient of an
 *                    all-active-subscribers campaign with a "membership"/"any"
 *                    requirement claim instantly with zero purchase — the exact
 *                    "purchase required" bypass this predicate exists to prevent.
 * - `"one-time"`   → a one-time package purchased within `[startsAt, endsAt|now]`.
 * - `"any"`        → membership purchase OR one-time purchase in the window.
 *
 * Window floor is the campaign start (the natural "purchased during this
 * campaign" boundary); when the campaign never expires the ceiling is `now`.
 *
 * Known caveat: the downgrade route also resets `subscription.startDate` without a
 * charge, so a member who downgrades in-window would pass the membership leg — a
 * rare, member-initiated action; accepted and documented (rewards-redeemables docs).
 * The intended flow for existing members is carrying the code ON a purchase — the
 * webhook redeems it via this same predicate right after the purchase persists.
 */
export function hasQualifyingPurchase(
  user: QualifyingPurchaseUser,
  campaign: QualifyingPurchaseWindow,
  requirement: PurchaseRequirement,
  now: Date = new Date()
): boolean {
  if (requirement === "none") return true;

  const windowStart = new Date(campaign.startsAt).getTime();
  const windowEnd = campaign.endsAt ? new Date(campaign.endsAt).getTime() : now.getTime();
  const inWindow = (value: Date | string | null | undefined): boolean => {
    if (value == null) return false;
    const at = new Date(value).getTime();
    return Number.isFinite(at) && at >= windowStart && at <= windowEnd;
  };

  const hasMembershipPurchaseInWindow =
    user.subscription?.isActive === true && inWindow(user.subscription?.startDate);
  if (requirement === "membership") return hasMembershipPurchaseInWindow;

  const hasOneTimeInWindow = (user.oneTimePackages ?? []).some((pkg) => inWindow(pkg.purchaseDate));

  if (requirement === "one-time") return hasOneTimeInWindow;
  // "any"
  return hasMembershipPurchaseInWindow || hasOneTimeInWindow;
}
