import mongoose from "mongoose";
import MonthlyEntryCampaign from "@/models/MonthlyEntryCampaign";
import RedeemableIssuance from "@/models/RedeemableIssuance";
import MilestoneIssuance from "@/models/MilestoneIssuance";
import MilestoneReward from "@/models/MilestoneReward";
import User from "@/models/User";
import { DrawGrantService } from "./DrawGrantService";

export type RedemptionFailureReason =
  | "unauthorized"
  | "campaign_not_found"
  | "campaign_not_active"
  | "invalid_code"
  | "already_redeemed"
  | "expired"
  | "ineligible"
  | "concurrency_conflict";

export interface RedemptionResult {
  success: boolean;
  reason?: RedemptionFailureReason;
  entriesGranted?: number;
  issuanceId?: string;
}

export class RedemptionService {
  static async redeem(params: {
    userId: string;
    code?: string;
    issuanceId?: string;
  }): Promise<RedemptionResult> {
    if (!mongoose.Types.ObjectId.isValid(params.userId)) {
      return { success: false, reason: "unauthorized" };
    }

    const user = await User.findById(params.userId).select("_id isActive subscription isEmailVerified accumulatedEntries");
    if (!user || !user.isActive) {
      return { success: false, reason: "unauthorized" };
    }

    const now = new Date();
    let issuance = null;
    let milestoneIssuance = null;
    let redemptionSource: "monthly-coupon" | "milestone" = "monthly-coupon";

    if (params.issuanceId && mongoose.Types.ObjectId.isValid(params.issuanceId)) {
      issuance = await RedeemableIssuance.findOne({
        _id: params.issuanceId,
        userId: user._id,
      });
      if (!issuance) {
        milestoneIssuance = await MilestoneIssuance.findOne({
          _id: params.issuanceId,
          userId: user._id,
        });
        if (milestoneIssuance) {
          redemptionSource = "milestone";
        }
      }
    } else if (params.code) {
      const normalizedCode = params.code.trim().toUpperCase();
      issuance = await RedeemableIssuance.findOne({
        userId: user._id,
        code: normalizedCode,
      });

      if (!issuance) {
        const campaign = await MonthlyEntryCampaign.findOne({
          code: normalizedCode,
          isActive: true,
          startsAt: { $lte: now },
          $or: [{ neverExpires: true }, { endsAt: { $gte: now } }],
        });

        if (!campaign) {
          return { success: false, reason: "invalid_code" };
        }

        issuance = await RedeemableIssuance.findOne({
          campaignId: campaign._id,
          userId: user._id,
        });
      }

      if (!issuance) {
        const reward = await MilestoneReward.findOne({
          code: normalizedCode,
          isActive: true,
          $or: [{ startsAt: { $exists: false } }, { startsAt: null }, { startsAt: { $lte: now } }],
          $and: [{ $or: [{ neverExpires: true }, { endsAt: { $gte: now } }, { endsAt: { $exists: false } }] }],
        });
        if (reward) {
          milestoneIssuance = await MilestoneIssuance.findOne({
            milestoneRewardId: reward._id,
            userId: user._id,
            status: "active",
          }).sort({ issuedAt: -1 });
          if (milestoneIssuance) {
            redemptionSource = "milestone";
          }
        }
      }
    }

    if (!issuance && !milestoneIssuance) {
      return { success: false, reason: "campaign_not_found" };
    }

    if (redemptionSource === "milestone" && milestoneIssuance) {
      if (milestoneIssuance.status === "redeemed") {
        return { success: false, reason: "already_redeemed" };
      }
      if ((milestoneIssuance.expiresAt && milestoneIssuance.expiresAt <= now) || milestoneIssuance.status === "expired") {
        return { success: false, reason: "expired" };
      }

      const updatedMilestoneIssuance = await MilestoneIssuance.findOneAndUpdate(
        {
          _id: milestoneIssuance._id,
          userId: user._id,
          status: "active",
          $or: [{ expiresAt: { $exists: false } }, { expiresAt: null }, { expiresAt: { $gt: now } }],
        },
        {
          $set: {
            status: "redeemed",
            redeemedAt: now,
          },
        },
        { new: true }
      );

      if (!updatedMilestoneIssuance) {
        return { success: false, reason: "concurrency_conflict" };
      }

      await User.findByIdAndUpdate(user._id, {
        $inc: { accumulatedEntries: updatedMilestoneIssuance.entriesAmount },
        $push: {
          redemptionHistory: {
            redemptionId: `milestone-${String(updatedMilestoneIssuance._id)}`,
            redemptionType: "entry",
            pointsDeducted: 0,
            value: updatedMilestoneIssuance.entriesAmount,
            description: `Redeemed milestone reward (${updatedMilestoneIssuance.milestoneType})`,
            redeemedAt: now,
            status: "completed",
          },
        },
      });

      await DrawGrantService.grantMonthlyCouponEntries(user._id.toString(), updatedMilestoneIssuance.entriesAmount);

      return {
        success: true,
        entriesGranted: updatedMilestoneIssuance.entriesAmount,
        issuanceId: String(updatedMilestoneIssuance._id),
      };
    }

    if (!issuance) {
      return { success: false, reason: "campaign_not_found" };
    }

    const campaign = await MonthlyEntryCampaign.findById(issuance.campaignId);
    if (!campaign) {
      return { success: false, reason: "campaign_not_found" };
    }

    const isCampaignInWindow =
      campaign.isActive &&
      campaign.startsAt <= now &&
      (campaign.neverExpires || (campaign.endsAt ? campaign.endsAt >= now : false));
    if (!isCampaignInWindow) {
      return { success: false, reason: "campaign_not_active" };
    }

    const purchaseReq = campaign.purchaseRequirement ?? (campaign.requiresPurchase ? "membership" : "none");
    
    if (purchaseReq === "membership" && !user.subscription?.isActive) {
      return { success: false, reason: "ineligible" };
    }
    
    if (purchaseReq === "one-time" && !user.subscription?.isActive && user.accumulatedEntries === 0) {
      return { success: false, reason: "ineligible" };
    }
    
    if (purchaseReq === "any" && !user.subscription?.isActive && user.accumulatedEntries === 0) {
      return { success: false, reason: "ineligible" };
    }

    if (issuance.status === "redeemed") {
      return { success: false, reason: "already_redeemed" };
    }

    if (issuance.expiresAt <= now || issuance.status === "expired") {
      return { success: false, reason: "expired" };
    }

    const updatedIssuance = await RedeemableIssuance.findOneAndUpdate(
      {
        _id: issuance._id,
        userId: user._id,
        status: "active",
        expiresAt: { $gt: now },
      },
      {
        $set: {
          status: "redeemed",
          redeemedAt: now,
        },
      },
      { new: true }
    );

    if (!updatedIssuance) {
      return { success: false, reason: "concurrency_conflict" };
    }

    await User.findByIdAndUpdate(user._id, {
      $inc: { accumulatedEntries: updatedIssuance.entriesAmount },
      $push: {
        redemptionHistory: {
          redemptionId: `monthly-coupon-${String(updatedIssuance._id)}`,
          redemptionType: "entry",
          pointsDeducted: 0,
          value: updatedIssuance.entriesAmount,
          description: `Redeemed monthly free-entry coupon (${updatedIssuance.monthKey})`,
          redeemedAt: now,
          status: "completed",
        },
      },
    });

    await DrawGrantService.grantMonthlyCouponEntries(user._id.toString(), updatedIssuance.entriesAmount);

    console.log("Redeemable redeemed", {
      userId: user._id.toString(),
      issuanceId: String(updatedIssuance._id),
      campaignId: String(campaign._id),
      entriesGranted: updatedIssuance.entriesAmount,
    });

    return {
      success: true,
      entriesGranted: updatedIssuance.entriesAmount,
      issuanceId: String(updatedIssuance._id),
    };
  }
}
