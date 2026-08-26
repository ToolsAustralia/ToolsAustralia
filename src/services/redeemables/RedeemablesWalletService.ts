import RedeemableIssuance from "@/models/RedeemableIssuance";
import MonthlyEntryCampaign, { PurchaseRequirement } from "@/models/MonthlyEntryCampaign";
import MilestoneIssuance from "@/models/MilestoneIssuance";
import MilestoneReward from "@/models/MilestoneReward";
import User from "@/models/User";
import { hasQualifyingPurchase } from "@/utils/redeemables/purchase-eligibility";
import { personalWindowGoverns } from "@/utils/redeemables/bonus-code-policy";
import { formatExpiryLabelAEST } from "@/utils/common/timezone";
import { CampaignService, LEGACY_MISSING_EXPIRY } from "./CampaignService";

export interface RedeemableWalletItem {
  issuanceId: string;
  campaignId?: string;
  rewardId?: string;
  monthKey: string;
  code?: string;
  campaignCode?: string;
  entriesAmount: number;
  status: "active" | "redeemed" | "expired" | "cancelled" | "revoked" | "backfilled";
  issuedAt: Date;
  redeemedAt?: Date;
  expiresAt: Date;
  campaignName?: string;
  displayLabel?: string;
  purchaseRequirement: PurchaseRequirement;
  neverExpires?: boolean;
  source: "monthly-coupon" | "milestone";
  isRedeemableNow: boolean;
  /**
   * The one customer-facing expiry string (formatExpiryLabelAEST) — the same
   * function the Klaviyo email renders. Components must display this, never
   * derive a date string from `expiresAt` themselves (that's viewer-locale
   * dependent and can disagree with the email).
   */
  expiresAtLabel: string;
}

export interface RedeemableWalletResponse {
  items: RedeemableWalletItem[];
  total: number;
  page: number;
  totalPages: number;
}

