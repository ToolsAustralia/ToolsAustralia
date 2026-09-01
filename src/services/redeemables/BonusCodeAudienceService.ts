/**
 * BonusCodeAudienceService.ts
 *
 * Read-only forecast of "how many customers can this trigger reach", per
 * webhook-minted bonus code (`docs/superpowers/specs/2026-09-01-coupon-audience-and-ad-url-check-design.md`
 * §A). NEVER mints, issues, or redeems anything — every query here is a `find`
 * / `countDocuments` / `aggregate`/`distinct` read.
 *
 * WHY A FORECAST, NOT A HOLDER COUNT. All three campaigns (`BACKIN200` /
 * `LOCKIN100` / `EXTRA100`) sit at 0 `RedeemableIssuance` rows and 0
 * `BonusCodeWebhookCall` rows in production as of 2026-09-01 — a "who currently
 * holds this code" view renders empty today and stays near-empty between sends.
 * The addressable-population count is what answers "the numbers that can renew"
 * before minting starts; issued/redeemed counts are surfaced alongside so the
 * same card becomes the real number once it does.
 *
 * WHY RECENCY-BUCKETED, NOT JUST ALL-TIME (2026-09-01 correction). The Klaviyo
 * flow behind each trigger fires 2.5–17 days after the customer qualifies
 * (`docs/rewards-redeemables/patterns.md` P7) — it does not reach back further
 * than that. A customer who qualified eight months ago already either got their
 * flow send or never will; an all-time count includes them and overstates the
 * actionable pool by an order of magnitude (verified against Klaviyo's own
 * `Started Checkout` metric: ~6–10k/month vs. an all-time LOCKIN100 proxy count
 * of 45,407 — see the caveat text and `docs/rewards-redeemables/api.md`). So
 * every row returns THREE counts — `last30`, `last90`, `allTime` — bucketed by
 * each trigger's own qualifying instant (see `resolveXAudience` below for which
 * field and why, per trigger). All-time is kept as a ceiling, never the
 * headline.
 *
 * THE TRIGGER -> CODE MAP IS READ, NEVER RESTATED. `BONUS_CODE_BY_TRIGGER`
 * (`@/config/bonusCodes`) is the only place these three strings are spelled —
 * see that file's own header for why a second copy is dangerous.
 *
 * AUDIENCE PREDICATES live in `@/utils/redeemables/bonusCodeAudienceFilter`
 * (pure, DB-free, testable) — this service only wires them to the actual
 * collections. See that file's header for the reasoning behind each one and the
 * one approximation (`checkout-start`, where no persisted event log exists).
 *
 * NOT WIRED TO KLAVIYO. The Klaviyo comparison above is a documented, manually
 * gathered calibration figure (in doc comments / the report only) — this
 * service never makes a third-party call. Adding one here is scope this task
 * was explicitly told not to take on: rate limits and a new failure mode on a
 * read-only admin page nobody asked to depend on Klaviyo's uptime.
 */
import mongoose from "mongoose";
import MonthlyEntryCampaign from "@/models/MonthlyEntryCampaign";
import RedeemableIssuance from "@/models/RedeemableIssuance";
import CancellationFlowEvent from "@/models/CancellationFlowEvent";
import User from "@/models/User";
import { BONUS_CODE_BY_TRIGGER } from "@/config/bonusCodes";
import type { BonusCodeTrigger } from "@/utils/redeemables/bonus-code-policy";
import {
  buildCancelClickUserFilter,
  buildCheckoutStartAudienceFilter,
  buildOneTimePurchaseAudienceFilter,
  CANCEL_CLICK_FLOW_EVENT_FILTER,
  cutoffDate,
  RECENCY_WINDOW_DAYS,
} from "@/utils/redeemables/bonusCodeAudienceFilter";

/** Bounded sample size — this view must never ship a full user list (CLAUDE.md
 *  performance footgun #3: an unprojected list query has already shipped an
 *  MB-scale incident in this repo). The counts are exact; the sample is a preview. */
const SAMPLE_LIMIT = 25;

