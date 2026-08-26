import DashboardStatsDailySnapshot, {
  ATTRIBUTED_PLATFORM_KEYS,
  type AttributedPlatformKey,
  type RevenueBucketKey,
} from "@/models/DashboardStatsDailySnapshot";
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
  attributedRevenue: Record<AttributedPlatformKey, {
    newRevenue: number;
    renewalRevenue: number;
    conversions: number;
    byConfidence: { click: number; utm_only: number; inferred_backfill: number };
  }>;
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
  /**
   * Compute `revenue.buckets[].userCount`. Default true — every existing caller reads it.
   *
   * Opt OUT when you do not: it is a PaymentEvent aggregation carrying a correlated `$lookup`
   * self-join plus `$addToSet` under `allowDiskUse`, and it runs unconditionally, so a caller
   * that never touches `userCount` pays for it once PER CALL. `getMerByDraw` calls this once
   * per draw and reads only `adChannels` + `attributedRevenue`, so it was buying N of these
   * aggregations per request and discarding all of them.
   *
   * When false, `userCount` stays 0 — deliberately not `undefined`, so the shape is unchanged.
   */
  includeDistinctUserCounts?: boolean;
}): Promise<SnapshotReadResult> {
  const { rangeStartUTC, rangeEndUTC, includeDistinctUserCounts = true } = args;

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
      // Never enumerate future days — they have no data, so computing them live is
      // pointless work (and was the source of the Facebook "since cannot be in the
      // future" error when a range like "Current Draw" runs to a future draw date).
      if (cursor > todayKey) break;
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
  const attributedRevenue = {} as Record<AttributedPlatformKey, { newRevenue: number; renewalRevenue: number; conversions: number; byConfidence: { click: number; utm_only: number; inferred_backfill: number } }>;
  for (const p of ATTRIBUTED_PLATFORM_KEYS) {
    attributedRevenue[p] = { newRevenue: 0, renewalRevenue: 0, conversions: 0, byConfidence: { click: 0, utm_only: 0, inferred_backfill: 0 } };
  }
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

  // First pass: sum snapshot days (cheap, in-memory) and collect the live days.
  // Live days are computed concurrently below to avoid sequential DB/HTTP latency.
  const liveDateKeys: string[] = [];
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

      const arMap = (snap.attributedRevenue ?? new Map()) as Map<string, { newRevenue?: number; renewalRevenue?: number; revenue?: number; conversions: number; byConfidence: { click: number; utm_only: number; inferred_backfill: number } }> | Record<string, { newRevenue?: number; renewalRevenue?: number; revenue?: number; conversions: number; byConfidence: { click: number; utm_only: number; inferred_backfill: number } }>;
      const arEntries = arMap instanceof Map ? Array.from(arMap.entries()) : Object.entries(arMap);
      for (const [p, v] of arEntries) {
        if (!ATTRIBUTED_PLATFORM_KEYS.includes(p as AttributedPlatformKey)) continue;
        const acc = attributedRevenue[p as AttributedPlatformKey];
        // v2 snapshots have `revenue` (old field) — guard so missing newRevenue reads as 0
        acc.newRevenue += v.newRevenue ?? 0;
        acc.renewalRevenue += v.renewalRevenue ?? 0;
        acc.conversions += v.conversions;
        acc.byConfidence.click += v.byConfidence?.click ?? 0;
        acc.byConfidence.utm_only += v.byConfidence?.utm_only ?? 0;
        acc.byConfidence.inferred_backfill += v.byConfidence?.inferred_backfill ?? 0;
      }
    } else {
      // Live day — defer to the bounded-concurrency pool below.
      liveDaysComputed += 1;
      if (!snap && !isToday) missingSnapshotDates.push(dateKey);
      liveDateKeys.push(dateKey);
    }
  }

  if (liveDateKeys.length > 0) {
    // Load the refund set ONCE before the pool. Do NOT call the lazy loader
    // concurrently — resolve it here and pass the same Set into each day.
    const refunded = await getRefunded();

    // Compute one live day's partial. Pure of any shared accumulator — all results
    // are summed afterwards, so completion order does not affect totals.
    async function computeLiveDay(dateKey: string): Promise<{
      revenueTotal: number;
      buckets: Record<RevenueBucketKey, { revenue: number; purchaseCount: number }>;
      newSignups: number;
      cancellations: number;
      adChannels: Record<string, { spend: number; revenue: number }>;
      byPlatform: Record<AttributedPlatformKey, { newRevenue: number; renewalRevenue: number; conversions: number; byConfidence: { click: number; utm_only: number; inferred_backfill: number } }>;
    }> {
      const isToday = dateKey === todayKey;
      const { dayStartUTC, dayEndUTC } = aestDayBounds(dateKey);
      const effectiveDayEnd = isToday ? new Date() : dayEndUTC;

      const rev = await aggregateRevenueForDay(dayStartUTC, effectiveDayEnd, refunded);
      const [signups, cancels] = await Promise.all([
        User.countDocuments({ createdAt: { $gte: dayStartUTC, $lt: effectiveDayEnd }, isActive: true }),
        User.countDocuments({ "subscription.cancelledAt": { $gte: dayStartUTC, $lt: effectiveDayEnd }, isActive: true }),
      ]);

      const dayBuckets = {} as Record<RevenueBucketKey, { revenue: number; purchaseCount: number }>;
      for (const k of REVENUE_BUCKET_KEYS) {
        dayBuckets[k] = { revenue: rev.buckets[k].revenue, purchaseCount: rev.buckets[k].purchaseCount };
      }

      const dayAdChannels: Record<string, { spend: number; revenue: number }> = {};
      for (const provider of AD_CHANNEL_PROVIDERS) {
        const result = await provider.fetchForDay({ dayStartUTC, dayEndUTC: effectiveDayEnd });
        // A live read is transient (never persisted), so "empty" and "error"
        // both just mean "no facebook for this day" — only "ok" contributes.
        if (result.status !== "ok") continue;
        dayAdChannels[provider.key] = { spend: result.metrics.spend, revenue: result.metrics.revenue };
      }

      return {
        revenueTotal: rev.total,
        buckets: dayBuckets,
        newSignups: signups,
        cancellations: cancels,
        adChannels: dayAdChannels,
        byPlatform: rev.byPlatform,
      };
    }

    // Bounded concurrency: process the live days in chunks of POOL_SIZE so we cap
    // simultaneous DB/HTTP work while still avoiding the old day-at-a-time latency.
    const POOL_SIZE = 8;
    const dayPartials: Awaited<ReturnType<typeof computeLiveDay>>[] = [];
    for (let i = 0; i < liveDateKeys.length; i += POOL_SIZE) {
      const chunk = liveDateKeys.slice(i, i + POOL_SIZE);
      const results = await Promise.all(chunk.map(computeLiveDay));
      dayPartials.push(...results);
    }

    // Reduce the partials into the accumulators. Every operation here is an
    // addition, so the result is identical regardless of completion order.
    for (const p of dayPartials) {
      revenueTotal += p.revenueTotal;
      for (const k of REVENUE_BUCKET_KEYS) {
        buckets[k].revenue += p.buckets[k].revenue;
        buckets[k].purchaseCount += p.buckets[k].purchaseCount;
      }
      newSignupsInRange += p.newSignups;
      cancellationsInRange += p.cancellations;
      for (const chanKey of Object.keys(p.adChannels)) {
        const m = p.adChannels[chanKey];
        const acc = adChannels[chanKey] ?? { spend: 0, revenue: 0, roas: 0 };
        acc.spend += m.spend;
        acc.revenue += m.revenue;
        adChannels[chanKey] = acc;
      }

      for (const pk of ATTRIBUTED_PLATFORM_KEYS) {
        const v = p.byPlatform[pk];
        attributedRevenue[pk].newRevenue += v.newRevenue;
        attributedRevenue[pk].renewalRevenue += v.renewalRevenue;
        attributedRevenue[pk].conversions += v.conversions;
        attributedRevenue[pk].byConfidence.click += v.byConfidence.click;
        attributedRevenue[pk].byConfidence.utm_only += v.byConfidence.utm_only;
        attributedRevenue[pk].byConfidence.inferred_backfill += v.byConfidence.inferred_backfill;
      }
    }
  }

  // Recompute ROAS per channel from summed totals (ROAS doesn't sum naturally).
  for (const chanKey of Object.keys(adChannels)) {
    const c = adChannels[chanKey];
    c.roas = c.spend > 0 ? c.revenue / c.spend : 0;
  }

  // Live distinct user counts per bucket. Skipped for callers that never read them — see the
  // `includeDistinctUserCounts` note on the signature. Leaves userCount at its initialised 0.
  if (includeDistinctUserCounts) {
    const distinctCounts = await computeDistinctUserCounts(rangeStartUTC, rangeEndUTC);
    for (const k of REVENUE_BUCKET_KEYS) {
      buckets[k].userCount = distinctCounts[k];
    }
  }

  return {
    revenue: { total: revenueTotal, buckets },
    users: { newSignupsInRange, cancellationsInRange },
    adChannels,
    attributedRevenue,
    meta: { snapshotDaysUsed, liveDaysComputed, missingSnapshotDates },
  };
}
