import PaymentEvent from "@/models/PaymentEvent";
import type { RevenueBucketKey, AttributedPlatformKey } from "@/models/DashboardStatsDailySnapshot";
import { ATTRIBUTED_PLATFORM_KEYS } from "@/models/DashboardStatsDailySnapshot";
import { REVENUE_BUCKET_KEYS, classifyRevenueBucket, emptyBucket } from "./snapshotSchema";

export interface DayRevenueResult {
  total: number;
  buckets: Record<RevenueBucketKey, { revenue: number; purchaseCount: number }>;
  byPlatform: Record<AttributedPlatformKey, {
    newRevenue: number;
    renewalRevenue: number;
    conversions: number;
    byConfidence: { click: number; utm_only: number; inferred_backfill: number };
  }>;
}

function emptyByPlatform(): DayRevenueResult["byPlatform"] {
  const out = {} as DayRevenueResult["byPlatform"];
  for (const p of ATTRIBUTED_PLATFORM_KEYS) {
    out[p] = { newRevenue: 0, renewalRevenue: 0, conversions: 0, byConfidence: { click: 0, utm_only: 0, inferred_backfill: 0 } };
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

    // Merchandise is excluded from ad-revenue analytics entirely. Two reasons, and
    // the second is the one that breaks the page:
    //
    //   1. A merch price is not comparable to a package price — it carries shipping
    //      and GST, which no other packageType does. Folding it into ROAS silently
    //      changes what the number means.
    //   2. classifyRevenueBucket() returns null for "shop" (snapshotSchema.ts), so
    //      the row is dropped from `buckets` and from `total` — while the platform
    //      accumulation below runs "regardless of bucket classification". Left
    //      alone, merch money inflates per-platform newRevenue, conversions and
    //      TRUE ROAS while being absent from the headline, and the breakdown stops
    //      reconciling with the total it sits under.
    //
    // Giving merchandise its own revenue bucket is a reasonable alternative, but it
    // is an analytics decision (does merch belong in ad ROAS?), not a bug fix —
    // so this excludes rather than invents a bucket.
    if ((ev as { packageType?: string }).packageType === "shop") continue;

    const price = (ev as { data?: { price?: number } }).data?.price ?? 0;

    // Platform accumulation: runs for ALL non-refunded rows, regardless of bucket classification.
    const evTyped = ev as {
      convertingPlatform?: AttributedPlatformKey | null;
      attributionConfidence?: "click" | "utm_only" | "inferred_backfill" | null;
    };
    const platform = (evTyped.convertingPlatform ?? "direct") as AttributedPlatformKey;
    // Renewal discriminator MUST match the existing hourly-breakdown predicate
    // (PaymentEventRepository.aggregateRevenueByHourAndPlatform $nor): a membership row
    // whose data.billingReason is "subscription_cycle". data.billingReason is present on
    // EVERY row (incl. pre-feature history), so this is robust where the top-level
    // `isRenewal` field — which defaults false on historical rows — would silently leak
    // old renewals into acquisition revenue and inflate ROAS.
    const isRenewal =
      (ev as { packageType?: string }).packageType === "membership" &&
      (ev as { data?: { billingReason?: string } }).data?.billingReason === "subscription_cycle";
    if (isRenewal) {
      byPlatform[platform].renewalRevenue += price;
      // renewals are NOT ads revenue: excluded from newRevenue, conversions, byConfidence
    } else {
      const conf: "click" | "utm_only" | "inferred_backfill" =
        evTyped.convertingPlatform == null
          ? "inferred_backfill"
          : (evTyped.attributionConfidence ?? "utm_only");
      byPlatform[platform].newRevenue += price;
      byPlatform[platform].conversions += 1;
      byPlatform[platform].byConfidence[conf] += price;
    }

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
