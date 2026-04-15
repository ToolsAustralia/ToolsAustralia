/**
 * Renewal entries preview for Klaviyo profiles when subscription is in payment recovery.
 * Uses the same accumulation model as subscription renewals (calculateRenewalEntries).
 *
 * @module utils/integrations/klaviyo/klaviyo-renewal-entries-preview
 */

import type { IUser } from "@/models/User";
import { getPackageById } from "@/data/membershipPackages";
import { calculateRenewalEntries } from "@/utils/payment/subscription-entries-calculator";

const RECOVERY_STATUSES = new Set(["past_due", "unpaid"]);

/**
 * Whether the subscription status qualifies for past-due / recovery Klaviyo fields.
 */
export function isSubscriptionRecoveryStatus(status: string | undefined | null): boolean {
  if (!status || typeof status !== "string") return false;
  return RECOVERY_STATUSES.has(status.trim());
}

/**
 * Expected total entries on the next successful renewal (last accumulated + monthly base).
 * Returns null when not in recovery or when package data is missing.
 */
export function getRenewalEntriesPreviewForProfile(user: IUser): number | null {
  if (!isSubscriptionRecoveryStatus(user.subscription?.status)) {
    return null;
  }

  const rawPackageId = user.subscription?.packageId;
  if (rawPackageId === undefined || rawPackageId === null) {
    return null;
  }

  const packageId = String(rawPackageId).trim();
  if (!packageId) {
    return null;
  }

  const packageData = getPackageById(packageId);
  if (!packageData || packageData.entriesPerMonth === undefined) {
    return null;
  }

  const baseEntries = packageData.entriesPerMonth;
  const { entriesToGrant } = calculateRenewalEntries(baseEntries, user.subscription?.lastMonthAccumulatedEntries);

  return entriesToGrant;
}
