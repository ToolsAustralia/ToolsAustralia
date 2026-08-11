import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import PartnerDiscountVisit, {
  type PartnerDiscountSurface,
  PARTNER_DISCOUNT_SURFACES,
} from "@/models/PartnerDiscountVisit";
import User from "@/models/User";
import PaymentEvent from "@/models/PaymentEvent";
import { excludeRefundedBenefitsGrantedStages } from "@/utils/payment/payment-event-net-queries";
import { signupTouchWindowMatch } from "@/repositories/PromoAnalyticsRepository";

/**
 * Data access for partner-discount page analytics.
 *
 * Structure mirrors `PromoAnalyticsRepository`: several indexed aggregations joined in JS via
 * Maps, rather than one deep `$lookup` chain. That is a deliberate copy of a pattern this repo
 * has already hardened — every `$match` here is a plain equality or `$in` on an indexed field,
 * which is unambiguously index-using, whereas a correlated `$lookup` sub-pipeline's index
 * behaviour depends on server-version specifics this codebase has not measured.
 *
 * SCALING BOUNDARY, stated rather than hidden: the signup and conversion legs pass a list of
 * ids through `$in`. That list is bounded by distinct discount VISITORS inside the requested
 * window, and the window is itself clamped to the 90-day visit TTL — thousands at current
 * traffic. If discount traffic grows by an order of magnitude, the migration is to a
 * correlated `$lookup` against `signupAttribution.anonymousId` (already indexed for exactly
 * this join), measured before it is trusted.
 *
 * @see docs/partner/analytics.md
 */

export interface PartnerDiscountSurfaceMetrics {
  surface: PartnerDiscountSurface;
  /** Unique visitors. Every count below is also VISITORS, so they share one denominator. */
  visits: number;
  /** Of `visits`, those signed in at the time. */
  signedInVisits: number;
  /** Touched search, a filter, a category or the sort. */
  interacted: number;
  /** Opened at least one offer. */
  offerOpeners: number;
  /** Opened at least one offer ABOVE their access level — the upgrade-intent signal. */
  lockedOfferOpeners: number;
  /**
   * Visitors for whom an access seam was rendered at all.
   *
   * THE DENOMINATOR for `seamReachRate`, never `visits`. `/discount` only bands under the
   * access sort and the member catalogue never bands, so dividing by `visits` would count
   * people who had no seam to reach as people who failed to reach it.
   */
  seamRendered: number;
  /** Of `seamRendered`, those who scrolled the seam into view. */
  seamReached: number;
  /** `seamReached / seamRendered` as a percent. 0 when no seam was ever rendered. */
  seamReachRate: number;
  /** Clicked an unlock CTA (opened the membership modal from a locked offer). */
  unlockClickers: number;
  /** Started a portal hand-off from this surface. */
  portalHandoffs: number;
  /** Ran a search that returned nothing. */
  zeroResultSearchers: number;
  /** Registered, with the attribution touch inside the window. */
  signups: number;
  /** Of those signups, the ones that then bought. Renewals and refunded rows excluded. */
  conversions: number;
  /** AUD dollars from those conversions. */
  revenue: number;
  visitToSignupRate: number;
  signupToConversionRate: number;
  overallConversionRate: number;
}

export interface PartnerDiscountAnalyticsSummary {
  totalVisits: number;
  totalSignups: number;
  totalConversions: number;
  totalRevenue: number;
  bySurface: PartnerDiscountSurfaceMetrics[];
}

/**
 * Visitor identity for dedup: userId if set, else anonymousId, else a per-row placeholder so
 * an unidentifiable visit still counts exactly once.
 *
 * Intentionally identical to `PromoAnalyticsRepository`'s constant of the same name, kept
 * local rather than imported so the partner domain does not depend on the promo domain for
 * its arithmetic. The outer `$ifNull` is load-bearing, not defensive noise: without it a
 * malformed row can still resolve to null, and this codebase's two ways of counting distinct
 * visitors then DISAGREE — `$addToSet` + `$size` silently drops a missing value while
 * `$group: { _id: expr }` collapses every such row into one null bucket. That discrepancy was
 * measured in production on the promo dashboard (1543 vs 1544 for one page).
 */
