import mongoose from "mongoose";
import PromoLink, { IPromoLink } from "@/models/PromoLink";
import { PromoEligibilityService } from "./PromoEligibilityService";

export type PromoRedemptionReason =
  | "redeemed"
  | "invalid"
  | "inactive"
  | "expired"
  | "not_applicable"
  | "already_used"
  | "audience_mismatch"
  | "requires_inactive_subscription"
  | "missing_cancelled_at"
  | "cancelled_window_exceeded"
  | "concurrency_conflict";

export interface PromoRedemptionResult {
  redeemed: boolean;
  reason: PromoRedemptionReason;
  bonusEntries: number;
  promoLink?: IPromoLink;
}

interface UserSnapshot {
  _id: string | mongoose.Types.ObjectId | { toString: () => string };
  subscription?: {
    cancelledAt?: Date;
    isActive?: boolean;
    status?: string;
  };
}

const PROMO_CODE_REGEX = /^(?=.{6,32}$)[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

export class PromoRedemptionService {
  static async redeem({
    user,
    promoCode,
    isMembershipPurchase,
    isOneTimePurchase,
  }: {
    user: UserSnapshot;
    promoCode: string;
    isMembershipPurchase: boolean;
    isOneTimePurchase: boolean;
  }): Promise<PromoRedemptionResult> {
    const code = normalizeCode(promoCode);
    if (!PROMO_CODE_REGEX.test(code)) {
      return { redeemed: false, reason: "invalid", bonusEntries: 0 };
    }

    const promoLink = await PromoLink.findOne({ code });
    if (!promoLink) {
      return { redeemed: false, reason: "invalid", bonusEntries: 0 };
    }

    if (!promoLink.isActive) {
      return { redeemed: false, reason: "inactive", bonusEntries: 0 };
    }

    if (promoLink.isExpired()) {
      return { redeemed: false, reason: "expired", bonusEntries: 0 };
    }

    if ((isMembershipPurchase && !promoLink.appliesToMembership) || (isOneTimePurchase && !promoLink.appliesToOneTime)) {
      return { redeemed: false, reason: "not_applicable", bonusEntries: 0 };
    }

    const eligibility = PromoEligibilityService.evaluateAudienceEligibility(promoLink, user);
    if (!eligibility.eligible) {
      return {
        redeemed: false,
        reason: eligibility.reason,
        bonusEntries: 0,
      };
    }

    const userId = typeof user._id === "string" ? user._id : user._id.toString();
    if (promoLink.isUsedByUser(userId)) {
      return { redeemed: false, reason: "already_used", bonusEntries: 0 };
    }

    const now = new Date();
    const applicabilityFilter =
      isMembershipPurchase && !isOneTimePurchase
        ? { appliesToMembership: true }
        : isOneTimePurchase && !isMembershipPurchase
        ? { appliesToOneTime: true }
        : {};

    const redeemedPromo = await PromoLink.findOneAndUpdate(
      {
        _id: promoLink._id,
        code,
        isActive: true,
        ...applicabilityFilter,
        $or: [{ expiresAt: null }, { expiresAt: { $exists: false } }, { expiresAt: { $gt: now } }],
        usedBy: { $ne: userId },
      },
      {
        $addToSet: { usedBy: userId },
        $inc: { usageCount: 1 },
      },
      { new: true }
    );

    if (!redeemedPromo) {
      return { redeemed: false, reason: "concurrency_conflict", bonusEntries: 0 };
    }

    return {
      redeemed: true,
      reason: "redeemed",
      bonusEntries: redeemedPromo.bonusEntries,
      promoLink: redeemedPromo,
    };
  }

  /** Reverse a successful promo-link redemption (refund path). */
  static async unredeem(params: { promoLinkId: string; userId: string }): Promise<void> {
    const uid =
      typeof params.userId === "string" ? params.userId : (params.userId as { toString(): string }).toString();
    await PromoLink.updateOne({ _id: params.promoLinkId }, { $pull: { usedBy: uid }, $inc: { usageCount: -1 } });
    await PromoLink.updateOne({ _id: params.promoLinkId, usageCount: { $lt: 0 } }, { $set: { usageCount: 0 } });
  }
}
