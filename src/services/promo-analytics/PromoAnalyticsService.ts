/**
 * Promo Analytics Service
 *
 * Records promo page visits, links visits to users (future use), and aggregates metrics.
 *
 * @see docs/PROMO_PAGE_ANALYTICS.md
 */
import { formatInTimeZone } from "date-fns-tz";
import PromoAnalyticsRepository, {
  type PromoAnalyticsSummary,
  type PromoPageMetrics,
  type PromoAnalyticsByChannelSummary,
  type PromoAnalyticsByBuiltPrizeSummary,
} from "@/repositories/PromoAnalyticsRepository";
import { isValidPromoSlug, getPageTypeFromSlug } from "@/utils/promo-analytics/validate-promo-slug";
import type { PromoPageType } from "@/models/PromoAnalyticsVisit";
import type { PageDetailResult, ChannelDetailResult } from "@/types/promo-analytics";
import type { ConvertingPlatform } from "@/types/attribution";
import { PROMO_VISIT_RETENTION_DAYS } from "@/models/PromoAnalyticsVisit";
import { createAESTDateAsUTC } from "@/utils/common/timezone";

const AEST_TIMEZONE = "Australia/Sydney";

export type PromoAnalyticsRangeKey = "today" | "yesterday" | "custom";

export interface ResolvedPromoAnalyticsRange {
  start: Date;
  end: Date;
  /** Earliest instant visit rows still exist for — the TTL floor, as UTC. */
  visitsRetainedFrom: Date;
  /** True when the requested start predated the floor and was moved up to it. */
  clampedToRetention: boolean;
}

const YMD_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** The AEST calendar date (`yyyy-MM-dd`) a UTC instant falls on. */
function toAestYmd(instant: Date): string {
  return formatInTimeZone(instant, AEST_TIMEZONE, "yyyy-MM-dd");
}

/**
 * Shift a `yyyy-MM-dd` CALENDAR date by whole days.
 *
 * Deliberately pure calendar arithmetic with no timezone involved. Doing this as
 * `subDays(<a UTC instant>, 1)` — which is what this file used to do — subtracts a fixed 24h,
 * but two adjacent AEST midnights are 23h or 25h apart across a Sydney DST transition, so the
 * window silently straddled the boundary twice a year. Shifting the calendar date and only then
 * converting to UTC (via `createAESTDateAsUTC` -> `fromZonedTime`) is correct on every day.
 */
function shiftYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(
    dt.getUTCDate()
  ).padStart(2, "0")}`;
}

/**
 * The UTC window covering whole AEST calendar days, inclusive of both ends.
 * Every repository `$match` pairs `$gte: start` with `$lte: end`, so `end` is the last
 * representable instant of `endYmd` in AEST.
 */
function aestDayWindow(startYmd: string, endYmd: string): { start: Date; end: Date } {
  const [sy, sm, sd] = startYmd.split("-").map(Number);
  const [ey, em, ed] = endYmd.split("-").map(Number);
  const start = createAESTDateAsUTC(sy, sm, sd, 0, 0);
  const end = createAESTDateAsUTC(ey, em, ed, 23, 59);
  end.setUTCSeconds(59, 999);
  return { start, end };
}

/**
 * Clamp a window to the earliest day visit rows still exist for.
 *
 * Visits are TTL-deleted after PROMO_VISIT_RETENTION_DAYS; `User` and `PaymentEvent` are not.
 * A range starting before the floor therefore divides COMPLETE signups and revenue by
 * TRUNCATED visits. Left unclamped, "All Time" (site launch 2025-11-27) would render
 * visit→signup rates in the hundreds of percent — the same visibly-impossible arithmetic that
 * once shipped a 250% column on this dashboard — and a page retired before the floor would read
 * `visits 0 / signups 400 / revenue $12,000`.
 *
 * The WHOLE range is clamped, not just the visits query: one window for every number is what
 * keeps every ratio computed over one population. Trade-off accepted and surfaced in the UI —
 * this tab's all-time revenue no longer includes pre-retention purchases. It is a funnel, not a
 * revenue ledger; the Overview tab remains the full-history source for revenue.
 */
function withRetentionFloor(
  start: Date,
  end: Date,
  todayYmd: string
): ResolvedPromoAnalyticsRange {
  // The oldest AEST day still fully retained. `- (N - 1)` because today counts as day 1.
  const floorYmd = shiftYmd(todayYmd, -(PROMO_VISIT_RETENTION_DAYS - 1));
  const visitsRetainedFrom = aestDayWindow(floorYmd, floorYmd).start;
  const clampedToRetention = start < visitsRetainedFrom;
  if (!clampedToRetention) {
    return { start, end, visitsRetainedFrom, clampedToRetention: false };
  }
  // A window lying ENTIRELY before the floor (e.g. "all of April" asked in August) would leave
  // start after end — an inverted range, which Mongo answers with zero rows and no complaint.
  // Collapse it to an explicitly empty window at the floor instead, so downstream code never
  // sees start > end and the caller can tell "no retained data" from "genuinely zero".
  const clampedStart = end < visitsRetainedFrom ? end : visitsRetainedFrom;
  return { start: clampedStart, end, visitsRetainedFrom, clampedToRetention: true };
}

/**
 * Resolve a promo-analytics date range. Defaults to AEST "today" when no params.
 * `custom` requires both `startDate` and `endDate` as `YYYY-MM-DD` (AEST-anchored).
 *
 * The parameter is named `dateRange` to match the query-string key every caller already parses
 * (`querySchema`/`QuerySchema` in the admin + Norm routes) and the client's `DateRange` union.
 * It used to be `range`, while every route passed a `dateRange`-keyed object straight through —
 * so `input.range` was always `undefined`, the `?? "today"` default won, and EVERY requested
 * range silently returned today. `tsc` could not see it: the field was optional and the argument
 * was a variable, so excess-property checking never applied. Keeping the names identical is what
 * makes a recurrence a compile error rather than a silent wrong answer.
 */
export function resolvePromoAnalyticsRange(input: {
  dateRange?: PromoAnalyticsRangeKey;
  startDate?: string;
  endDate?: string;
  /**
   * "Now", for tests only. Production always omits it.
   *
   * Exists because the two things most worth pinning here — DST day spans and the retention
   * clamp — are both anchored to the current date, so without an injectable clock a test either
   * hard-codes transition dates that drift out of the retention window as time passes, or
   * cannot assert the clamp at all.
   */
  now?: Date;
}): ResolvedPromoAnalyticsRange {
  const dateRange = input.dateRange ?? "today";
  const todayYmd = toAestYmd(input.now ?? new Date());

  if (dateRange === "custom") {
    if (!input.startDate || !input.endDate) {
      throw new Error("custom range requires startDate and endDate (YYYY-MM-DD)");
    }
    if (!YMD_PATTERN.test(input.startDate) || !YMD_PATTERN.test(input.endDate)) {
      throw new Error("startDate and endDate must be YYYY-MM-DD");
    }
    if (input.startDate > input.endDate) {
      throw new Error("startDate must not be after endDate");
    }
    const w = aestDayWindow(input.startDate, input.endDate);
    return withRetentionFloor(w.start, w.end, todayYmd);
  }
  if (dateRange === "yesterday") {
    const yesterdayYmd = shiftYmd(todayYmd, -1);
    const w = aestDayWindow(yesterdayYmd, yesterdayYmd);
    return withRetentionFloor(w.start, w.end, todayYmd);
  }
  const w = aestDayWindow(todayYmd, todayYmd);
  return withRetentionFloor(w.start, w.end, todayYmd);
}

export class PromoAnalyticsService {
  /**
   * Record a promotion page visit.
   * Validates slug before creating.
   */
  async recordVisit(data: {
    pageType: PromoPageType;
    slug: string;
    anonymousId?: string;
    referrer?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    /** Where the UTM values came from, so an attribution shift is auditable in the data. */
    utmBasis?: "first_touch" | "landing_url";
  }): Promise<{ success: boolean; error?: string }> {
    if (!isValidPromoSlug(data.slug)) {
      return { success: false, error: "Invalid promotion slug" };
    }
    const pageType = getPageTypeFromSlug(data.slug);
    await PromoAnalyticsRepository.createVisit({
      ...data,
      pageType,
      slug: data.slug.toLowerCase().trim(),
    });
    return { success: true };
  }

  /**
   * Attach a built prize + engagement counters to an existing visit row.
   * Validates BOTH slugs — the landing page and the built prize must be real.
   */
  async recordPrizeBuild(data: {
    anonymousId: string;
    slug: string;
    builtPrizeSlug: string;
    toolboxSwitches: number;
    toolsetSwitches: number;
    /**
     * Did the visitor touch either reel or the cash toggle this page-session?
     *
     * REQUIRED, not optional. It was optional, and the tracking route's `updateVisitBuild`
     * dependency rebuilt this payload field-by-field and silently dropped it — so the
     * repository's "absent means engaged" default wrote `true` on every row that has ever
     * existed, and the engagement signal was gone with nothing to reconstruct it from.
     * Making it required means a caller that forgets it fails to compile.
     */
    interacted: boolean;
  }): Promise<{ success: boolean; error?: string }> {
    if (!isValidPromoSlug(data.slug)) {
      return { success: false, error: "Invalid promotion slug" };
    }
    if (!isValidPromoSlug(data.builtPrizeSlug)) {
      return { success: false, error: "Invalid built prize slug" };
    }
    const updated = await PromoAnalyticsRepository.updateVisitBuild({
      anonymousId: data.anonymousId,
      slug: data.slug.toLowerCase().trim(),
      pageType: getPageTypeFromSlug(data.slug),
      builtPrizeSlug: data.builtPrizeSlug.toLowerCase().trim(),
      toolboxSwitches: data.toolboxSwitches,
      toolsetSwitches: data.toolsetSwitches,
      interacted: data.interacted,
    });
    return updated ? { success: true } : { success: false, error: "no_visit_row" };
  }

  /**
   * Link anonymous visits to a user when they register.
   */
  async linkVisitsToUser(anonymousId: string, userId: string): Promise<number> {
    return PromoAnalyticsRepository.linkVisitToUser(anonymousId, userId);
  }

  /**
   * Get aggregated metrics by promotion page for a date range.
   */
  async getAggregatedMetrics(
    startDate: Date,
    endDate: Date
  ): Promise<PromoAnalyticsSummary> {
    return PromoAnalyticsRepository.getAggregatedByPage(startDate, endDate);
  }

  /**
   * Get aggregated metrics by acquisition CHANNEL.
   *
   * The key is a canonical `ConvertingPlatform`, not a raw utm_source, so the dirty forms real
   * traffic carries (`facebook.com`, `ig`, `fb`, `Klaviyo`, `TIKTOK`) each land in exactly one
   * channel row and match how ad spend is reported.
   */
  async getAggregatedByChannel(
    startDate: Date,
    endDate: Date
  ): Promise<PromoAnalyticsByChannelSummary> {
    return PromoAnalyticsRepository.getAggregatedByChannel(startDate, endDate);
  }

  /**
   * Get aggregated metrics by BUILT PRIZE (e.g. makita-kincrome) across every landing page.
   * Answers "which combinations get built more than landed on?" and "do builders of one
   * combination convert better than builders of another?"
   */
  async getAggregatedByBuiltPrize(
    startDate: Date,
    endDate: Date
  ): Promise<PromoAnalyticsByBuiltPrizeSummary> {
    return PromoAnalyticsRepository.getAggregatedByBuiltPrize(startDate, endDate);
  }

  /**
   * Aggregate by TOOLBOX lane, deduped in Mongo.
   *
   * Never derive this by summing the per-combination `byBuiltPrize` counts: those are deduped
   * per combination, so one visitor who ended on two combinations sharing a toolbox would count
   * twice against globally-unique signups.
   */
  async getAggregatedByToolbox(startDate: Date, endDate: Date) {
    return PromoAnalyticsRepository.getAggregatedByToolbox(startDate, endDate);
  }

  /**
   * Get per-page detail: campaign attribution plus the prize-build breakdown.
   * Answers "which ads/emails drove traffic to this page, and what did visitors build?"
   */
  async getPageDetailMetrics(
    pageType: PromoPageType,
    slug: string,
    startDate: Date,
    endDate: Date
  ): Promise<PageDetailResult> {
    if (!isValidPromoSlug(slug)) {
      throw new Error(`Invalid promotion slug: ${slug}`);
    }
    return PromoAnalyticsRepository.getPageDetailByUTMCampaign(pageType, slug, startDate, endDate);
  }

  /**
   * Get channel detail: which pages received traffic from this channel
   * plus breakdown by campaign within the channel.
   */
  async getChannelDetailMetrics(
    channel: ConvertingPlatform,
    startDate: Date,
    endDate: Date
  ): Promise<ChannelDetailResult> {
    return PromoAnalyticsRepository.getChannelDetail(channel, startDate, endDate);
  }

  /**
   * Get top performing pages by conversion rate, signup rate, or revenue.
   */
  async getTopPerformingPages(
    startDate: Date,
    endDate: Date,
    limit: number = 10,
    sortBy: "conversionRate" | "signupRate" | "revenue" = "conversionRate"
  ): Promise<PromoPageMetrics[]> {
    return PromoAnalyticsRepository.getTopPerformingPages(
      startDate,
      endDate,
      limit,
      sortBy
    );
  }
}

const promoAnalyticsService = new PromoAnalyticsService();
export default promoAnalyticsService;
