import User from "@/models/User";
import DashboardStatsDailySnapshot, {
  DASHBOARD_STATS_SNAPSHOT_SOURCE_VERSION,
  ATTRIBUTED_PLATFORM_KEYS,
  type AttributedPlatformKey,
  type IAttributedRevenue,
  type IRevenueBucket,
} from "@/models/DashboardStatsDailySnapshot";
import { createAESTDateAsUTC } from "@/utils/common/timezone";
import { formatInTimeZone } from "date-fns-tz";
import { aggregateRevenueForDay, loadRefundedPaymentIntentIds } from "./revenueAggregator";
import { REVENUE_BUCKET_KEYS } from "./snapshotSchema";
import {
  AD_CHANNEL_PROVIDERS,
  mergeAdChannels,
  type AdChannelFetchResult,
  type AdChannelMetrics,
} from "./adChannelProviders";

const AEST_TIMEZONE = "Australia/Sydney";

export interface WriteResult {
  date: string; // YYYY-MM-DD AEST
  ok: boolean;
  error?: string;
}

function aestDateKey(dayStartUTC: Date): string {
  return formatInTimeZone(dayStartUTC, AEST_TIMEZONE, "yyyy-MM-dd");
}

/**
 * Parse an AEST date key (YYYY-MM-DD) into [startUTC, endUTC) representing
 * that AEST calendar day. Handles AEST/AEDT automatically via createAESTDateAsUTC.
 */
export function aestDayBounds(dateKey: string): { dayStartUTC: Date; dayEndUTC: Date } {
  const [yearStr, monthStr, dayStr] = dateKey.split("-");
  const y = parseInt(yearStr, 10);
  const m = parseInt(monthStr, 10);
  const d = parseInt(dayStr, 10);
  const dayStartUTC = createAESTDateAsUTC(y, m, d, 0, 0);
  // End is midnight of the next AEST day. addDays in UTC space then re-resolve in AEST.
  const nextDay = new Date(dayStartUTC.getTime() + 26 * 60 * 60 * 1000); // overshoot to clear DST
  const nyear = parseInt(formatInTimeZone(nextDay, AEST_TIMEZONE, "yyyy"), 10);
  const nmonth = parseInt(formatInTimeZone(nextDay, AEST_TIMEZONE, "M"), 10);
  const nday = parseInt(formatInTimeZone(nextDay, AEST_TIMEZONE, "d"), 10);
  const dayEndUTC = createAESTDateAsUTC(nyear, nmonth, nday, 0, 0);
  return { dayStartUTC, dayEndUTC };
}

/**
 * The AEST date key one calendar day before `dateKey`.
 *
 * Steps back 2h from that day's midnight and re-resolves in AEST, so it is correct in both
 * DST directions: a 1h shift can never carry 22:00/23:00 back past the previous midnight.
 */
export function aestPreviousDateKey(dateKey: string): string {
  const { dayStartUTC } = aestDayBounds(dateKey);
  return aestDateKey(new Date(dayStartUTC.getTime() - 2 * 60 * 60 * 1000));
}

/** Build an ordered list of AEST date keys from `startDateKey` to `endDateKey` inclusive. */
export function expandDateKeyRange(startDateKey: string, endDateKey: string): string[] {
  const result: string[] = [];
  let cursor = startDateKey;
  while (cursor <= endDateKey) {
    result.push(cursor);
    const { dayEndUTC } = aestDayBounds(cursor);
    cursor = aestDateKey(dayEndUTC);
  }
  return result;
}

/**
 * Compute and upsert the snapshot for a single AEST date.
 *
 * ⚠️ REFUSES A DAY THAT HAS NOT CLOSED YET — never remove this guard (2026-08-25 incident).
 *
 * A snapshot row is a claim about a WHOLE AEST day. Writing one mid-day freezes a partial
 * total under a key that `DashboardStatsSnapshotReader` will serve as authoritative the
 * moment that day stops being "today" — the reader only bypasses a snapshot for the CURRENT
 * day (`if (snap && !isToday)`), so a partial written at 13:20 AEST becomes the answer at
 * 00:00 AEST and stays wrong until the next cron fire corrects it.
 *
 * That is exactly what shipped: on AEST 2026-08-24 the 03:20 UTC fire (13:21 AEST) stored
 * revenue $25,079.95 / newSignups 216 for a day that actually closed at $30,782.43 / 431 —
 * and because the first two fires had moved from 14:00 UTC (00:00 AEST, i.e. the instant the
 * day closes) to 17:30 UTC, the dashboard served that partial for 3.5 hours every night.
 * `getDashboardStatsSnapshotHealth` had ALWAYS excluded today from its expected keys; the
 * writer was the half that disagreed.
 */
