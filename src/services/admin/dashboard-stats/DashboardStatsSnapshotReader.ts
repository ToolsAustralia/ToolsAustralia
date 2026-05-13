import DashboardStatsDailySnapshot, { type RevenueBucketKey } from "@/models/DashboardStatsDailySnapshot";
import { formatInTimeZone } from "date-fns-tz";
import { aestDayBounds } from "./DashboardStatsSnapshotWriter";
import { REVENUE_BUCKET_KEYS, emptyBucket } from "./snapshotSchema";
import { aggregateRevenueForDay, loadRefundedPaymentIntentIds } from "./revenueAggregator";
import { computeDistinctUserCounts } from "./distinctUserCounts";
import { AD_CHANNEL_PROVIDERS } from "./adChannelProviders";
import User from "@/models/User";

const TZ = "Australia/Sydney";

export interface SnapshotReadResult {
  revenue: {
    total: number;
    buckets: Record<RevenueBucketKey, { revenue: number; purchaseCount: number; userCount: number }>;
  };
  users: {
    newSignupsInRange: number;
    cancellationsInRange: number;
  };
  adChannels: Record<string, { spend: number; revenue: number; roas: number }>;
  meta: {
    snapshotDaysUsed: number;
    liveDaysComputed: number;
    missingSnapshotDates: string[];
  };
}

function aestKey(d: Date): string {
  return formatInTimeZone(d, TZ, "yyyy-MM-dd");
}

function emptyBuckets(): Record<RevenueBucketKey, { revenue: number; purchaseCount: number; userCount: number }> {
  const out = {} as Record<RevenueBucketKey, { revenue: number; purchaseCount: number; userCount: number }>;
  for (const k of REVENUE_BUCKET_KEYS) out[k] = { ...emptyBucket(), userCount: 0 };
  return out;
}

/**
 * Read dashboard stats for [rangeStartUTC, rangeEndUTC] where both are
 * midnight-AEST boundaries (whole AEST days only — enforced by the date picker).
 *
 * - Whole completed AEST days in range are summed from snapshots.
 * - If the range includes "today" (not yet snapshotted), today is computed live.
 * - Missing snapshots fall back to live computation and are flagged in meta.missingSnapshotDates.
 * - userCount per bucket is ALWAYS live (see distinctUserCounts.ts).
 */
