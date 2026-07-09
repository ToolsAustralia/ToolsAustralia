/**
 * Entries the member will receive on their NEXT successful renewal (or upon
 * settling a failed renewal) — the single canonical resolver shared by the admin
 * user-detail route, the Norm `users.get` service projection, and (via the same
 * underlying primitives) the customer dashboard note.
 *
 * Canonical math (`calculateRenewalEntries`): accumulated carry-forward + monthly
 * base. Renewals are **never** promo-multiplied — a promo multiplier applies only
 * at join / resubscribe / upgrade, so this matches what the member actually gets.
 *
 * State handling:
 *  - `past_due` / `unpaid` AND still recovering (`hasFailedRenewal`) → the recovery
 *    preview (what settling the failed renewal grants). A member who cancelled while
 *    past due is NOT recovering → null.
 *  - active + `autoRenew !== false` → effective-package base (downgrade-preservation
 *    aware) + carry-forward.
 *  - anything else (cancelled, autoRenew off, guest) → null (no renewal coming).
 *
 * @module utils/subscription/next-renewal-entries
 */

import type { IUser } from "@/models/User";
import { getPackageById } from "@/data/membershipPackages";
import { getEffectiveBenefits } from "@/utils/membership/benefit-resolution";
import { calculateRenewalEntries } from "@/utils/payment/subscription-entries-calculator";
import { hasFailedRenewal } from "@/utils/subscription/subscription-helpers";
import {
  getRenewalEntriesPreviewForProfile,
  isSubscriptionRecoveryStatus,
} from "@/utils/integrations/klaviyo/klaviyo-renewal-entries-preview";

/** Pure + server/client-safe. Returns null when no renewal grant is coming. */
export function resolveNextRenewalEntries(user: IUser): number | null {
  const sub = user.subscription;
  if (!sub) return null;

  if (isSubscriptionRecoveryStatus(sub.status)) {
    // Gate on hasFailedRenewal like every member-facing recovery surface:
    // cancelled-while-past-due (autoRenew off) is not recovering — no preview.
    return hasFailedRenewal(user) ? getRenewalEntriesPreviewForProfile(user) : null;
  }

  if (sub.isActive && sub.autoRenew !== false) {
    // effective.entriesPerMonth carries the CACHED preserved-benefit value during a
    // downgrade window (matches the dashboard) even if the previous package is
    // missing from static data; fall back to the stored package only when the whole
    // effective resolution is null.
    const effective = getEffectiveBenefits(user);
    const baseEntries =
      effective?.entriesPerMonth ??
      (sub.packageId ? getPackageById(String(sub.packageId))?.entriesPerMonth : undefined);
    if (baseEntries !== undefined) {
      return calculateRenewalEntries(baseEntries, sub.lastMonthAccumulatedEntries).entriesToGrant;
    }
  }

  return null;
}
