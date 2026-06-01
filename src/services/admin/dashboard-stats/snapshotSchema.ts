import type { AttributedPlatformKey, RevenueBucketKey } from "@/models/DashboardStatsDailySnapshot";
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

// Bridges the convertingPlatform enum (e.g. "meta") to the ad-spend provider key
// (e.g. "facebook") for the true-ROAS join. null = no ad-spend channel → attributed
// revenue only, no ROAS.
export const PLATFORM_TO_AD_CHANNEL_KEY: Record<AttributedPlatformKey, string | null> = {
  meta: "facebook",
  tiktok: "tiktok",
  snapchat: "snapchat",
  google: "google",
  klaviyo_email: null,
  klaviyo_sms: null,
  direct: null,
  other: null,
};

/** Empty bucket object — used as the seed for accumulation. */
export function emptyBucket(): { revenue: number; purchaseCount: number } {
  return { revenue: 0, purchaseCount: 0 };
}
