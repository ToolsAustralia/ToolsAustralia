import PaymentEvent from "@/models/PaymentEvent";
import type { RevenueBucketKey, AttributedPlatformKey } from "@/models/DashboardStatsDailySnapshot";
import { ATTRIBUTED_PLATFORM_KEYS } from "@/models/DashboardStatsDailySnapshot";
import { REVENUE_BUCKET_KEYS, classifyRevenueBucket, emptyBucket } from "./snapshotSchema";

export interface DayRevenueResult {
  total: number;
  buckets: Record<RevenueBucketKey, { revenue: number; purchaseCount: number }>;
  byPlatform: Record<AttributedPlatformKey, {
    revenue: number;
    conversions: number;
    byConfidence: { click: number; utm_only: number; inferred_backfill: number };
  }>;
}

function emptyByPlatform(): DayRevenueResult["byPlatform"] {
  const out = {} as DayRevenueResult["byPlatform"];
  for (const p of ATTRIBUTED_PLATFORM_KEYS) {
    out[p] = { revenue: 0, conversions: 0, byConfidence: { click: 0, utm_only: 0, inferred_backfill: 0 } };
  }
  return out;
}

function emptyBuckets(): Record<RevenueBucketKey, { revenue: number; purchaseCount: number }> {
  const out = {} as Record<RevenueBucketKey, { revenue: number; purchaseCount: number }>;
  for (const k of REVENUE_BUCKET_KEYS) out[k] = emptyBucket();
  return out;
}

/**
 * Aggregate net revenue for [dayStartUTC, dayEndUTC).
 * Caller passes a precomputed Set of refundedPaymentIntentIds so we don't run
 * a $lookup per row (massive speedup vs. the existing live aggregation pattern).
 *
 * `dayEndUTC` is EXCLUSIVE — pass next-day-midnight-AEST-in-UTC.
 */
export async function aggregateRevenueForDay(
  dayStartUTC: Date,
  dayEndUTC: Date,
  refundedPaymentIntentIds: Set<string>
): Promise<DayRevenueResult> {
  // Lean read of BenefitsGranted only in this UTC window.
  const events = await PaymentEvent.find(
    {
      eventType: "BenefitsGranted",
      timestamp: { $gte: dayStartUTC, $lt: dayEndUTC },
    },
    {
      paymentIntentId: 1,
      packageType: 1,
      packageId: 1,
      data: 1,
      timestamp: 1,
      convertingPlatform: 1,
      attributionConfidence: 1,
    }
  )
    .lean()
    .exec();

  const buckets = emptyBuckets();
  const byPlatform = emptyByPlatform();
  let total = 0;

  for (const ev of events) {
    const pid = (ev as { paymentIntentId?: string }).paymentIntentId;
    if (pid && refundedPaymentIntentIds.has(pid)) continue;

    const price = (ev as { data?: { price?: number } }).data?.price ?? 0;

    // Platform accumulation: runs for ALL non-refunded rows, regardless of bucket classification.
    const evTyped = ev as {
      convertingPlatform?: AttributedPlatformKey | null;
      attributionConfidence?: "click" | "utm_only" | "inferred_backfill" | null;
    };
    const platform: AttributedPlatformKey = evTyped.convertingPlatform ?? "direct";
    const conf: "click" | "utm_only" | "inferred_backfill" =
      evTyped.convertingPlatform == null
        ? "inferred_backfill"
        : (evTyped.attributionConfidence ?? "utm_only");
    byPlatform[platform].revenue += price;
    byPlatform[platform].conversions += 1;
    byPlatform[platform].byConfidence[conf] += price;

    const bucketKey = classifyRevenueBucket({
      packageType: (ev as { packageType?: string }).packageType,
      packageId: (ev as { packageId?: string }).packageId,
      billingReason: (ev as { data?: { billingReason?: string } }).data?.billingReason,
    });
    if (!bucketKey) continue;

    buckets[bucketKey].revenue += price;
    buckets[bucketKey].purchaseCount += 1;
    total += price;
  }

  return { total, buckets, byPlatform };
}

/**
 * Load the set of paymentIntentIds that have a RefundProcessed event (all-time).
 * Used once per cron invocation to avoid per-row $lookups.
 */
export async function loadRefundedPaymentIntentIds(): Promise<Set<string>> {
  const ids = await PaymentEvent.distinct("paymentIntentId", { eventType: "RefundProcessed" });
  return new Set(ids.filter((x): x is string => typeof x === "string"));
}
