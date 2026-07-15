import mongoose from "mongoose";
import MonthlyEntryCampaign from "@/models/MonthlyEntryCampaign";
import RedeemableIssuance from "@/models/RedeemableIssuance";
import MilestoneIssuance from "@/models/MilestoneIssuance";
import MilestoneReward from "@/models/MilestoneReward";
import User from "@/models/User";
import { hasQualifyingPurchase } from "@/utils/redeemables/purchase-eligibility";
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
  /** Set when redemption succeeds — used for refund ledger / unredeem. */
  redemptionKind?: "monthly-coupon" | "milestone";
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

    const user = await User.findById(params.userId).select("_id isActive subscription isEmailVerified accumulatedEntries oneTimePackages");
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
        redemptionKind: "milestone",
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

    // Purchase-gated coupons require a REAL qualifying purchase inside the
    // campaign window — not a lifetime entry balance or an old subscription.
    // (Previously `accumulatedEntries === 0` was used as a proxy, which granted
    // "buy to unlock" coupons for free to any past purchaser / active member.)
    const purchaseReq = campaign.purchaseRequirement ?? (campaign.requiresPurchase ? "membership" : "none");
    if (!hasQualifyingPurchase(user, campaign, purchaseReq, now)) {
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
      redemptionKind: "monthly-coupon",
    };
  }

  /**
   * Undo a monthly-coupon redemption (refund path). Restores issuance to active and reverses entries.
   */
  static async unredeemMonthlyCouponRedemption(params: {
    userId: string;
    redeemableIssuanceId: string;
  }): Promise<{ success: boolean; error?: string }> {
    const { userId, redeemableIssuanceId } = params;
    if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(redeemableIssuanceId)) {
      return { success: false, error: "invalid_ids" };
    }
    try {
      const issuance = await RedeemableIssuance.findOne({
        _id: new mongoose.Types.ObjectId(redeemableIssuanceId),
        userId: new mongoose.Types.ObjectId(userId),
        status: "redeemed",
      });
      if (!issuance) {
        return { success: false, error: "issuance_not_found_or_not_redeemed" };
      }
      const entriesAmount = issuance.entriesAmount;
      const redemptionId = `monthly-coupon-${String(issuance._id)}`;

      await RedeemableIssuance.updateOne(
        { _id: issuance._id },
        {
          $set: { status: "active" },
          $unset: { redeemedAt: 1 },
        }
      );

      await User.updateOne(
        { _id: new mongoose.Types.ObjectId(userId) },
        {
          $inc: { accumulatedEntries: -entriesAmount },
          $pull: { redemptionHistory: { redemptionId } },
        }
      );

      const { removeMajorDrawEntries } = await import("@/utils/draws/remove-draw-entries");
      await removeMajorDrawEntries(userId, entriesAmount, "bonus-entry-promo");

      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  /**
   * Auto-grant an ACTIVE milestone issuance straight into the Major Draw — the
   * Membership Streak delivery path (autoGrant rewards; no manual claim step).
   * Mirrors the atomic manual-claim block above: findOneAndUpdate active→redeemed
   * is the concurrency gate (a racing caller loses and no-ops), then the entries
   * land via DrawGrantService under the "streak" source bucket. The milestone
   * re-check is skipped to prevent re-entrancy (streak entries are excluded from
   * the entries-gained metric anyway).
   */
  static async autoRedeemMilestoneIssuance(
    userId: string,
    milestoneIssuanceId: string
  ): Promise<{ success: boolean; entriesGranted?: number; error?: string }> {
    if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(milestoneIssuanceId)) {
      return { success: false, error: "invalid_ids" };
    }
    const now = new Date();
    const updated = await MilestoneIssuance.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(milestoneIssuanceId),
        userId: new mongoose.Types.ObjectId(userId),
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
    if (!updated) {
      return { success: false, error: "not_active_or_concurrent" };
    }

    await User.findByIdAndUpdate(new mongoose.Types.ObjectId(userId), {
      $inc: { accumulatedEntries: updated.entriesAmount },
      $push: {
        redemptionHistory: {
          redemptionId: `milestone-${String(updated._id)}`,
          redemptionType: "entry",
          pointsDeducted: 0,
          value: updated.entriesAmount,
          description: "Streak milestone — landed automatically",
          redeemedAt: now,
          status: "completed",
        },
      },
    });

    await DrawGrantService.grantMonthlyCouponEntries(userId, updated.entriesAmount, "streak", {
      skipMilestoneCheck: true,
    });

    return { success: true, entriesGranted: updated.entriesAmount };
  }

  /**
   * Undo milestone reward redemption (entries granted when user redeemed an active issuance).
   */
  static async unredeemMilestoneRedemption(params: {
    userId: string;
    milestoneIssuanceId: string;
  }): Promise<{ success: boolean; error?: string }> {
    const { userId, milestoneIssuanceId } = params;
    if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(milestoneIssuanceId)) {
      return { success: false, error: "invalid_ids" };
    }
    try {
      const doc = await MilestoneIssuance.findOne({
        _id: new mongoose.Types.ObjectId(milestoneIssuanceId),
        userId: new mongoose.Types.ObjectId(userId),
        status: "redeemed",
      });
      if (!doc) {
        return { success: false, error: "not_redeemed" };
      }
      const entriesAmount = doc.entriesAmount;
      const redemptionId = `milestone-${String(doc._id)}`;

      await User.updateOne(
        { _id: new mongoose.Types.ObjectId(userId) },
        {
          $inc: { accumulatedEntries: -entriesAmount },
          $pull: { redemptionHistory: { redemptionId } },
        }
      );

      const { removeMajorDrawEntries } = await import("@/utils/draws/remove-draw-entries");
      // Streak auto-grants land in the "streak" bucket; every other milestone
      // redemption lands in "bonus-entry-promo" — reversal must match the grant.
      const sourceKey = doc.milestoneType === "streak-months" ? "streak" : "bonus-entry-promo";
      await removeMajorDrawEntries(userId, entriesAmount, sourceKey);

      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}