const VISITOR_ID_EXPR = {
  $ifNull: [
    {
      $cond: [
        { $and: [{ $ne: ["$userId", null] }, { $ne: [{ $type: "$userId" }, "missing"] }] },
        { $toString: "$userId" },
        {
          $cond: [
            { $and: [{ $ne: ["$anonymousId", null] }, { $ne: ["$anonymousId", ""] }] },
            "$anonymousId",
            { $concat: ["_noid:", { $toString: "$_id" }] },
          ],
        },
      ],
    },
    { $concat: ["_noid:", { $toString: "$_id" }] },
  ],
};

/** A nullable boolean engagement column as 0/1, so it can be `$max`'d and `$sum`'d. */
const flag = (field: string) => ({ $cond: [{ $eq: [`$${field}`, true] }, 1, 0] });

/** A nullable numeric engagement column as "did it happen at all", 0/1. */
const didAny = (field: string) => ({ $cond: [{ $gt: [{ $ifNull: [`$${field}`, 0] }, 0] }, 1, 0] });

interface VisitorRollup {
  _id: { surface: PartnerDiscountSurface };
  visits: number;
  signedInVisits: number;
  interacted: number;
  offerOpeners: number;
  lockedOfferOpeners: number;
  seamRendered: number;
  seamReached: number;
  unlockClickers: number;
  portalHandoffs: number;
  zeroResultSearchers: number;
}

const pct = (numerator: number, denominator: number): number =>
  denominator > 0 ? (numerator / denominator) * 100 : 0;

