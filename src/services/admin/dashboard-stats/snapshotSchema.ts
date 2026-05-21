import type { RevenueBucketKey } from "@/models/DashboardStatsDailySnapshot";
import { REVENUE_BUCKET_KEYS } from "@/models/DashboardStatsDailySnapshot";

export { REVENUE_BUCKET_KEYS };
export type { RevenueBucketKey };

/**
 * Maps a raw PaymentEvent's (packageType, packageId, billingReason) into a
 * RevenueBucketKey. Mirrors the existing categorization logic in
 * src/app/api/admin/dashboard/stats/route.ts so snapshots are bit-for-bit
 * comparable to live aggregation during drift verification.
 */
export function classifyRevenueBucket(args: {
  packageType: string | undefined;
  packageId: string | undefined;
  billingReason: string | undefined;
}): RevenueBucketKey | null {
  const { packageType, packageId, billingReason } = args;
  if (packageType === "membership") {
    return billingReason === "subscription_cycle" ? "membershipRenewal" : "membershipPurchase";
  }
  if (packageType === "mini-draw") return "miniDraw";
  if (packageType === "upsell") return "upsell";
  if (packageType === "one-time") {
    if ((packageId ?? "").startsWith("additional-")) return "additionalOneTimePurchase";
    return "oneTimePurchase"; // includes the legacy fallback for unknown patterns
  }
  return null;
}

/** Empty bucket object — used as the seed for accumulation. */
export function emptyBucket(): { revenue: number; purchaseCount: number } {
  return { revenue: 0, purchaseCount: 0 };
}