/** Explicit include-list — no bare `.find()`. Mirrors the projection shape
 *  `RedemptionAnalyticsService.getCampaignRedemptions` and
 *  `MonthlyCouponQueryService.filterCampaignAudience` already use for this same
 *  admin surface (name + email; this is an internal admin tool, not the Norm
 *  PII boundary, which is stricter by design). */
const USER_SAMPLE_PROJECTION = "_id firstName lastName email";

export interface BonusCodeAudienceSampleUser {
  userId: string;
  userName: string;
  userEmail: string;
  /** This customer's own qualifying instant, ISO string — see the per-trigger
   *  field choice in `resolveXAudience` below. `null` only if genuinely absent
   *  (should not happen given each trigger's filter already requires it). */
  qualifiedAt: string | null;
}

/** Cumulative, not mutually exclusive — `last30` customers are also inside
 *  `last90` and `allTime`. Matches how the card reads: "reachable in the next
 *  send window" through "the ceiling if we never stop sending". */
export interface BonusCodeAudienceBuckets {
  last30: number;
  last90: number;
  allTime: number;
}

export interface BonusCodeAudienceRow {
  trigger: BonusCodeTrigger;
  /** Read from BONUS_CODE_BY_TRIGGER — never a second literal. */
  code: string;
  /** Whether an active `MonthlyEntryCampaign` currently carries this code. */
  campaignFound: boolean;
  campaignId: string | null;
  campaignActive: boolean | null;
  entriesAmount: number | null;
  /** The forecast, bucketed by recency. `allTime` is the ceiling, not the headline. */
  addressable: BonusCodeAudienceBuckets;
  /** Bounded preview of the ALL-TIME population, most-recently-qualified first — never the full list. */
  sample: BonusCodeAudienceSampleUser[];
  /** Current RedeemableIssuance rows for this campaign, any status. */
  issuedCount: number;
  /** Current RedeemableIssuance rows with status "redeemed". */
  redeemedCount: number;
}

interface AudienceResolution {
  buckets: BonusCodeAudienceBuckets;
  sample: BonusCodeAudienceSampleUser[];
}

type LeanUserSampleDoc = {
  _id: mongoose.Types.ObjectId;
  firstName?: string;
  lastName?: string;
  email?: string;
};

function toSampleUser(
  user: LeanUserSampleDoc,
  qualifiedAt: Date | null | undefined
): BonusCodeAudienceSampleUser {
  return {
    userId: user._id.toString(),
    userName: `${user.firstName || ""} ${user.lastName || ""}`.trim() || "Unknown User",
    userEmail: user.email || "Unknown Email",
    qualifiedAt: qualifiedAt ? qualifiedAt.toISOString() : null,
  };
}

/**
 * checkout-start -> LOCKIN100. Qualifying instant: `User.createdAt`
 * (registration) — see `bonusCodeAudienceFilter.ts` for why this is the only
 * timestamp available for this proxy.
 *
 * Single-collection: each bucket is one `countDocuments` with the recency
 * cutoff folded straight into the Mongo filter (server-side, no document
 * materialization), plus one bounded `.find()` for the sample.
 */
async function resolveCheckoutStartAudience(now: Date): Promise<AudienceResolution> {
  const [last30, last90, allTime, sample] = await Promise.all([
    User.countDocuments(
      buildCheckoutStartAudienceFilter({ qualifiedSince: cutoffDate(now, RECENCY_WINDOW_DAYS.last30) })
    ),
    User.countDocuments(
      buildCheckoutStartAudienceFilter({ qualifiedSince: cutoffDate(now, RECENCY_WINDOW_DAYS.last90) })
    ),
    User.countDocuments(buildCheckoutStartAudienceFilter()),
    User.find(buildCheckoutStartAudienceFilter())
      .select(`${USER_SAMPLE_PROJECTION} createdAt`)
      .sort({ createdAt: -1 })
      .limit(SAMPLE_LIMIT)
      .lean<(LeanUserSampleDoc & { createdAt?: Date })[]>(),
  ]);
  return {
    buckets: { last30, last90, allTime },
    sample: sample.map((user) => toSampleUser(user, user.createdAt)),
  };
}