export async function writeSnapshotForDate(
  dateKey: string,
  refundedPaymentIntentIds: Set<string>
): Promise<WriteResult> {
  try {
    const { dayStartUTC, dayEndUTC } = aestDayBounds(dateKey);

    if (dayEndUTC.getTime() > Date.now()) {
      return {
        date: dateKey,
        ok: false,
        error: `refused: AEST day ${dateKey} has not closed yet (ends ${dayEndUTC.toISOString()})`,
      };
    }

    // Revenue
    const revenue = await aggregateRevenueForDay(dayStartUTC, dayEndUTC, refundedPaymentIntentIds);
    const bucketsMap = new Map<string, IRevenueBucket>();
    for (const key of REVENUE_BUCKET_KEYS) {
      bucketsMap.set(key, revenue.buckets[key]);
    }

    // Users
    const [newSignups, cancellationsInDay] = await Promise.all([
      User.countDocuments({
        createdAt: { $gte: dayStartUTC, $lt: dayEndUTC },
        isActive: true,
      }),
      User.countDocuments({
        "subscription.cancelledAt": { $gte: dayStartUTC, $lt: dayEndUTC },
        isActive: true,
      }),
    ]);

    // Ad channels (provider registry — easy to extend). A fetch ERROR (e.g. an
    // expired marketing token) must NOT wipe previously-correct spend: when any
    // channel errors we load the prior snapshot and preserve its stored value
    // rather than overwriting with nothing. This is the guard against the
    // 2026-06-11 incident where a dead token + the 90-day sliding-window cron
    // silently zeroed 90 days of ad spend. See docs/admin/gotchas.md.
    const fetched: Array<{ key: string; result: AdChannelFetchResult }> = [];
    for (const provider of AD_CHANNEL_PROVIDERS) {
      fetched.push({
        key: provider.key,
        result: await provider.fetchForDay({ dayStartUTC, dayEndUTC }),
      });
    }
    let priorAdChannels: Record<string, AdChannelMetrics> | undefined;
    if (fetched.some((f) => f.result.status === "error")) {
      const existing = await DashboardStatsDailySnapshot.findOne({ date: dateKey })
        .select("adChannels")
        .lean();
      priorAdChannels =
        (existing?.adChannels as Record<string, AdChannelMetrics> | undefined) ?? undefined;
    }
    const { channels: adChannelsMap, preserved, lost } = mergeAdChannels(fetched, priorAdChannels);
    for (const key of preserved) {
      console.error(
        `[snapshot-writer] ${dateKey} ${key}: live fetch failed — PRESERVED prior stored value`
      );
    }
    for (const key of lost) {
      console.error(
        `[snapshot-writer] ${dateKey} ${key}: live fetch failed and no prior value to preserve (channel left absent)`
      );
    }

    // Attributed revenue by platform
    const attributedRevenueMap = new Map<AttributedPlatformKey, IAttributedRevenue>();
    for (const p of ATTRIBUTED_PLATFORM_KEYS) {
      attributedRevenueMap.set(p, revenue.byPlatform[p]);
    }

    await DashboardStatsDailySnapshot.findOneAndUpdate(
      { date: dateKey },
      {
        $set: {
          tz: AEST_TIMEZONE,
          revenue: { total: revenue.total, buckets: bucketsMap },
          users: { newSignups, cancellationsInDay },
          adChannels: adChannelsMap,
          attributedRevenue: attributedRevenueMap,
          confidence: "live",
          computedAt: new Date(),
          sourceVersion: DASHBOARD_STATS_SNAPSHOT_SOURCE_VERSION,
        },
      },
      { upsert: true }
    );

    return { date: dateKey, ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[snapshot-writer] ${dateKey} failed:`, err);
    return { date: dateKey, ok: false, error: message };
  }
}

/**
 * The AEST date keys a sliding-window run should write: the last `windowDays` COMPLETE days,
 * ending at the day before `todayAESTDateKey`.
 *
 * Pure and separately exported so the "today is never a member" rule is unit-testable without
 * a database — that rule is the whole point of the 2026-08-25 fix.
 */
export function resolveSlidingWindowKeys(todayAESTDateKey: string, windowDays: number): string[] {
  if (windowDays < 1) return [];
  const endKey = aestPreviousDateKey(todayAESTDateKey);
  // Step back a day at a time rather than subtracting `n * 24h`: AEST days are 23h and 25h at
  // the two DST switches, so fixed-millisecond arithmetic lands mid-day and needs a fudge that
  // then overshoots into an extra day (that fudge is why the old window returned N+1 keys).
  let startKey = endKey;
  for (let i = 1; i < windowDays; i += 1) startKey = aestPreviousDateKey(startKey);
  return expandDateKeyRange(startKey, endKey);
}

/**
 * Write the sliding window: the last `windowDays` COMPLETE AEST days, ending at yesterday.
 * Refund set is loaded once per call.
 *
 * ⚠️ THE IN-PROGRESS DAY IS DELIBERATELY EXCLUDED — see `writeSnapshotForDate`'s guard for the
 * incident. `todayAESTDateKey` still names *today* (the caller passes `now` formatted in AEST);
 * it is the window's exclusive upper bound, not its last member. Widening this back to include
 * today re-introduces a partial-day row that the reader starts trusting at midnight.
 */
export async function writeSlidingWindow(args: { todayAESTDateKey: string; windowDays: number }): Promise<WriteResult[]> {
  const { todayAESTDateKey, windowDays } = args;
  const keys = resolveSlidingWindowKeys(todayAESTDateKey, windowDays);

  const refunded = await loadRefundedPaymentIntentIds();
  const results: WriteResult[] = [];
  for (const key of keys) {
    results.push(await writeSnapshotForDate(key, refunded));
  }
  return results;
}
