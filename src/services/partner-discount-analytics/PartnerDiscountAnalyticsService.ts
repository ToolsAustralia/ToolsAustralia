/**
 * Partner-discount page analytics service.
 *
 * Records visits and engagement on the two partner-discount catalogue surfaces, and
 * aggregates them for the admin Page Analytics tab and the Norm mirror.
 *
 * Lives here rather than in `src/utils/partner-discounts/` because that directory is pure
 * helpers with no DB access (URL builders, copy builders), and the layering rule puts
 * non-trivial business logic — here, a three-collection join with a retention clamp — in
 * `src/services/`.
 *
 * @see docs/partner/analytics.md
 * @see src/repositories/PartnerDiscountAnalyticsRepository.ts
 */
import { formatInTimeZone } from "date-fns-tz";
import PartnerDiscountAnalyticsRepository, {
  type PartnerDiscountAnalyticsSummary,
} from "@/repositories/PartnerDiscountAnalyticsRepository";
import {
  PARTNER_DISCOUNT_VISIT_RETENTION_DAYS,
  type PartnerDiscountSurface,
} from "@/models/PartnerDiscountVisit";
import { createAESTDateAsUTC } from "@/utils/common/timezone";

const AEST_TIMEZONE = "Australia/Sydney";

export type PartnerDiscountAnalyticsRangeKey = "today" | "yesterday" | "custom";

export interface ResolvedPartnerDiscountAnalyticsRange {
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
 * Pure calendar arithmetic with no timezone involved, deliberately. Doing this as
 * `subDays(<a UTC instant>, 1)` subtracts a fixed 24h, but two adjacent AEST midnights are
 * 23h or 25h apart across a Sydney DST transition, so the window would silently straddle the
 * boundary twice a year. Shifting the calendar date and only then converting to UTC is
 * correct on every day of the year.
 */
function shiftYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(
    dt.getUTCDate()
  ).padStart(2, "0")}`;
}

/** The UTC window covering whole AEST calendar days, inclusive of both ends. */
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
 * NOT optional. Visits are TTL-deleted after PARTNER_DISCOUNT_VISIT_RETENTION_DAYS; `User`
 * and `PaymentEvent` are not. A range starting before the floor therefore divides COMPLETE
 * signups and revenue by TRUNCATED visits, and the panel renders conversion rates in the
 * hundreds of percent — the promo dashboard shipped a literal 250% column exactly this way.
 *
 * The WHOLE range is clamped, not just the visits query: one window for every number is what
 * keeps every ratio computed over one population. The clamp is surfaced to the UI rather than
 * applied silently, so a range that returns less than asked for can say why.
 */
function withRetentionFloor(
  start: Date,
  end: Date,
  todayYmd: string
): ResolvedPartnerDiscountAnalyticsRange {
  // The oldest AEST day still fully retained. `- (N - 1)` because today counts as day 1.
  const floorYmd = shiftYmd(todayYmd, -(PARTNER_DISCOUNT_VISIT_RETENTION_DAYS - 1));
  const visitsRetainedFrom = aestDayWindow(floorYmd, floorYmd).start;
  const clampedToRetention = start < visitsRetainedFrom;
  if (!clampedToRetention) {
    return { start, end, visitsRetainedFrom, clampedToRetention: false };
  }
  // A window lying ENTIRELY before the floor would leave start after end — an inverted range,
  // which Mongo answers with zero rows and no complaint. Collapse it to an explicitly empty
  // window at the floor instead, so downstream code never sees start > end and the caller can
  // tell "no retained data" from "genuinely zero".
  const clampedStart = end < visitsRetainedFrom ? end : visitsRetainedFrom;
  return { start: clampedStart, end, visitsRetainedFrom, clampedToRetention: true };
}

/**
 * Resolve a partner-discount analytics date range. Defaults to AEST "today".
 * `custom` requires both `startDate` and `endDate` as `YYYY-MM-DD` (AEST-anchored).
 *
 * The parameter is named `dateRange` to match the query-string key every caller parses. The
 * promo equivalent once named it `range` while every route passed a `dateRange`-keyed object,
 * so the field was always `undefined`, the `?? "today"` default won, and EVERY requested range
 * silently returned today — invisible to `tsc` because the field was optional and the argument
 * was a variable. Keeping the names identical makes a future rename a compile error.
 */
export function resolvePartnerDiscountAnalyticsRange(input: {
  dateRange?: PartnerDiscountAnalyticsRangeKey;
  startDate?: string;
  endDate?: string;
  /** "Now", for tests only. Production always omits it. */
  now?: Date;
}): ResolvedPartnerDiscountAnalyticsRange {
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

export class PartnerDiscountAnalyticsService {
  /** Record a visit to a partner-discount catalogue surface. */
  async recordVisit(data: {
    surface: PartnerDiscountSurface;
    anonymousId?: string;
    userId?: string;
    signedIn: boolean;
    accessPct?: number;
    referrer?: string;
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    utmBasis?: "first_touch" | "landing_url";
  }): Promise<void> {
    await PartnerDiscountAnalyticsRepository.createVisit(data);
  }

  /**
   * Attach cumulative engagement to the visitor's most recent visit row for this surface.
   * Returns false when there is no row to attach to — an expected outcome, not an error.
   */
  async recordEngagement(data: {
    anonymousId: string;
    surface: PartnerDiscountSurface;
    accessPct?: number;
    interacted: boolean;
    offersOpened: number;
    lockedOffersOpened: number;
    seamRendered: boolean;
    seamReached: boolean;
    unlockClicks: number;
    portalHandoff: boolean;
    zeroResultSearch: boolean;
  }): Promise<boolean> {
    return PartnerDiscountAnalyticsRepository.updateVisitEngagement(data);
  }

  /** Aggregated metrics per surface for a date range. */
  async getAggregatedMetrics(
    startDate: Date,
    endDate: Date
  ): Promise<PartnerDiscountAnalyticsSummary> {
    return PartnerDiscountAnalyticsRepository.getAggregatedBySurface(startDate, endDate);
  }
}

const partnerDiscountAnalyticsService = new PartnerDiscountAnalyticsService();
export default partnerDiscountAnalyticsService;