/**
 * one-time-purchase -> EXTRA100. Qualifying instant: the MOST RECENT
 * `oneTimePackages[].purchaseDate` — a real event date, not a proxy (see
 * `bonusCodeAudienceFilter.ts`).
 */
async function resolveOneTimePurchaseAudience(now: Date): Promise<AudienceResolution> {
  const [last30, last90, allTime, sample] = await Promise.all([
    User.countDocuments(
      buildOneTimePurchaseAudienceFilter({ qualifiedSince: cutoffDate(now, RECENCY_WINDOW_DAYS.last30) })
    ),
    User.countDocuments(
      buildOneTimePurchaseAudienceFilter({ qualifiedSince: cutoffDate(now, RECENCY_WINDOW_DAYS.last90) })
    ),
    User.countDocuments(buildOneTimePurchaseAudienceFilter()),
    // Sorting descending on an array field sorts by that field's MAX element
    // per document (documented MongoDB behaviour) — i.e. each user's most
    // recent one-time purchase, which is exactly the qualifying instant.
    User.find(buildOneTimePurchaseAudienceFilter())
      .select(`${USER_SAMPLE_PROJECTION} oneTimePackages.purchaseDate`)
      .sort({ "oneTimePackages.purchaseDate": -1 })
      .limit(SAMPLE_LIMIT)
      .lean<(LeanUserSampleDoc & { oneTimePackages?: Array<{ purchaseDate?: Date }> })[]>(),
  ]);
  return {
    buckets: { last30, last90, allTime },
    sample: sample.map((user) => {
      const dates = (user.oneTimePackages ?? [])
        .map((pkg) => pkg.purchaseDate)
        .filter((d): d is Date => Boolean(d));
      const mostRecent = dates.length > 0 ? new Date(Math.max(...dates.map((d) => d.getTime()))) : null;
      return toSampleUser(user, mostRecent);
    }),
  };
}

/**
 * cancel-click -> BACKIN200. Qualifying instant: `CancellationFlowEvent.endedAt`
 * — `verified` as the reliable commit timestamp; see the field's doc comment in
 * `bonusCodeAudienceFilter.ts` for the grep that proved it.
 *
 * Two collections, so this cannot be a single server-side `countDocuments` per
 * bucket the way the other two triggers are. Instead: pull every
 * `(userId, mostRecentEndedAt)` pair ONCE — bounded by how many people have
 * ever committed a self-service cancellation (a few thousand at most, an order
 * of magnitude below the User collection itself, so this is not the unbounded
 * `.find()` CLAUDE.md's performance footgun #3 warns about) — narrow to the
 * User-side "not currently an active subscriber" eligibility with an `_id`-only
 * projection, then bucket in application code from that small, bounded set.
 */
async function resolveCancelClickAudience(now: Date): Promise<AudienceResolution> {
  const cancelledUsers = await CancellationFlowEvent.aggregate<{ _id: mongoose.Types.ObjectId; qualifiedAt: Date }>([
    { $match: CANCEL_CLICK_FLOW_EVENT_FILTER },
    { $group: { _id: "$userId", qualifiedAt: { $max: "$endedAt" } } },
  ]);
  if (cancelledUsers.length === 0) {
    return { buckets: { last30: 0, last90: 0, allTime: 0 }, sample: [] };
  }
  const qualifiedAtByUserId = new Map(cancelledUsers.map((row) => [row._id.toString(), row.qualifiedAt]));
  const candidateIds = cancelledUsers.map((row) => row._id);

  const addressableIds = await User.find(buildCancelClickUserFilter(candidateIds))
    .select("_id")
    .lean<{ _id: mongoose.Types.ObjectId }[]>();

  const cutoff30 = cutoffDate(now, RECENCY_WINDOW_DAYS.last30).getTime();
  const cutoff90 = cutoffDate(now, RECENCY_WINDOW_DAYS.last90).getTime();
  let last30 = 0;
  let last90 = 0;
  const addressable: { userId: mongoose.Types.ObjectId; qualifiedAt: Date }[] = [];
  for (const { _id } of addressableIds) {
    const qualifiedAt = qualifiedAtByUserId.get(_id.toString());
    if (!qualifiedAt) continue; // defensive — every candidate id came from this same map
    addressable.push({ userId: _id, qualifiedAt });
    const t = qualifiedAt.getTime();
    if (t >= cutoff30) last30++;
    if (t >= cutoff90) last90++;
  }

  addressable.sort((a, b) => b.qualifiedAt.getTime() - a.qualifiedAt.getTime());
  const sampleIds = addressable.slice(0, SAMPLE_LIMIT);
  const sampleUsers = sampleIds.length
    ? await User.find({ _id: { $in: sampleIds.map((s) => s.userId) } })
        .select(USER_SAMPLE_PROJECTION)
        .lean<LeanUserSampleDoc[]>()
    : [];
  const sampleUserById = new Map(sampleUsers.map((u) => [u._id.toString(), u]));
  const sample = sampleIds
    .map(({ userId, qualifiedAt }) => {
      const user = sampleUserById.get(userId.toString());
      return user ? toSampleUser(user, qualifiedAt) : null;
    })
    .filter((row): row is BonusCodeAudienceSampleUser => row !== null);

  return {
    buckets: { last30, last90, allTime: addressable.length },
    sample,
  };
}

