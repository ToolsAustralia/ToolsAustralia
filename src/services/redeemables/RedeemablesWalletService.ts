import RedeemableIssuance from "@/models/RedeemableIssuance";
import MonthlyEntryCampaign, { PurchaseRequirement } from "@/models/MonthlyEntryCampaign";
import MilestoneIssuance from "@/models/MilestoneIssuance";
import MilestoneReward from "@/models/MilestoneReward";
import User from "@/models/User";
import { hasQualifyingPurchase } from "@/utils/redeemables/purchase-eligibility";
import { CampaignService } from "./CampaignService";

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
    const campaigns = await MonthlyEntryCampaign.find({ _id: { $in: campaignIds } })
      .select("name displayLabel requiresPurchase purchaseRequirement code neverExpires startsAt endsAt")
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
      // exists — same predicate the redeem endpoint enforces.
      const meetsPurchaseRequirement =
        purchaseRequirement === "none" ||
        (campaign ? hasQualifyingPurchase(purchaseUser ?? {}, campaign, purchaseRequirement, now) : true);
      return {
        issuanceId: issuance._id.toString(),
        campaignId: issuance.campaignId.toString(),
        monthKey: issuance.monthKey,
        code: issuance.code,
        campaignCode: campaign?.code,
        entriesAmount: issuance.entriesAmount,
        status: issuance.status,
        issuedAt: issuance.issuedAt,
        redeemedAt: issuance.redeemedAt,
        expiresAt: issuance.expiresAt,
        campaignName: campaign?.name,
        displayLabel: campaign?.displayLabel,
        purchaseRequirement,
        neverExpires: campaign?.neverExpires ?? false,
        source: "monthly-coupon",
        isRedeemableNow:
          issuance.status === "active" && issuance.expiresAt > now && meetsPurchaseRequirement,
      };
    });

    const milestoneItems: RedeemableWalletItem[] = milestoneIssuances.map((issuance) => {
      const reward = milestoneRewardMap.get(issuance.milestoneRewardId.toString());
      const isExpiredByDate = Boolean(issuance.expiresAt && issuance.expiresAt <= now);
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
        expiresAt: issuance.expiresAt || new Date("9999-12-31T23:59:59.999Z"),
        campaignName: reward?.name,
        displayLabel: reward?.displayLabel,
        purchaseRequirement: "none",
        neverExpires: reward?.neverExpires ?? false,
        source: "milestone",
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