export class RedeemablesWalletService {
  static async getUserWallet(
    userId: string,
    options?: {
      page?: number;
      limit?: number;
      status?: "claimable" | "past";
    }
  ): Promise<RedeemableWalletResponse> {
    const page = Math.max(1, options?.page ?? 1);
    const limit = Math.min(50, Math.max(1, options?.limit ?? 10));
    const now = new Date();

    // Auto-issue campaign rewards for this user so claimables stay in sync
    // without a manual admin "Issue" step.
    await CampaignService.ensureActiveCampaignIssuancesForUser(userId);

    const [redeemableIssuances, milestoneIssuances, purchaseUser] = await Promise.all([
      RedeemableIssuance.find({ userId }).sort({ issuedAt: -1, expiresAt: 1 }).lean(),
      // "backfilled" = pre-launch streak recognition markers (zero entries) —
      // they belong on the P3 milestone ladder, never in the claim wallet.
      MilestoneIssuance.find({ userId, status: { $ne: "backfilled" } })
        .sort({ issuedAt: -1 })
        .lean(),
      // Needed to gate purchase-required coupons (mirror of RedemptionService).
      User.findById(userId).select("subscription oneTimePackages").lean(),
    ]);

    const campaignIds = redeemableIssuances.map((i) => i.campaignId);
    // isActive and validForHours MUST be selected: isActive gates isRedeemableNow
    // below (a deactivated campaign must not show an enabled Claim button the
    // server then refuses) and validForHours feeds personalWindowGoverns for the
    // expiry-label fallback. A .select() omission here silently defeats both —
    // the fields read back as `undefined`, not a type error.
    const campaigns = await MonthlyEntryCampaign.find({ _id: { $in: campaignIds } })
      .select(
        "name displayLabel requiresPurchase purchaseRequirement code neverExpires startsAt endsAt validForHours isActive"
      )
      .lean();
    const campaignMap = new Map(campaigns.map((campaign) => [campaign._id.toString(), campaign]));

    const milestoneRewardIds = milestoneIssuances.map((i) => i.milestoneRewardId);
    const milestoneRewards = await MilestoneReward.find({ _id: { $in: milestoneRewardIds } })
      .select("name displayLabel code neverExpires")
      .lean();
    const milestoneRewardMap = new Map(milestoneRewards.map((reward) => [reward._id.toString(), reward]));

    const campaignItems: RedeemableWalletItem[] = redeemableIssuances.map((issuance) => {
      const campaign = campaignMap.get(issuance.campaignId.toString());
      const purchaseRequirement: PurchaseRequirement =
        campaign?.purchaseRequirement ?? (campaign?.requiresPurchase ? "membership" : "none");
      // A purchase-gated coupon is only claimable once the qualifying purchase
      // exists — same predicate the redeem endpoint enforces, including the
      // personal-window ceiling override (see RedemptionService.redeem): a
      // campaign whose own endsAt is a minting backstop must not also cap how
      // late the qualifying purchase is allowed to land.
      const meetsPurchaseRequirement =
        purchaseRequirement === "none" ||
        (campaign
          ? hasQualifyingPurchase(
              purchaseUser ?? {},
              personalWindowGoverns(campaign) ? { startsAt: campaign.startsAt, endsAt: null } : campaign,
              purchaseRequirement,
              now
            )
          : true);
      // A personal-window campaign (validForHours set) hands this customer their
      // OWN deadline — the issuance's real expiresAt — regardless of the
      // campaign's own neverExpires flag (mutually exclusive at the model
      // level, but an orphaned/missing campaign must not be trusted either).
      // Fall back to the issuance's own value: never render "No expiry" for a
      // coupon that actually has a real per-customer deadline.
      const isPersonalWindow = campaign ? personalWindowGoverns(campaign) : false;
      const neverExpires = isPersonalWindow ? false : (campaign?.neverExpires ?? false);
      // `expiresAt` is `required` on the model, but issueCampaignToUsers has
      // always upserted WITHOUT validators, so a production row can lack it —
      // which is exactly why CampaignService needed LEGACY_MISSING_EXPIRY.
      // getUserWallet has no per-item try/catch and /api/redeemables turns a
      // throw into a 500, so an unguarded formatExpiryLabelAEST here would let
      // ONE malformed row empty the customer's entire wallet. Reads as long
      // expired, matching the mint side's interpretation of the same shape.
      const resolvedExpiresAt = issuance.expiresAt ?? LEGACY_MISSING_EXPIRY;
      // DISPLAY status, which can differ from the stored one. A refund restores
      // `status: "active"` and $unsets `redeemedAt`, so a spent-then-refunded
      // personal-window grant keeps a future expiresAt and would otherwise sit in
      // the CLAIMABLE tab rendering as a live "Active" pill with no button — a
      // broken button, above an "Expires <date>" line that is no longer
      // meaningful. It also made Cobber's FAQ 88 ("it is not returned to your
      // account") false on screen.
      //
      // Projecting "redeemed" fixes all of it in one place: the card reads
      // "Redeemed", and because BOTH list filters below key on this status the
      // row also moves out of "claimable" into "past", where a spent grant
      // belongs. The stored row is untouched — this is presentation only, and
      // the authoritative refusals still live in RedemptionService /
      // CampaignCodeValidationService (see rules.md R3b).
      const displayStatus =
        isPersonalWindow && issuance.redeemedEverAt ? ("redeemed" as const) : issuance.status;
      return {
        issuanceId: issuance._id.toString(),
        campaignId: issuance.campaignId.toString(),
        monthKey: issuance.monthKey,
        code: issuance.code,
        campaignCode: campaign?.code,
        entriesAmount: issuance.entriesAmount,
        status: displayStatus,
        issuedAt: issuance.issuedAt,
        redeemedAt: issuance.redeemedAt,
        expiresAt: resolvedExpiresAt,
        campaignName: campaign?.name,
        displayLabel: campaign?.displayLabel,
        purchaseRequirement,
        neverExpires,
        source: "monthly-coupon",
        expiresAtLabel: formatExpiryLabelAEST(resolvedExpiresAt),
        // A deactivated or orphaned campaign must not show an enabled Claim
        // button that the server then refuses (isCampaignRedeemable requires
        // isActive too) — require the campaign to exist and be active here.
        //
        // `!issuance.redeemedEverAt` under a personal window mirrors the gate
        // RedemptionService.redeem now enforces: a refund restores status to
        // "active" and $unsets redeemedAt, so without this the wallet would
        // render an ENABLED Claim button on a grant the server will refuse —
        // and, before that gate existed, would actually re-grant. Legacy
        // monthly-coupon campaigns keep today's restore-on-refund behaviour.
        isRedeemableNow:
          issuance.status === "active" &&
          resolvedExpiresAt > now &&
          meetsPurchaseRequirement &&
          campaign != null &&
          campaign.isActive !== false &&
          !(isPersonalWindow && issuance.redeemedEverAt),
      };
    });

    const milestoneItems: RedeemableWalletItem[] = milestoneIssuances.map((issuance) => {
      const reward = milestoneRewardMap.get(issuance.milestoneRewardId.toString());
      const isExpiredByDate = Boolean(issuance.expiresAt && issuance.expiresAt <= now);
      const resolvedExpiresAt = issuance.expiresAt || new Date("9999-12-31T23:59:59.999Z");
      return {
        issuanceId: issuance._id.toString(),
        rewardId: issuance.milestoneRewardId.toString(),
        monthKey: issuance.issuedAt.toISOString().slice(0, 7),
        code: reward?.code,
        campaignCode: reward?.code,
        entriesAmount: issuance.entriesAmount,
        status: issuance.status,
        issuedAt: issuance.issuedAt,
        redeemedAt: issuance.redeemedAt,
        expiresAt: resolvedExpiresAt,
        campaignName: reward?.name,
        displayLabel: reward?.displayLabel,
        purchaseRequirement: "none",
        neverExpires: reward?.neverExpires ?? false,
        source: "milestone",
        expiresAtLabel: formatExpiryLabelAEST(resolvedExpiresAt),
        isRedeemableNow: issuance.status === "active" && !isExpiredByDate,
      };
    });

    let items = [...campaignItems, ...milestoneItems];
    if (options?.status === "claimable") {
      // Active + unexpired — INCLUDES purchase-locked coupons so they surface as
      // "unlock by purchasing" (the Claim button gates on isRedeemableNow), rather
      // than silently vanishing or being mislabeled as "past/claimed".
      items = items.filter((item) => item.status === "active" && new Date(item.expiresAt).getTime() > now.getTime());
    } else if (options?.status === "past") {
      // Terminal only: redeemed / expired / cancelled / revoked, or past expiry.
      items = items.filter((item) => item.status !== "active" || new Date(item.expiresAt).getTime() <= now.getTime());
    }

    items.sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime());
    const total = items.length;
    const paginatedItems = items.slice((page - 1) * limit, page * limit);

    return {
      items: paginatedItems,
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }
}