export async function readStatsForRange(args: {
  rangeStartUTC: Date;
  rangeEndUTC: Date;
}): Promise<SnapshotReadResult> {
  const { rangeStartUTC, rangeEndUTC } = args;

  const startKey = aestKey(rangeStartUTC);
  // rangeEndUTC is meant to be the END of the last AEST day (or now() for "today"-inclusive).
  // We derive the end AEST date by formatting (rangeEndUTC - 1ms).
  const endKey = aestKey(new Date(rangeEndUTC.getTime() - 1));
  const todayKey = aestKey(new Date());

  // Enumerate AEST date keys in the range, inclusive.
  const dateKeys: string[] = [];
  {
    let cursor = startKey;
    while (cursor <= endKey) {
      dateKeys.push(cursor);
      const { dayEndUTC } = aestDayBounds(cursor);
      cursor = aestKey(dayEndUTC);
    }
  }

  // Load all snapshots in range in one query
  const snapshots = await DashboardStatsDailySnapshot.find({
    date: { $in: dateKeys },
  }).lean();
  const snapByDate = new Map<string, (typeof snapshots)[number]>();
  for (const s of snapshots) snapByDate.set(s.date, s);

  const buckets = emptyBuckets();
  const adChannels: Record<string, { spend: number; revenue: number; roas: number }> = {};
  let revenueTotal = 0;
  let newSignupsInRange = 0;
  let cancellationsInRange = 0;
  const missingSnapshotDates: string[] = [];
  let snapshotDaysUsed = 0;
  let liveDaysComputed = 0;

  // For live days we need the refund set ONCE.
  let refundedLazy: Set<string> | null = null;
  async function getRefunded(): Promise<Set<string>> {
    if (refundedLazy === null) refundedLazy = await loadRefundedPaymentIntentIds();
    return refundedLazy;
  }

  for (const dateKey of dateKeys) {
    const isToday = dateKey === todayKey;
    const snap = snapByDate.get(dateKey);

    if (snap && !isToday) {
      // Snapshot day — sum it
      snapshotDaysUsed += 1;
      revenueTotal += snap.revenue?.total ?? 0;
      const bucketsMap = (snap.revenue?.buckets ?? new Map()) as Map<string, { revenue: number; purchaseCount: number }> | Record<string, { revenue: number; purchaseCount: number }>;
      const entries = bucketsMap instanceof Map ? Array.from(bucketsMap.entries()) : Object.entries(bucketsMap);
      for (const [k, v] of entries) {
        if (!REVENUE_BUCKET_KEYS.includes(k as RevenueBucketKey)) continue;
        buckets[k as RevenueBucketKey].revenue += v.revenue;
        buckets[k as RevenueBucketKey].purchaseCount += v.purchaseCount;
      }
      newSignupsInRange += snap.users?.newSignups ?? 0;
      cancellationsInRange += snap.users?.cancellationsInDay ?? 0;

      const adMap = (snap.adChannels ?? new Map()) as Map<string, { spend: number; revenue: number; roas: number }> | Record<string, { spend: number; revenue: number; roas: number }>;
      const adEntries = adMap instanceof Map ? Array.from(adMap.entries()) : Object.entries(adMap);
      for (const [chanKey, m] of adEntries) {
        const acc = adChannels[chanKey] ?? { spend: 0, revenue: 0, roas: 0 };
        acc.spend += m.spend;
        acc.revenue += m.revenue;
        // ROAS will be recomputed at the end as totalRevenue/totalSpend
        adChannels[chanKey] = acc;
      }
    } else {
      // Live day — compute on the fly
      liveDaysComputed += 1;
      if (!snap && !isToday) missingSnapshotDates.push(dateKey);

      const { dayStartUTC, dayEndUTC } = aestDayBounds(dateKey);
      const effectiveDayEnd = isToday ? new Date() : dayEndUTC;
      const refunded = await getRefunded();
      const rev = await aggregateRevenueForDay(dayStartUTC, effectiveDayEnd, refunded);
      revenueTotal += rev.total;
      for (const k of REVENUE_BUCKET_KEYS) {
        buckets[k].revenue += rev.buckets[k].revenue;
        buckets[k].purchaseCount += rev.buckets[k].purchaseCount;
      }
      const [signups, cancels] = await Promise.all([
        User.countDocuments({ createdAt: { $gte: dayStartUTC, $lt: effectiveDayEnd }, isActive: true }),
        User.countDocuments({ "subscription.cancelledAt": { $gte: dayStartUTC, $lt: effectiveDayEnd }, isActive: true }),
      ]);
      newSignupsInRange += signups;
      cancellationsInRange += cancels;

      for (const provider of AD_CHANNEL_PROVIDERS) {
        const metrics = await provider.fetchForDay({ dayStartUTC, dayEndUTC: effectiveDayEnd });
        if (!metrics) continue;
        const acc = adChannels[provider.key] ?? { spend: 0, revenue: 0, roas: 0 };
        acc.spend += metrics.spend;
        acc.revenue += metrics.revenue;
        adChannels[provider.key] = acc;
      }
    }
  }

  // Recompute ROAS per channel from summed totals (ROAS doesn't sum naturally).
  for (const chanKey of Object.keys(adChannels)) {
    const c = adChannels[chanKey];
    c.roas = c.spend > 0 ? c.revenue / c.spend : 0;
  }

  // Live distinct user counts per bucket
  const distinctCounts = await computeDistinctUserCounts(rangeStartUTC, rangeEndUTC);
  for (const k of REVENUE_BUCKET_KEYS) {
    buckets[k].userCount = distinctCounts[k];
  }

  return {
    revenue: { total: revenueTotal, buckets },
    users: { newSignupsInRange, cancellationsInRange },
    adChannels,
    meta: { snapshotDaysUsed, liveDaysComputed, missingSnapshotDates },
  };
}
