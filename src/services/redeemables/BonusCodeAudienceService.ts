/**
 * BonusCodeAudienceService.ts
 *
 * Read-only view of each webhook-minted bonus code's ACTUAL issuance state —
 * who already has it, who can still redeem it, who has redeemed it, and how
 * many grants lapsed unused. NEVER mints, issues, or redeems anything — every
 * query here is a `find` / `countDocuments` / `aggregate` / `distinct` read.
 *
 * THE PRIMARY QUESTION (2026-09-01, reworked — the owner corrected the ask).
 * The first version of this service led with a FORECAST of who a trigger
 * could reach. That answered a question nobody asked. The owner's own words:
 * "what i want is to see those who already minted it not those are just
 * qualified meaning those already have access to it... and number of who
 * redeemed." So `BonusCodeAudienceRow.issuance` — real `RedeemableIssuance`
 * state — is now the PRIMARY payload:
 *
 *   - `issuedCount`            — granted, any status (they have access to it).
 *   - `stillRedeemableCount`   — of those, `status: "active"`, this row's own
 *     window still open, AND the campaign itself still redeemable. The
 *     campaign half is `isCampaignRedeemable(campaign, now)`
 *     (`@/utils/redeemables/bonus-code-policy`) — NEVER hand-rolled. A partial
 *     copy of that exact check is the bug fixed on this branch at `d9350a23`
 *     (188 members shown an enabled Claim button the server would refuse —
 *     see docs/rewards-redeemables/rules.md R12). Repeating that mistake here
 *     would recreate it on the admin side.
 *   - `redeemedCount` / `redeemedEntries` — actually redeemed, and the free
 *     entries granted as a result.
 *   - `expiredOrLapsedCount`   — granted, window closed, never used. The
 *     number that tells the owner the flow is minting faster than customers
 *     are acting.
 *
 * All three campaigns (`BACKIN200` / `LOCKIN100` / `EXTRA100`) sit at ZERO
 * `RedeemableIssuance` rows in production as of 2026-09-01 — verified again
 * after this rework (the coordinator ran a live expiry cleanup and deactivated
 * `ANZACDAY25` in between; neither touches these three, which still have 0
 * issuances). Every primary number therefore renders 0 today. That is
 * correct, not a bug — the UI must render a plain "not minted yet" empty
 * state rather than zero-tiles that look broken.
 *
 * THE FORECAST IS DEMOTED, NOT DELETED. `addressable` (recency-bucketed
 * potential reach — how many customers a trigger COULD reach if minting
 * started) is still computed and returned, for the "potential reach" section
 * the UI now renders collapsed/secondary. See
 * `@/utils/redeemables/bonusCodeAudienceFilter` for the predicates and the
 * `checkout-start` approximation. The `autoRenew`-vs-`isActive` fix found
 * while building the recency buckets stands unchanged — it was a genuine
 * catch, independent of this rework.
 *
 * THE TRIGGER -> CODE MAP IS READ, NEVER RESTATED. `BONUS_CODE_BY_TRIGGER`
 * (`@/config/bonusCodes`) is the only place these three strings are spelled.
 *
 * NOT WIRED TO KLAVIYO. Any Klaviyo comparison figures live in doc comments /
 * the report only — this service makes no third-party call.
 */
import mongoose from "mongoose";
import MonthlyEntryCampaign from "@/models/MonthlyEntryCampaign";
import RedeemableIssuance from "@/models/RedeemableIssuance";
import CancellationFlowEvent from "@/models/CancellationFlowEvent";
import User from "@/models/User";
import { BONUS_CODE_BY_TRIGGER } from "@/config/bonusCodes";
import type { BonusCodeTrigger } from "@/utils/redeemables/bonus-code-policy";
import { isCampaignRedeemable } from "@/utils/redeemables/bonus-code-policy";
import {
  buildCancelClickUserFilter,
  buildCheckoutStartAudienceFilter,
  buildExpiredOrLapsedIssuanceFilter,
  buildOneTimePurchaseAudienceFilter,
  buildRedeemedIssuanceFilter,
  buildStillRedeemableIssuanceFilter,
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

// ─── SECONDARY: the addressable-population forecast (demoted 2026-09-01) ───

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

function toAudienceSampleUser(
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
    sample: sample.map((user) => toAudienceSampleUser(user, user.createdAt)),
  };
}

