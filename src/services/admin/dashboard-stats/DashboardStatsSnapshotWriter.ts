import User from "@/models/User";
import DashboardStatsDailySnapshot, {
  DASHBOARD_STATS_SNAPSHOT_SOURCE_VERSION,
  type IRevenueBucket,
} from "@/models/DashboardStatsDailySnapshot";
import { createAESTDateAsUTC } from "@/utils/common/timezone";
import { formatInTimeZone } from "date-fns-tz";
import { aggregateRevenueForDay, loadRefundedPaymentIntentIds } from "./revenueAggregator";
import { REVENUE_BUCKET_KEYS } from "./snapshotSchema";
import { AD_CHANNEL_PROVIDERS } from "./adChannelProviders";

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
 */
export async function writeSnapshotForDate(
  dateKey: string,
  refundedPaymentIntentIds: Set<string>
): Promise<WriteResult> {
  try {
    const { dayStartUTC, dayEndUTC } = aestDayBounds(dateKey);

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

    // Ad channels (provider registry — easy to extend)
    const adChannelsMap = new Map<string, IRevenueBucket | object>();
    for (const provider of AD_CHANNEL_PROVIDERS) {
      const metrics = await provider.fetchForDay({ dayStartUTC, dayEndUTC });
      if (metrics) adChannelsMap.set(provider.key, metrics);
    }

    await DashboardStatsDailySnapshot.findOneAndUpdate(
      { date: dateKey },
      {
        $set: {
          tz: AEST_TIMEZONE,
          revenue: { total: revenue.total, buckets: bucketsMap },
          users: { newSignups, cancellationsInDay },
          adChannels: adChannelsMap,
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
 * Write the sliding window: today + the previous N days.
 * Refund set is loaded once per call.
 */
export async function writeSlidingWindow(args: { todayAESTDateKey: string; windowDays: number }): Promise<WriteResult[]> {
  const { todayAESTDateKey, windowDays } = args;
  const { dayStartUTC: todayStart } = aestDayBounds(todayAESTDateKey);

  // Walk backwards `windowDays` calendar days in AEST
  const startDayUTC = new Date(todayStart.getTime() - (windowDays - 1) * 24 * 60 * 60 * 1000 - 2 * 60 * 60 * 1000);
  const startKey = aestDateKey(startDayUTC);
  const keys = expandDateKeyRange(startKey, todayAESTDateKey);

  const refunded = await loadRefundedPaymentIntentIds();
  const results: WriteResult[] = [];
  for (const key of keys) {
    results.push(await writeSnapshotForDate(key, refunded));
  }
  return results;
}
