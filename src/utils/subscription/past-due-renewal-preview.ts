/**
 * What a past-due / unpaid member gets — and pays — when they resolve their failed renewal.
 *
 * Reuses the CANONICAL renewal-entries preview (`getRenewalEntriesPreviewForProfile`, which also drives
 * the Klaviyo `past_due_renewal_entries` property and the renewal-failure email's `expectedEntries`), so
 * the dashboard note, the resolve popup/sheet, the email, and Klaviyo all show the same number. The cost
 * is the tier's monthly price read from the SAME package the entries come from.
 *
 * @module utils/subscription/past-due-renewal-preview
 */

import type { IUser } from "@/models/User";
import { getPackageById } from "@/data/membershipPackages";
import {
  getRenewalEntriesPreviewForProfile,
  isSubscriptionRecoveryStatus,
} from "@/utils/integrations/klaviyo/klaviyo-renewal-entries-preview";

export interface PastDueRenewalPreview {
  /** Total entries granted on the next successful renewal (monthly base + carry-over), or null. */
  entries: number | null;
  /** The renewal charge the member settles (the tier's monthly price), or null. */
  cost: number | null;
}

/** Pure + client-safe. Returns { entries: null, cost: null } when the member isn't in payment recovery. */
export function getPastDueRenewalPreview(user: IUser): PastDueRenewalPreview {
  const entries = getRenewalEntriesPreviewForProfile(user);
  let cost: number | null = null;
  const rawPackageId = user.subscription?.packageId;
  if (isSubscriptionRecoveryStatus(user.subscription?.status) && rawPackageId != null) {
    const packageId = String(rawPackageId).trim();
    if (packageId) cost = getPackageById(packageId)?.price ?? null;
  }
  return { entries, cost };
}
