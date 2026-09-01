import { z } from "zod";
import { withNorm } from "@/lib/internal-norm/withNorm";
import { NormBrandPerformanceSchema } from "@/lib/internal-norm/schemas/brand-performance";
import {
  brandPerformanceService,
  type BrandPerformanceBasis,
  type BrandPerformancePlatformScope,
} from "@/services/analytics/BrandPerformanceService";
import { resolvePreviousPeriodAest } from "@/utils/admin/resolveAestDateWindow";
import type { BrandLane } from "@/utils/metrics/brand-lane";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

const QuerySchema = z.object({
  startDate: z.string().regex(YMD),
  endDate: z.string().regex(YMD),
  lane: z.enum(["toolset", "toolbox"]).default("toolset"),
  basis: z.enum(["landing-page", "built-prize", "platform"]).default("landing-page"),
  platform: z.enum(["meta", "tiktok", "all"]).default("all"),
  compare: z.literal("previous-period").optional(),
});

/**
 * GET /v1/analytics/brand-performance — Norm mirror of the admin Brand Performance card.
 *
 * Wraps the SAME `BrandPerformanceService` the admin route uses (the internal-norm rule: mirror
 * the service, never re-implement the aggregation), so the two surfaces cannot drift.
 *
 * PII boundary: brand rows carry no identity at all. The only identity-adjacent field is the
 * per-category `userCount`, a DISTINCT count with no ids attached, so the projection is the full
 * service payload minus the drill-down URL lists — those are Meta/TikTok ad destinations, of no
 * use to Norm and needless surface area.
 */
export const GET = withNorm(
  {
    tier: "read",
    registryKey: "analytics.brand-performance",
    requiredPermission: "facebookAds.view",
    responseSchema: NormBrandPerformanceSchema,
  },
  async (ctx) => {
    const parsed = QuerySchema.safeParse(Object.fromEntries(ctx.url.searchParams.entries()));
    if (!parsed.success) {
      return ctx.error(400, "bad_query", "Invalid query params", parsed.error.issues);
    }
    const { startDate, endDate, lane, basis, platform, compare } = parsed.data;

    if (startDate > endDate) {
      return ctx.error(400, "bad_query", "startDate must not be after endDate");
    }

    // Resolved server-side, exactly as the admin route does, so both surfaces benchmark against
    // the same window: the SAME span one calendar month earlier, current side truncated at today.
    const compareTo = compare
      ? resolvePreviousPeriodAest({ startDate, endDate })?.previous
      : undefined;

    const result = await brandPerformanceService.getBrandPerformance({
      startDate,
      endDate,
      lane: lane as BrandLane,
      basis: basis as BrandPerformanceBasis,
      platform: platform as BrandPerformancePlatformScope,
      compareTo,
    });

    // `canonicalUrlsByPlatform` and per-row `comparison` are dropped: the first is ad-platform
    // plumbing for the admin drill-down, the second would double the payload for a consumer
    // that can simply request the other window. `meta.comparison` still states the window used.
    const project = (r: (typeof result.rows)[number]) => ({
      laneId: r.laneId,
      displayName: r.displayName,
      logoPath: r.logoPath,
      spend: r.spend,
      revenue: r.revenue,
      roas: r.roas,
      purchases: r.purchases,
      newMemberships: r.newMemberships,
      newMembershipRevenue: r.newMembershipRevenue,
      newMembershipCountPct: r.newMembershipCountPct,
      newMembershipRevenuePct: r.newMembershipRevenuePct,
      byCategory: r.byCategory,
      platforms: r.platforms,
      // Spread, not a nullable field: the shape is absent when there is nothing to report, so
      // Norm reads "no finding" as "the key isn't there" rather than as a zero it might quote
      // back as an all-clear on ads that were never verifiable.
      ...(r.adUrlIssues ? { adUrlIssues: r.adUrlIssues } : {}),
    });

    return ctx.ok({
      meta: result.meta,
      rows: result.rows.map(project),
      unattributed: result.unattributed ? project(result.unattributed) : null,
      totals: {
        laneId: result.totals.laneId,
        displayName: result.totals.displayName,
        logoPath: result.totals.logoPath,
        spend: result.totals.spend,
        revenue: result.totals.revenue,
        roas: result.totals.roas,
        purchases: result.totals.purchases,
        newMemberships: result.totals.newMemberships,
        newMembershipRevenue: result.totals.newMembershipRevenue,
        newMembershipCountPct: result.totals.newMembershipCountPct,
        newMembershipRevenuePct: result.totals.newMembershipRevenuePct,
        byCategory: result.totals.byCategory,
      },
    });
  },
);