const AUDIENCE_RESOLVERS: Record<BonusCodeTrigger, (now: Date) => Promise<AudienceResolution>> = {
  "cancel-click": resolveCancelClickAudience,
  "checkout-start": resolveCheckoutStartAudience,
  "one-time-purchase": resolveOneTimePurchaseAudience,
};

interface IssuanceRollup {
  issuedCount: number;
  redeemedCount: number;
}

export class BonusCodeAudienceService {
  /**
   * Per trigger: code, campaign status, recency-bucketed addressable counts +
   * bounded sample, and current issuance/redemption counts. Read-only — never
   * mints, issues, or redeems.
   *
   * `now` is injectable (defaults to the real clock) so bucket boundaries are
   * testable without waiting on the calendar — matches this domain's existing
   * "no ambient clock" convention (`bonus-code-policy.ts`, `CampaignService`).
   */
  static async getAudienceForAllTriggers(now: Date = new Date()): Promise<BonusCodeAudienceRow[]> {
    const triggers = Object.keys(BONUS_CODE_BY_TRIGGER) as BonusCodeTrigger[];
    const codes = triggers.map((trigger) => BONUS_CODE_BY_TRIGGER[trigger]);

    const campaigns = await MonthlyEntryCampaign.find({ code: { $in: codes } })
      .select("_id code isActive entriesAmount")
      .lean<{ _id: mongoose.Types.ObjectId; code: string; isActive: boolean; entriesAmount: number }[]>();
    const campaignByCode = new Map(campaigns.map((c) => [c.code, c]));
    const campaignIds = campaigns.map((c) => c._id);

    const issuanceAgg = campaignIds.length
      ? await RedeemableIssuance.aggregate<{ _id: mongoose.Types.ObjectId } & IssuanceRollup>([
          { $match: { campaignId: { $in: campaignIds } } },
          {
            $group: {
              _id: "$campaignId",
              issuedCount: { $sum: 1 },
              redeemedCount: { $sum: { $cond: [{ $eq: ["$status", "redeemed"] }, 1, 0] } },
            },
          },
        ])
      : [];
    const issuanceByCampaignId = new Map(issuanceAgg.map((row) => [row._id.toString(), row]));

    const audiences = await Promise.all(triggers.map((trigger) => AUDIENCE_RESOLVERS[trigger](now)));

    return triggers.map((trigger, index) => {
      const code = BONUS_CODE_BY_TRIGGER[trigger];
      const campaign = campaignByCode.get(code) ?? null;
      const issuance = campaign ? issuanceByCampaignId.get(String(campaign._id)) : undefined;
      const { buckets, sample } = audiences[index];

      return {
        trigger,
        code,
        campaignFound: Boolean(campaign),
        campaignId: campaign ? String(campaign._id) : null,
        campaignActive: campaign ? campaign.isActive : null,
        entriesAmount: campaign ? campaign.entriesAmount : null,
        addressable: buckets,
        sample,
        issuedCount: issuance?.issuedCount ?? 0,
        redeemedCount: issuance?.redeemedCount ?? 0,
      };
    });
  }
}
