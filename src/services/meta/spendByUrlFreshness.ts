import { after } from "next/server";
import { formatInTimeZone } from "date-fns-tz";
import LandingPageMetricsDaily from "@/models/LandingPageMetricsDaily";
import AdDestination from "@/models/AdDestination";
import { MetaInsightsSyncService } from "@/services/meta/MetaInsightsSyncService";
import { MetaAdDestinationService } from "@/services/meta/MetaAdDestinationService";
import { SpendByUrlAggregationService } from "@/services/analytics/SpendByUrlAggregationService";

/**
 * On-read freshness for the Meta spend-by-url pipeline.
 *
 * The admin surfaces that read spend-by-url data (Overview KPI drill-down,
 * Prize Performance, Facebook Ads → Spend by URL, and their Norm mirrors)
 * historically showed data only as fresh as the LAST sync cron run (Sydney
 * 3-hourly slots) — up to ~3h stale intraday, while the live "Ads" view and
 * the Ad Spend KPI query Meta per request. This module closes that gap
 * WITHOUT forking data sources: when a read touches the trailing 1–2 AEST
 * days and the materialized data is older than FRESHNESS_MAX_AGE_MS, it runs
 * a minimal refresh for just that window, then the read proceeds from Mongo
 * as usual. One source of truth; every surface (admin + Norm) stays
 * consistent; the cron demotes to a history / Meta-restatement backstop.
 *
 * The refresh is deliberately CHEAPER than the cron's pipeline
 * (runMetaSpendByUrlSync):
 *  - insights: 1–2 day window = a single Meta page in practice;
 *  - destinations: resolved ONLY for adIds with no MetaAdDestination doc yet
 *    (the cron refetches every ad's creative — 4+ Graph calls — to catch URL
 *    edits; per-read that cost buys nothing, new ads are the only gap);
 *  - aggregate rebuild: the same idempotent per-day recompute, 1–2 dates.
 *
 * Tail protection (the reason the pipeline was cron-based originally): the
 * insights fetch retries Meta rate-limits with exponential backoff capped at
 * 120s per wait — unguarded, a read could hang for minutes. Every ensure call
 * therefore carries a hard TIME BUDGET (default 12s): on expiry the caller
 * serves the stored (stale-but-consistent) data immediately while the refresh
 * finishes in the background of the same invocation, so the NEXT read sees
 * fresh rows. Failures log via console.error and never fail the read.
 */

const AEST_TIMEZONE = "Australia/Sydney";

/** Serve materialized data as-is when it is at most this old. */
export const FRESHNESS_MAX_AGE_MS = 5 * 60 * 1000;

/**
 * A read waits at most this long for the refresh before serving stored data.
 * Live-measured (2026-07-17, prod): a minimal 1-day refresh takes ~8.7s, almost
 * entirely Meta's own ad-level insights latency — 12s covers it with margin
 * while staying far under the routes' maxDuration=60.
 */
export const FRESHNESS_TIME_BUDGET_MS = 12 * 1000;

/**
 * On-read refresh covers at most the trailing N calendar days of the requested
 * range. Older days move only via Meta restatements, which the cron's 8-day
 * trailing re-sync already converges — re-pulling them per read would burn
 * rate limits for pennies.
 */
export const ON_READ_REFRESH_TRAILING_DAYS = 2;

