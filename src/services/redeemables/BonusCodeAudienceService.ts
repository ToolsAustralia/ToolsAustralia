/**
 * BonusCodeAudienceService.ts
 *
 * Read-only forecast of "how many customers can this trigger reach", per
 * webhook-minted bonus code (`docs/superpowers/specs/2026-09-01-coupon-audience-and-ad-url-check-design.md`
 * §A). NEVER mints, issues, or redeems anything — every query here is a `find`
 * / `countDocuments` / `aggregate` read.
 *
 * WHY A FORECAST, NOT A HOLDER COUNT. All three campaigns (`BACKIN200` /
 * `LOCKIN100` / `EXTRA100`) sit at 0 `RedeemableIssuance` rows and 0
 * `BonusCodeWebhookCall` rows in production as of 2026-09-01 — a "who currently
 * holds this code" view renders empty today and stays near-empty between sends.
 * The addressable-population count is what answers "the numbers that can renew"
 * before minting starts; issued/redeemed counts are surfaced alongside so the
 * same card becomes the real number once it does.
 *
 * THE TRIGGER -> CODE MAP IS READ, NEVER RESTATED. `BONUS_CODE_BY_TRIGGER`
 * (`@/config/bonusCodes`) is the only place these three strings are spelled —
 * see that file's own header for why a second copy is dangerous.
 *
 * AUDIENCE PREDICATES live in `@/utils/redeemables/bonusCodeAudienceFilter`
 * (pure, DB-free, testable) — this service only wires them to the actual
 * collections. See that file's header for the reasoning behind each one and the
 * one approximation (`checkout-start`, where no persisted event log exists).
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
} from "@/utils/redeemables/bonusCodeAudienceFilter";

/** Bounded sample size — this view must never ship a full user list (CLAUDE.md
 *  performance footgun #3: an unprojected list query has already shipped an
 *  MB-scale incident in this repo). The count is exact; the sample is a preview. */
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
  /** The forecast: how many customers this trigger's population currently contains. */
  addressableCount: number;
  /** Bounded preview of that population — never the full list. */
  sample: BonusCodeAudienceSampleUser[];
  /** Current RedeemableIssuance rows for this campaign, any status. */
  issuedCount: number;
  /** Current RedeemableIssuance rows with status "redeemed". */
  redeemedCount: number;
}

interface AudienceResolution {
  count: number;
  sample: BonusCodeAudienceSampleUser[];
}

type LeanUserSampleDoc = {
  _id: mongoose.Types.ObjectId;
  firstName?: string;
  lastName?: string;
  email?: string;
};

function toSampleUser(user: LeanUserSampleDoc): BonusCodeAudienceSampleUser {
  return {
    userId: user._id.toString(),
    userName: `${user.firstName || ""} ${user.lastName || ""}`.trim() || "Unknown User",
    userEmail: user.email || "Unknown Email",
  };
}

async function sampleAndCount(filter: Record<string, unknown>): Promise<AudienceResolution> {
  const [count, sample] = await Promise.all([
    User.countDocuments(filter),
    User.find(filter)
      .select(USER_SAMPLE_PROJECTION)
      .sort({ createdAt: -1 })
      .limit(SAMPLE_LIMIT)
      .lean<LeanUserSampleDoc[]>(),
  ]);
  return { count, sample: sample.map(toSampleUser) };
}

async function resolveCheckoutStartAudience(): Promise<AudienceResolution> {
  return sampleAndCount(buildCheckoutStartAudienceFilter());
}

async function resolveOneTimePurchaseAudience(): Promise<AudienceResolution> {
  return sampleAndCount(buildOneTimePurchaseAudienceFilter());
}

async function resolveCancelClickAudience(): Promise<AudienceResolution> {
  // Step 1: who committed a self-service cancellation, ever (CancellationFlowEvent
  // is the flow's own record — see bonusCodeAudienceFilter.ts header).
  const userIds = await CancellationFlowEvent.distinct("userId", CANCEL_CLICK_FLOW_EVENT_FILTER);
  if (userIds.length === 0) return { count: 0, sample: [] };
  // Step 2: narrow to accounts that have not since resubscribed.
  return sampleAndCount(buildCancelClickUserFilter(userIds as mongoose.Types.ObjectId[]));
}

const AUDIENCE_RESOLVERS: Record<BonusCodeTrigger, () => Promise<AudienceResolution>> = {
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
   * Per trigger: code, campaign status, addressable count + bounded sample,
   * and current issuance/redemption counts. Read-only — never mints, issues,
   * or redeems.
   */
  static async getAudienceForAllTriggers(): Promise<BonusCodeAudienceRow[]> {
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

    const audiences = await Promise.all(triggers.map((trigger) => AUDIENCE_RESOLVERS[trigger]()));

    return triggers.map((trigger, index) => {
      const code = BONUS_CODE_BY_TRIGGER[trigger];
      const campaign = campaignByCode.get(code) ?? null;
      const issuance = campaign ? issuanceByCampaignId.get(String(campaign._id)) : undefined;
      const { count, sample } = audiences[index];

      return {
        trigger,
        code,
        campaignFound: Boolean(campaign),
        campaignId: campaign ? String(campaign._id) : null,
        campaignActive: campaign ? campaign.isActive : null,
        entriesAmount: campaign ? campaign.entriesAmount : null,
        addressableCount: count,
        sample,
        issuedCount: issuance?.issuedCount ?? 0,
        redeemedCount: issuance?.redeemedCount ?? 0,
      };
    });
  }
}