/**
 * one-time-purchase -> EXTRA100. Qualifying instant: the MOST RECENT
 * `oneTimePackages[].purchaseDate` — a real event date, not a proxy.
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
      return toAudienceSampleUser(user, mostRecent);
    }),
  };
}

/**
 * cancel-click -> BACKIN200. Qualifying instant: `CancellationFlowEvent.endedAt`.
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
      return user ? toAudienceSampleUser(user, qualifiedAt) : null;
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

// ─── PRIMARY: actual issuance state ─────────────────────────────────────────

export interface BonusCodeIssuanceSampleUser {
  userId: string;
  userName: string;
  userEmail: string;
  entriesAmount: number;
  /** ISO string. `redeemedAt` for the redeemed sample; `expiresAt` for the
   *  still-redeemable (soonest-expiring first) and expired/lapsed
   *  (most-recently-lapsed first) samples. */
  at: string | null;
}

export interface BonusCodeIssuanceState {
  /** Granted, any status — "they have access to it". */
  issuedCount: number;
  /** status: "active", this row's own window open, AND the campaign itself
   *  still redeemable (isCampaignRedeemable — never hand-rolled). */
  stillRedeemableCount: number;
  /** Actually redeemed. */
  redeemedCount: number;
  /** Free entries granted as a result of those redemptions. */
  redeemedEntries: number;
  /** Granted, window closed (or the campaign itself no longer redeemable), never used. */
  expiredOrLapsedCount: number;
  stillRedeemableSample: BonusCodeIssuanceSampleUser[];
  redeemedSample: BonusCodeIssuanceSampleUser[];
  expiredOrLapsedSample: BonusCodeIssuanceSampleUser[];
}

const EMPTY_ISSUANCE_STATE: BonusCodeIssuanceState = {
  issuedCount: 0,
  stillRedeemableCount: 0,
  redeemedCount: 0,
  redeemedEntries: 0,
  expiredOrLapsedCount: 0,
  stillRedeemableSample: [],
  redeemedSample: [],
  expiredOrLapsedSample: [],
};

type LeanIssuanceSampleDoc = {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  entriesAmount: number;
  redeemedAt?: Date;
  expiresAt?: Date;
};

/** Resolves one bounded, PII-projected issuance sample: query RedeemableIssuance
 *  with an explicit `.select()`, then join User with the same include-list every
 *  sibling admin service in this domain uses. Never a bare `.find()` on either
 *  collection. */
async function resolveIssuanceSample(
  filter: Record<string, unknown>,
  sort: Record<string, 1 | -1>,
  atField: "redeemedAt" | "expiresAt"
): Promise<BonusCodeIssuanceSampleUser[]> {
  const rows = await RedeemableIssuance.find(filter)
    .select(`_id userId entriesAmount ${atField}`)
    .sort(sort)
    .limit(SAMPLE_LIMIT)
    .lean<LeanIssuanceSampleDoc[]>();
  if (rows.length === 0) return [];

  const userIds = rows.map((row) => row.userId);
  const users = await User.find({ _id: { $in: userIds } })
    .select(USER_SAMPLE_PROJECTION)
    .lean<LeanUserSampleDoc[]>();
  const userById = new Map(users.map((u) => [u._id.toString(), u]));

  return rows
    .map((row) => {
      const user = userById.get(row.userId.toString());
      if (!user) return null;
      const at = row[atField];
      return {
        userId: user._id.toString(),
        userName: `${user.firstName || ""} ${user.lastName || ""}`.trim() || "Unknown User",
        userEmail: user.email || "Unknown Email",
        entriesAmount: row.entriesAmount,
        at: at ? at.toISOString() : null,
      };
    })
    .filter((row): row is BonusCodeIssuanceSampleUser => row !== null);
}

type LeanCampaignForRedeemability = {
  _id: mongoose.Types.ObjectId;
  code: string;
  isActive: boolean;
  entriesAmount: number;
  startsAt: Date;
  endsAt?: Date | null;
  neverExpires: boolean;
  validForHours?: number | null;
};

/**
 * The primary payload: real `RedeemableIssuance` state for one campaign.
 * `campaignRedeemable` is computed ONCE via `isCampaignRedeemable` and threaded
 * into every query that needs it — never re-evaluated or re-derived per row.
 */