/** yyyy-MM-dd + n days (UTC math on the date string — no TZ drift). */
export function addDaysToDateString(date: string, days: number): string {
  const [y, m, d] = date.split("-").map((p) => parseInt(p, 10));
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/**
 * Pure decision: which sub-window (if any) of a requested range qualifies for
 * an on-read refresh. Null = historical range (ends before yesterday AEST) or
 * an empty/invalid range — the cron owns those.
 */
export function resolveOnReadRefreshWindow(input: {
  since: string;
  until: string;
  todayAest: string;
}): { since: string; until: string } | null {
  const { since, todayAest } = input;
  if (!since || !input.until || since > input.until) return null;

  // Clamp a future end to today — Meta has no data for tomorrow.
  const until = input.until > todayAest ? todayAest : input.until;
  if (since > until) return null;

  const yesterday = addDaysToDateString(todayAest, -1);
  if (until < yesterday) return null; // purely historical — cron territory

  const trailingStart = addDaysToDateString(until, -(ON_READ_REFRESH_TRAILING_DAYS - 1));
  return { since: since > trailingStart ? since : trailingStart, until };
}

/** Pure throttle check. Null lastComputedAtMs = never materialized → stale. */
export function isFreshEnough(lastComputedAtMs: number | null, nowMs: number): boolean {
  if (lastComputedAtMs === null) return false;
  return nowMs - lastComputedAtMs < FRESHNESS_MAX_AGE_MS;
}

// Per-instance backstops (best-effort on serverless — the Mongo computedAt
// probe is the durable throttle; these only dedupe within one warm instance).
const inFlight = new Map<string, Promise<void>>();
const lastAttemptMs = new Map<string, number>();

/** Race a refresh against the budget. Resolves true = finished in-band. */
function withTimeBudget(run: Promise<void>, budgetMs: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), budgetMs);
    run.finally(() => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

/**
 * When the budget expires mid-refresh, guarantee the refresh still completes
 * after the response via Next 15's `after()` — without it, Vercel may freeze
 * the invocation post-response, the recompute never lands, computedAt never
 * advances, and every subsequent stale read re-fires Meta calls (quota burn).
 * Outside a request scope (ops scripts/tests) `after()` throws — best-effort
 * no-op there, since those callers await the promise directly anyway.
 */
function completeAfterResponse(run: Promise<void>): void {
  try {
    after(() => run);
  } catch {
    /* not in a request scope — caller keeps the invocation alive itself */
  }
}

/** The minimal refresh: insights window → missing destinations only → rebuild. */
async function refreshWindow(
  adAccountId: string,
  accessToken: string,
  window: { since: string; until: string },
): Promise<void> {
  const insightsService = new MetaInsightsSyncService();
  const destService = new MetaAdDestinationService();
  const aggService = new SpendByUrlAggregationService();

  const synced = await insightsService.syncDateRange(adAccountId, accessToken, window, {
    // Spend/revenue freshness doesn't need the 291-adset health-metadata
    // refetch (several seconds); the cron keeps those fields current.
    skipAdsetMetadata: true,
  });

  if (synced.adIds.length > 0) {
    // Platform-scoped: an unscoped read would treat another platform's ad as "already
    // resolved" and skip fetching this platform's real destination (2026-07-29).
    const known = (await AdDestination.find({ platform: "meta", adId: { $in: synced.adIds } })
      .select({ adId: 1 })
      .lean()) as unknown as Array<{ adId: string }>;
    const knownSet = new Set(known.map((d) => d.adId));
    const missing = synced.adIds.filter((id) => !knownSet.has(id));
    if (missing.length > 0) {
      await destService.syncDestinationsForAdIds(adAccountId, accessToken, missing);
    }
  }

  await aggService.recomputeForDateRange(adAccountId, window.since, window.until);
}

/**
 * Ensure the trailing days of [since, until] are fresh before a read.
 * No-ops when: creds absent, range is historical, data is <5min old, or a
 * refresh for the same window is already running in this instance. Waits at
 * most `timeBudgetMs` — on expiry the caller serves stored data while the
 * refresh continues in the background. Never throws.
 */
export async function ensureSpendByUrlFreshness(
  adAccountId: string,
  since: string,
  until: string,
  options?: { timeBudgetMs?: number },
): Promise<void> {
  try {
    const accessToken = process.env.FACEBOOK_MARKETING_ACCESS_TOKEN?.trim();
    if (!adAccountId || !accessToken) return;

    const budgetMs = options?.timeBudgetMs ?? FRESHNESS_TIME_BUDGET_MS;
    const todayAest = formatInTimeZone(new Date(), AEST_TIMEZONE, "yyyy-MM-dd");
    const window = resolveOnReadRefreshWindow({ since, until, todayAest });
    if (!window) return;

    const key = `${adAccountId}:${window.since}:${window.until}`;
    const now = Date.now();

    const existing = inFlight.get(key);
    if (existing) {
      const finished = await withTimeBudget(existing, budgetMs);
      if (!finished) completeAfterResponse(existing);
      return;
    }
    // Backstop for zero-row days (no aggregate rows → no computedAt to probe):
    // don't re-attempt the same window more than once per freshness period.
    const attempted = lastAttemptMs.get(key);
    if (attempted !== undefined && now - attempted < FRESHNESS_MAX_AGE_MS) return;

    const newest = (await LandingPageMetricsDaily.findOne({
      adAccountId,
      date: { $gte: window.since, $lte: window.until },
    })
      .sort({ computedAt: -1 })
      .select({ computedAt: 1 })
      .lean()) as unknown as { computedAt?: Date } | null;

    const lastComputed = newest?.computedAt ? new Date(newest.computedAt).getTime() : null;
    if (isFreshEnough(lastComputed, now)) return;

    lastAttemptMs.set(key, now);
    const run = refreshWindow(adAccountId, accessToken, window)
      .catch((e) => {
        // Serve stale-but-consistent data instead of failing the read.
        console.error("[spendByUrlFreshness] on-read refresh failed:", e);
      })
      .finally(() => {
        inFlight.delete(key);
      });
    inFlight.set(key, run);
    const finished = await withTimeBudget(run, budgetMs);
    if (!finished) completeAfterResponse(run);
  } catch (e) {
    console.error("[spendByUrlFreshness] ensure failed:", e);
  }
}