export class PartnerDiscountAnalyticsRepository {
  async createVisit(data: {
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
    await connectDB();
    await PartnerDiscountVisit.create({
      surface: data.surface,
      anonymousId: data.anonymousId,
      userId: data.userId ? new mongoose.Types.ObjectId(data.userId) : undefined,
      signedIn: data.signedIn,
      accessPct: data.accessPct,
      referrer: data.referrer,
      utmSource: data.utmSource,
      utmMedium: data.utmMedium,
      utmCampaign: data.utmCampaign,
      utmBasis: data.utmBasis,
      timestamp: new Date(),
    });
  }

  /**
   * Attach cumulative engagement to a visitor's most recent row for this surface.
   *
   * `upsert: false` and sorted newest-first: this must NEVER create a row. The visit row is
   * created once on mount; creating another here would double-count visits, which is the one
   * number this feature must leave untouched. Returns false when there is nothing to update
   * (dedup race, expired TTL, or a visitor whose mount beacon never landed).
   *
   * `$set` with absolute totals, not `$inc`: the client sends CUMULATIVE page-session counts,
   * so the three flush triggers (visibilitychange, pagehide, unmount) firing more than once
   * converge on the same row state instead of multiplying it. Same rule, same reason, as
   * `PromoAnalyticsRepository.updateVisitBuild`.
   */
  async updateVisitEngagement(args: {
    anonymousId: string;
    surface: PartnerDiscountSurface;
    /** Corrects a row written before the tier resolved. Omitted leaves the row's value alone. */
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
    await connectDB();
    const result = await PartnerDiscountVisit.findOneAndUpdate(
      { anonymousId: args.anonymousId, surface: args.surface },
      {
        $set: {
          // Spread, not a plain assignment: writing `accessPct: undefined` into a `$set`
          // is a no-op in some driver paths and an explicit null in others. Omitting the key
          // entirely is the only form that reliably means "leave what is there".
          ...(args.accessPct !== undefined && { accessPct: args.accessPct }),
          interacted: args.interacted,
          offersOpened: args.offersOpened,
          lockedOffersOpened: args.lockedOffersOpened,
          seamRendered: args.seamRendered,
          seamReached: args.seamReached,
          unlockClicks: args.unlockClicks,
          portalHandoff: args.portalHandoff,
          zeroResultSearch: args.zeroResultSearch,
        },
      },
      { sort: { timestamp: -1 }, new: false, upsert: false }
    )
      .maxTimeMS(5000)
      .lean();
    return result != null;
  }

  /**
   * The panel's whole dataset: engagement, signups, conversions and revenue per surface.
   *
   * Four steps, each an indexed match:
   *   1. roll visits up to one row per (surface, visitor)
   *   2. resolve which of those visitors registered, via signupAttribution.anonymousId
   *   3. resolve which of those accounts then bought
   *   4. assemble, computing every rate over the denominator it actually belongs to
   */
  async getAggregatedBySurface(
    startDate: Date,
    endDate: Date
  ): Promise<PartnerDiscountAnalyticsSummary> {
    await connectDB();

    // ── 1. Visits + engagement, deduped to one row per (surface, visitor) ──
    //
    // `$max` makes every engagement column STICKY per visitor: someone who opened an offer on
    // one visit and bounced on the next is an offer-opener, not half of one. It also absorbs
    // the shape of the write path — the mount beacon leaves the engagement fields absent, so
    // an un-flushed visit contributes 0 rather than dragging a real one back down.
    const rollup = await PartnerDiscountVisit.aggregate<VisitorRollup>([
      { $match: { timestamp: { $gte: startDate, $lte: endDate } } },
      {
        $group: {
          _id: { surface: "$surface", visitor: VISITOR_ID_EXPR },
          signedIn: { $max: flag("signedIn") },
          interacted: { $max: flag("interacted") },
          offerOpeners: { $max: didAny("offersOpened") },
          lockedOfferOpeners: { $max: didAny("lockedOffersOpened") },
          seamRendered: { $max: flag("seamRendered") },
          seamReached: { $max: flag("seamReached") },
          unlockClickers: { $max: didAny("unlockClicks") },
          portalHandoffs: { $max: flag("portalHandoff") },
          zeroResultSearchers: { $max: flag("zeroResultSearch") },
        },
      },
      {
        $group: {
          _id: { surface: "$_id.surface" },
          visits: { $sum: 1 },
          signedInVisits: { $sum: "$signedIn" },
          interacted: { $sum: "$interacted" },
          offerOpeners: { $sum: "$offerOpeners" },
          lockedOfferOpeners: { $sum: "$lockedOfferOpeners" },
          seamRendered: { $sum: "$seamRendered" },
          seamReached: { $sum: "$seamReached" },
          unlockClickers: { $sum: "$unlockClickers" },
          portalHandoffs: { $sum: "$portalHandoffs" },
          zeroResultSearchers: { $sum: "$zeroResultSearchers" },
        },
      },
    ]).exec();

    const rollupMap = new Map<string, VisitorRollup>();
    for (const r of rollup) rollupMap.set(r._id.surface, r);

    // Which anonymousIds visited which surfaces. A visitor can appear on both, and is then a
    // legitimate signup for both — the surfaces are separate funnels, not a partition, so the
    // per-surface columns may sum above the totals. The totals below are deduped separately
    // for exactly that reason and are never derived by adding the rows up.
    const surfacesByAnonId = await PartnerDiscountVisit.aggregate<{
      _id: string;
      surfaces: PartnerDiscountSurface[];
    }>([
      {
        $match: {
          timestamp: { $gte: startDate, $lte: endDate },
          anonymousId: { $exists: true, $nin: [null, ""] },
        },
      },
      { $group: { _id: "$anonymousId", surfaces: { $addToSet: "$surface" } } },
    ]).exec();

    const anonIds = surfacesByAnonId.map((r) => r._id);
    const surfacesFor = new Map<string, PartnerDiscountSurface[]>();
    for (const r of surfacesByAnonId) surfacesFor.set(r._id, r.surfaces);

    // ── 2. Signups: accounts whose signup attribution carries one of those anonymousIds ──
    //
    // Dated by the ATTRIBUTION TOUCH, not `createdAt` — registration writes signupAttribution
    // onto pre-existing plain accounts without touching `createdAt`, so `createdAt` is the age
    // of the ACCOUNT, not the date of the signup event this panel counts. `signupTouchWindowMatch`
    // is the promo repository's indexable expression of that rule; reusing it keeps the two
    // dashboards on one definition of "a signup happened on day X".
    const signupRows = anonIds.length
      ? await User.aggregate<{ _id: mongoose.Types.ObjectId; anonymousId: string }>([
          {
            $match: {
              $and: [
                { "signupAttribution.anonymousId": { $in: anonIds } },
                signupTouchWindowMatch(startDate, endDate),
              ],
            },
          },
          { $project: { _id: 1, anonymousId: "$signupAttribution.anonymousId" } },
        ]).exec()
      : [];

    const signupsBySurface = new Map<string, number>();
    const surfacesByUserId = new Map<string, PartnerDiscountSurface[]>();
    for (const row of signupRows) {
      const surfaces = surfacesFor.get(row.anonymousId) ?? [];
      surfacesByUserId.set(String(row._id), surfaces);
      for (const surface of surfaces) {
        signupsBySurface.set(surface, (signupsBySurface.get(surface) ?? 0) + 1);
      }
    }

    // ── 3. Conversions + revenue from those accounts ──
    const signupUserIds = signupRows.map((r) => r._id);
    const conversionRows = signupUserIds.length
      ? await PaymentEvent.aggregate<{
          _id: mongoose.Types.ObjectId;
          conversions: number;
          revenue: number;
        }>([
          {
            $match: {
              eventType: "BenefitsGranted",
              userId: { $in: signupUserIds },
              timestamp: { $gte: startDate, $lte: endDate },
              // A renewal is not a conversion — the acquisition already happened.
              $nor: [{ packageType: "membership", "data.billingReason": "subscription_cycle" }],
            },
          },
          ...excludeRefundedBenefitsGrantedStages(),
          {
            $group: {
              _id: "$userId",
              conversions: { $sum: 1 },
              revenue: { $sum: { $ifNull: ["$data.price", 0] } },
            },
          },
        ]).exec()
      : [];

    const conversionsBySurface = new Map<string, { conversions: number; revenue: number }>();
    for (const row of conversionRows) {
      for (const surface of surfacesByUserId.get(String(row._id)) ?? []) {
        const existing = conversionsBySurface.get(surface);
        conversionsBySurface.set(surface, {
          conversions: (existing?.conversions ?? 0) + row.conversions,
          revenue: (existing?.revenue ?? 0) + (row.revenue ?? 0),
        });
      }
    }

    // ── 4. Assemble ──
    const bySurface: PartnerDiscountSurfaceMetrics[] = PARTNER_DISCOUNT_SURFACES.map((surface) => {
      const r = rollupMap.get(surface);
      const visits = r?.visits ?? 0;
      const signups = signupsBySurface.get(surface) ?? 0;
      const conv = conversionsBySurface.get(surface);
      const conversions = conv?.conversions ?? 0;
      const revenue = conv?.revenue ?? 0;
      const seamRendered = r?.seamRendered ?? 0;

      return {
        surface,
        visits,
        signedInVisits: r?.signedInVisits ?? 0,
        interacted: r?.interacted ?? 0,
        offerOpeners: r?.offerOpeners ?? 0,
        lockedOfferOpeners: r?.lockedOfferOpeners ?? 0,
        seamRendered,
        seamReached: r?.seamReached ?? 0,
        seamReachRate: pct(r?.seamReached ?? 0, seamRendered),
        unlockClickers: r?.unlockClickers ?? 0,
        portalHandoffs: r?.portalHandoffs ?? 0,
        zeroResultSearchers: r?.zeroResultSearchers ?? 0,
        signups,
        conversions,
        revenue,
        visitToSignupRate: pct(signups, visits),
        signupToConversionRate: pct(conversions, signups),
        overallConversionRate: pct(conversions, visits),
      };
    });

    // Totals are deduped ACROSS surfaces, not summed from the rows above: one person who used
    // both the public page and the member catalogue is one visitor and, if they registered,
    // one signup. Summing the per-surface rows would double-count them, which is exactly the
    // mixed-units mistake that once shipped an impossible column on the promo dashboard.
    const totalVisitorRows = await PartnerDiscountVisit.aggregate<{ _id: null; visits: number }>([
      { $match: { timestamp: { $gte: startDate, $lte: endDate } } },
      { $group: { _id: VISITOR_ID_EXPR } },
      { $group: { _id: null, visits: { $sum: 1 } } },
    ]).exec();

    const totalSignups = signupRows.filter((r) => (surfacesFor.get(r.anonymousId) ?? []).length > 0)
      .length;
    const totalConversions = conversionRows.reduce((sum, r) => sum + r.conversions, 0);
    const totalRevenue = conversionRows.reduce((sum, r) => sum + (r.revenue ?? 0), 0);

    return {
      totalVisits: totalVisitorRows[0]?.visits ?? 0,
      totalSignups,
      totalConversions,
      totalRevenue,
      bySurface,
    };
  }
}

const partnerDiscountAnalyticsRepository = new PartnerDiscountAnalyticsRepository();
export default partnerDiscountAnalyticsRepository;