async function resolveIssuanceState(
  campaign: LeanCampaignForRedeemability | null,
  now: Date
): Promise<BonusCodeIssuanceState> {
  if (!campaign) return EMPTY_ISSUANCE_STATE;

  const campaignId = campaign._id;
  const campaignRedeemable = isCampaignRedeemable(campaign, now);

  const stillRedeemableFilter = buildStillRedeemableIssuanceFilter(campaignId, now);
  const redeemedFilter = buildRedeemedIssuanceFilter(campaignId);
  const expiredOrLapsedFilter = buildExpiredOrLapsedIssuanceFilter(campaignId, now, campaignRedeemable);

  const [
    issuedCount,
    redeemedCount,
    redeemedEntriesAgg,
    stillRedeemableCount,
    expiredOrLapsedCount,
    stillRedeemableSample,
    redeemedSample,
    expiredOrLapsedSample,
  ] = await Promise.all([
    RedeemableIssuance.countDocuments({ campaignId }),
    RedeemableIssuance.countDocuments(redeemedFilter),
    RedeemableIssuance.aggregate<{ _id: null; total: number }>([
      { $match: redeemedFilter },
      { $group: { _id: null, total: { $sum: "$entriesAmount" } } },
    ]),
    campaignRedeemable ? RedeemableIssuance.countDocuments(stillRedeemableFilter) : Promise.resolve(0),
    RedeemableIssuance.countDocuments(expiredOrLapsedFilter),
    campaignRedeemable
      ? resolveIssuanceSample(stillRedeemableFilter, { expiresAt: 1 }, "expiresAt")
      : Promise.resolve([]),
    resolveIssuanceSample(redeemedFilter, { redeemedAt: -1 }, "redeemedAt"),
    resolveIssuanceSample(expiredOrLapsedFilter, { expiresAt: -1 }, "expiresAt"),
  ]);

  return {
    issuedCount,
    stillRedeemableCount,
    redeemedCount,
    redeemedEntries: redeemedEntriesAgg[0]?.total ?? 0,
    expiredOrLapsedCount,
    stillRedeemableSample,
    redeemedSample,
    expiredOrLapsedSample,
  };
}

// ─── The combined row ────────────────────────────────────────────────────────

export interface BonusCodeAudienceRow {
  trigger: BonusCodeTrigger;
  /** Read from BONUS_CODE_BY_TRIGGER — never a second literal. */
  code: string;
  /** Whether an active `MonthlyEntryCampaign` currently carries this code. */
  campaignFound: boolean;
  campaignId: string | null;
  campaignActive: boolean | null;
  entriesAmount: number | null;
  /** PRIMARY. Real issuance state — who already has it, who can still redeem,
   *  who redeemed, who lapsed. */
  issuance: BonusCodeIssuanceState;
  /** SECONDARY / demoted. The addressable-population forecast — how many
   *  customers this trigger COULD reach, bucketed by recency. `allTime` is a
   *  ceiling, never the headline. See bonusCodeAudienceFilter.ts. */
  addressable: BonusCodeAudienceBuckets;
  /** Bounded preview of the ALL-TIME addressable population — never the full list. */
  sample: BonusCodeAudienceSampleUser[];
}

export class BonusCodeAudienceService {
  /**
   * Per trigger: code, campaign status, real issuance state (primary), and the
   * addressable-population forecast (secondary). Read-only — never mints,
   * issues, or redeems.
   *
   * `now` is injectable (defaults to the real clock) so bucket/redeemability
   * boundaries are testable without waiting on the calendar — matches this
   * domain's existing "no ambient clock" convention (`bonus-code-policy.ts`,
   * `CampaignService`).
   */
  static async getAudienceForAllTriggers(now: Date = new Date()): Promise<BonusCodeAudienceRow[]> {
    const triggers = Object.keys(BONUS_CODE_BY_TRIGGER) as BonusCodeTrigger[];
    const codes = triggers.map((trigger) => BONUS_CODE_BY_TRIGGER[trigger]);

    // isCampaignRedeemable needs isActive/startsAt/endsAt/neverExpires/validForHours —
    // every field it reads must be selected, or it silently reads undefined at
    // runtime with no type error (the exact trap rules.md R12 documents).
    const campaigns = await MonthlyEntryCampaign.find({ code: { $in: codes } })
      .select("_id code isActive entriesAmount startsAt endsAt neverExpires validForHours")
      .lean<LeanCampaignForRedeemability[]>();
    const campaignByCode = new Map(campaigns.map((c) => [c.code, c]));

    const [audiences, issuanceStates] = await Promise.all([
      Promise.all(triggers.map((trigger) => AUDIENCE_RESOLVERS[trigger](now))),
      Promise.all(triggers.map((trigger) => resolveIssuanceState(campaignByCode.get(BONUS_CODE_BY_TRIGGER[trigger]) ?? null, now))),
    ]);

    return triggers.map((trigger, index) => {
      const code = BONUS_CODE_BY_TRIGGER[trigger];
      const campaign = campaignByCode.get(code) ?? null;
      const { buckets, sample } = audiences[index];

      return {
        trigger,
        code,
        campaignFound: Boolean(campaign),
        campaignId: campaign ? String(campaign._id) : null,
        campaignActive: campaign ? campaign.isActive : null,
        entriesAmount: campaign ? campaign.entriesAmount : null,
        issuance: issuanceStates[index],
        addressable: buckets,
        sample,
      };
    });
  }
}
