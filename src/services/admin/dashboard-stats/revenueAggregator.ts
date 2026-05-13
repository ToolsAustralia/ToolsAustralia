import PaymentEvent from "@/models/PaymentEvent";
import type { RevenueBucketKey } from "@/models/DashboardStatsDailySnapshot";
import { REVENUE_BUCKET_KEYS, classifyRevenueBucket, emptyBucket } from "./snapshotSchema";

export interface DayRevenueResult {
  total: number;
  buckets: Record<RevenueBucketKey, { revenue: number; purchaseCount: number }>;
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
    }
  )
    .lean()
    .exec();

  const buckets = emptyBuckets();
  let total = 0;

  for (const ev of events) {
    const pid = (ev as { paymentIntentId?: string }).paymentIntentId;
    if (pid && refundedPaymentIntentIds.has(pid)) continue;

    const price = (ev as { data?: { price?: number } }).data?.price ?? 0;
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

  return { total, buckets };
}

/**
 * Load the set of paymentIntentIds that have a RefundProcessed event (all-time).
 * Used once per cron invocation to avoid per-row $lookups.
 */
export async function loadRefundedPaymentIntentIds(): Promise<Set<string>> {
  const ids = await PaymentEvent.distinct("paymentIntentId", { eventType: "RefundProcessed" });
  return new Set(ids.filter((x): x is string => typeof x === "string"));
}
