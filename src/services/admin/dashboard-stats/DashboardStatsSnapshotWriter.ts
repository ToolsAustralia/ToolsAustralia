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
  type AdChannelProvider,
} from "./adChannelProviders";

const AEST_TIMEZONE = "Australia/Sydney";

/** Where a day's `adChannels` came from on this write. */
export type AdChannelSource = "fetched" | "reused";

export interface WriteResult {
  date: string; // YYYY-MM-DD AEST
  ok: boolean;
  error?: string;
  /** Present on a successful write: whether ad channels were fetched live or reused from storage. */
  adChannelSource?: AdChannelSource;
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
 * The AEST date key that starts a window of the last `windowDays` COMPLETE days ending at the
 * day before `todayAESTDateKey`. Steps back one AEST day at a time (never `n * 24h`) so the 23h
 * and 25h DST days can't shift the boundary.
 */
export function completeDayWindowStartKey(todayAESTDateKey: string, windowDays: number): string {
  const days = Math.max(1, Math.floor(windowDays));
  let startKey = aestPreviousDateKey(todayAESTDateKey);
  for (let i = 1; i < days; i += 1) startKey = aestPreviousDateKey(startKey);
  return startKey;
}

/**
 * How many trailing days of ad-channel data are still allowed to CHANGE, and therefore still
 * worth a live provider fetch on every cron run.
 *
 * Why 10. Meta restates a day's conversions and revenue for as long as its attribution window
 * stays open: this account's ad sets report on `use_unified_attribution_setting`, and the
 * longest window any of them uses is **7-day click** (plus 1-day view) — see the comment in
 * `src/lib/facebook-marketing.ts`. Spend itself settles within ~48h; it is the attributed
 * revenue (and therefore ROAS) that keeps moving for a week. TikTok is the same shape — its
 * ad sets here also run 7-day-click / 1-day-view, and `sync-tiktok-ads` / `sync-meta-ads` each
 * re-pull an **8-day** window (`since = until - 7`) for exactly that reason.
 *
 * 10 days = the 7-day click window + 3 days of margin, and it strictly contains the 8-day
 * window the two ad syncs themselves refresh — so a day can never settle in
 * `TikTokAdInsightsDaily` *after* this writer has stopped looking at it. Anything older than
 * that is finished: re-fetching it burns Meta's per-app hourly quota to rewrite a number that
 * cannot move.
 *
 * Widen it without a deploy by setting `DASHBOARD_STATS_AD_RESTATEMENT_WINDOW_DAYS` (a larger
 * value is always the safe direction — it just fetches more). Values below 1 or unparseable
 * values fall back to the default, because a window of 0 would stop refreshing even yesterday.
 */
export const AD_CHANNEL_RESTATEMENT_WINDOW_DAYS = 10;

export function resolveAdChannelRestatementWindowDays(
  raw: string | undefined = process.env.DASHBOARD_STATS_AD_RESTATEMENT_WINDOW_DAYS
): number {
  if (raw === undefined || raw.trim() === "") return AD_CHANNEL_RESTATEMENT_WINDOW_DAYS;
  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return AD_CHANNEL_RESTATEMENT_WINDOW_DAYS;
  return parsed;
}

/** The trailing window of complete AEST days whose ad numbers can still be restated. */
export interface AdChannelRestatementWindow {
  todayAESTDateKey: string;
  windowDays: number;
}

/** Is `dateKey` recent enough that its ad-channel numbers can still change? */
export function isWithinAdChannelRestatementWindow(
  dateKey: string,
  window: AdChannelRestatementWindow
): boolean {
  // Date keys are YYYY-MM-DD, so lexicographic order is chronological order.
  return dateKey >= completeDayWindowStartKey(window.todayAESTDateKey, window.windowDays);
}

/**
 * Normalise whatever the snapshot's `adChannels` path deserialises to. `.lean()` returns the
 * raw BSON subdocument (a plain object) today, but a Map-typed path is allowed to come back as
 * a `Map`; reading a Map as a plain object would silently look EMPTY, which would send us down
 * the "no stored value → fetch" branch. That is the safe direction (an extra fetch, never a
 * wrong write), but handling both keeps the saving real.
 */
function toAdChannelRecord(value: unknown): Record<string, AdChannelMetrics> | undefined {
  if (!value) return undefined;
  if (value instanceof Map) {
    return Object.fromEntries(value) as Record<string, AdChannelMetrics>;
  }
  if (typeof value === "object") return value as Record<string, AdChannelMetrics>;
  return undefined;
}

/**
 * Does a stored snapshot hold ad-channel data we can stand behind reusing?
 *
 * An EMPTY map is not usable. A day can be stored with no channels for two reasons — the
 * providers legitimately returned "empty" (no spend), or a fetch errored with nothing to
 * preserve (`lost`). Neither is a value; treating them as one would freeze a $0 forever. Such a
 * day is re-fetched every run, which costs a call but can never invent a zero.
 */
function hasUsableAdChannels(record: Record<string, AdChannelMetrics> | undefined): boolean {
  if (!record) return false;
  return Object.values(record).some((m) => m != null && typeof m.spend === "number");
}

async function loadStoredAdChannelsFromDb(
  dateKey: string
): Promise<Record<string, AdChannelMetrics> | undefined> {
  const existing = await DashboardStatsDailySnapshot.findOne({ date: dateKey })
    .select("adChannels")
    .lean();
  return toAdChannelRecord(existing?.adChannels);
}

/** Injection seam so the fetch/reuse decision is testable without Mongo or a live Meta token. */
export interface AdChannelResolutionDeps {
  providers?: AdChannelProvider[];
  loadStoredAdChannels?: (dateKey: string) => Promise<Record<string, AdChannelMetrics> | undefined>;
}

export interface AdChannelResolution {
  channels: Map<string, AdChannelMetrics>;
  source: AdChannelSource;
  preserved: string[];
  lost: string[];
}

/**
 * Decide where one day's `adChannels` comes from, and produce it.
 *
 * THE WHOLE POINT: the cron rewrites a 90-day sliding window three times a day, and used to
 * call every provider for every one of those 270 day-writes. Meta's Marketing API limit is
 * per-app and hourly-windowed, so a burst of 90 sequential calls is the exact shape that trips
 * `Application request limit reached` (observed 9–13×/day in production).
 *
 * Three branches, in order:
 *  1. Inside the restatement window → FETCH. The numbers can still move (see
 *     `AD_CHANNEL_RESTATEMENT_WINDOW_DAYS`), so a stale stored value would be wrong.
 *  2. Outside it AND a usable stored value exists → REUSE it verbatim, no provider call. The
 *     day closed weeks ago and cannot change; the stored value IS the answer.
 *  3. Outside it with NO usable stored value → FETCH ANYWAY. This branch is load-bearing.
 *     Skipping the fetch here would write an EMPTY `adChannels` for a day we have nothing to
 *     preserve for — a fresh zero, which is precisely the 2026-06-11 failure shape (a dead
 *     token + this same 90-day cron zeroed ~$283k of correct spend; see docs/admin/gotchas.md).
 *     Cases that land here: a first run, a gap in history, and a day whose earlier fetch failed
 *     with nothing to preserve. They cost a call each — correctness over quota, always.
 *
 * Passing no `restatement` (the backfill script) means "every day is fetchable": a backfill is
 * a deliberate repair and must always talk to the providers.
 */
export async function resolveAdChannelsForDate(args: {
  dateKey: string;
  dayStartUTC: Date;
  dayEndUTC: Date;
  restatement?: AdChannelRestatementWindow;
  deps?: AdChannelResolutionDeps;
}): Promise<AdChannelResolution> {
  const { dateKey, dayStartUTC, dayEndUTC, restatement } = args;
  const providers = args.deps?.providers ?? AD_CHANNEL_PROVIDERS;
  const loadStored = args.deps?.loadStoredAdChannels ?? loadStoredAdChannelsFromDb;

  // Branch 2 — settled day with something stored. One indexed Mongo read replaces N provider
  // calls. Branch 3 (nothing usable stored) deliberately falls through to the fetch below.
  if (restatement && !isWithinAdChannelRestatementWindow(dateKey, restatement)) {
    const stored = await loadStored(dateKey);
    if (hasUsableAdChannels(stored)) {
      return {
        channels: new Map(Object.entries(stored as Record<string, AdChannelMetrics>)),
        source: "reused",
        preserved: [],
        lost: [],
      };
    }
  }

  // Branches 1 and 3 — fetch. The error path below is the 2026-06-11 guard: on any provider
  // error we load the prior snapshot so `mergeAdChannels` can preserve its stored value rather
  // than overwrite it with nothing.
  const fetched: Array<{ key: string; result: AdChannelFetchResult }> = [];
  for (const provider of providers) {
    fetched.push({
      key: provider.key,
      result: await provider.fetchForDay({ dayStartUTC, dayEndUTC }),
    });
  }
  let priorAdChannels: Record<string, AdChannelMetrics> | undefined;
  if (fetched.some((f) => f.result.status === "error")) {
    priorAdChannels = await loadStored(dateKey);
  }
  const { channels, preserved, lost } = mergeAdChannels(fetched, priorAdChannels);
  return { channels, source: "fetched", preserved, lost };
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
  refundedPaymentIntentIds: Set<string>,
  options?: {
    /**
     * Trailing days still eligible for a live ad-channel fetch. OMIT to fetch every day —
     * that is what the backfill script wants (a deliberate repair). The cron passes it.
     */
    adChannelRestatement?: AdChannelRestatementWindow;
    adChannelDeps?: AdChannelResolutionDeps;
  }
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

    // Ad channels (provider registry — easy to extend). Settled days reuse their stored value
    // instead of re-fetching (see `resolveAdChannelsForDate` for the three branches and why
    // branch 3 still fetches). A fetch ERROR (e.g. an expired marketing token) must NOT wipe
    // previously-correct spend: when any channel errors we load the prior snapshot and preserve
    // its stored value rather than overwriting with nothing. This is the guard against the
    // 2026-06-11 incident where a dead token + the 90-day sliding-window cron silently zeroed
    // 90 days of ad spend. See docs/admin/gotchas.md.
    const {
      channels: adChannelsMap,
      source: adChannelSource,
      preserved,
      lost,
    } = await resolveAdChannelsForDate({
      dateKey,
      dayStartUTC,
      dayEndUTC,
      restatement: options?.adChannelRestatement,
      deps: options?.adChannelDeps,
    });
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

    return { date: dateKey, ok: true, adChannelSource };
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
  // `completeDayWindowStartKey` steps back a day at a time rather than subtracting `n * 24h`:
  // AEST days are 23h and 25h at the two DST switches, so fixed-millisecond arithmetic lands
  // mid-day and needs a fudge that then overshoots into an extra day (that fudge is why the old
  // window returned N+1 keys). The ad-channel restatement window shares the same helper.
  return expandDateKeyRange(completeDayWindowStartKey(todayAESTDateKey, windowDays), endKey);
}

/**
 * Write the sliding window: the last `windowDays` COMPLETE AEST days, ending at yesterday.
 * Refund set is loaded once per call.
 *
 * ⚠️ THE IN-PROGRESS DAY IS DELIBERATELY EXCLUDED — see `writeSnapshotForDate`'s guard for the
 * incident. `todayAESTDateKey` still names *today* (the caller passes `now` formatted in AEST);
 * it is the window's exclusive upper bound, not its last member. Widening this back to include
 * today re-introduces a partial-day row that the reader starts trusting at midnight.
 *
 * Only the newest `adChannelRestatementWindowDays` of those days get a live ad-channel fetch;
 * the rest reuse their stored value when they have one. Revenue and user counts are still
 * recomputed for every day in the window — they are local Mongo aggregates with no quota, and
 * a late refund can restate an old day's revenue at any time.
 */
export async function writeSlidingWindow(args: {
  todayAESTDateKey: string;
  windowDays: number;
  /** Defaults to `DASHBOARD_STATS_AD_RESTATEMENT_WINDOW_DAYS` env / 10. */
  adChannelRestatementWindowDays?: number;
}): Promise<WriteResult[]> {
  const { todayAESTDateKey, windowDays } = args;
  const keys = resolveSlidingWindowKeys(todayAESTDateKey, windowDays);
  const adChannelRestatement: AdChannelRestatementWindow = {
    todayAESTDateKey,
    windowDays: args.adChannelRestatementWindowDays ?? resolveAdChannelRestatementWindowDays(),
  };

  const refunded = await loadRefundedPaymentIntentIds();
  const results: WriteResult[] = [];
  for (const key of keys) {
    results.push(await writeSnapshotForDate(key, refunded, { adChannelRestatement }));
  }
  return results;
}
