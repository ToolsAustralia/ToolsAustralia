import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import { validateReferralCodeForUser } from "@/lib/referral";
import PromoLink from "@/models/PromoLink";
import MonthlyEntryCampaign from "@/models/MonthlyEntryCampaign";
import RedeemableIssuance from "@/models/RedeemableIssuance";

const validateCodeSchema = z.object({
  code: z.string().trim().min(3, "Code is required"),
  inviteeUserId: z.string().optional(),
  inviteeEmail: z.string().email().optional(),
  preferType: z.enum(["auto", "referral", "promo"]).optional(),
});

const PROMO_CODE_REGEX = /^(?=.{6,32}$)[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

type UnifiedValidationResult =
  | {
      success: true;
      valid: true;
      type: "referral";
      data: { referrerName: string };
    }
  | {
      success: true;
      valid: true;
      type: "promo";
      data: {
        code: string;
        bonusEntries: number;
        expiresAt?: Date;
        appliesToMembership: boolean;
        appliesToOneTime: boolean;
      };
    }
  | {
      success: true;
      valid: true;
      type: "campaign";
      data: {
        code: string;
        campaignName?: string;
        purchaseRequirement: "none" | "membership" | "one-time" | "any";
      };
    }
  | {
      success: true;
      valid: false;
      message: string;
    };

async function validateAsReferral(params: {
  code: string;
  inviteeUserId?: string;
  inviteeEmail?: string;
}): Promise<UnifiedValidationResult> {
  try {
    const referralData = await validateReferralCodeForUser({
      referralCode: params.code,
      inviteeUserId: params.inviteeUserId,
      inviteeEmail: params.inviteeEmail,
    });
    return {
      success: true,
      valid: true,
      type: "referral",
      data: { referrerName: referralData.referrerName },
    };
  } catch {
    return { success: true, valid: false, message: "Invalid referral code" };
  }
}

async function validateAsPromo(params: { code: string }): Promise<UnifiedValidationResult> {
  const normalizedCode = params.code.trim().toUpperCase();
  if (!PROMO_CODE_REGEX.test(normalizedCode)) {
    return { success: true, valid: false, message: "Invalid promo code format" };
  }

  const promoLink = await PromoLink.findActiveByCode(normalizedCode);
  if (!promoLink || promoLink.isExpired()) {
    return { success: true, valid: false, message: "Invalid promo code" };
  }

  return {
    success: true,
    valid: true,
    type: "promo",
    data: {
      code: promoLink.code,
      bonusEntries: promoLink.bonusEntries,
      expiresAt: promoLink.expiresAt,
      appliesToMembership: promoLink.appliesToMembership,
      appliesToOneTime: promoLink.appliesToOneTime,
    },
  };
}

async function validateAsCampaign(params: { code: string; userId?: string }): Promise<UnifiedValidationResult> {
  const normalizedCode = params.code.trim().toUpperCase();
  const now = new Date();
  const campaign = await MonthlyEntryCampaign.findOne({
    code: normalizedCode,
    isActive: true,
    startsAt: { $lte: now },
    $or: [{ neverExpires: true }, { endsAt: { $gte: now } }],
  })
    .select("_id code name requiresPurchase purchaseRequirement")
    .lean();

  if (!campaign) {
    return { success: true, valid: false, message: "Invalid campaign code" };
  }

  // Check if user has already redeemed this campaign code
  if (params.userId) {
    const existingIssuance = await RedeemableIssuance.findOne({
      campaignId: campaign._id,
      userId: params.userId,
      status: "redeemed",
    }).lean();

    if (existingIssuance) {
      return { success: true, valid: false, message: "You have already redeemed this code." };
    }
  }

  return {
    success: true,
    valid: true,
    type: "campaign",
    data: {
      code: campaign.code,
      campaignName: campaign.name,
      purchaseRequirement: campaign.purchaseRequirement ?? (campaign.requiresPurchase ? "membership" : "none"),
    },
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = validateCodeSchema.parse(body);
    const normalizedCode = parsed.code.trim().toUpperCase();
    const preferType = parsed.preferType ?? "auto";

    await connectDB();

    if (preferType === "referral") {
      const result = await validateAsReferral({
        code: normalizedCode,
        inviteeUserId: parsed.inviteeUserId,
        inviteeEmail: parsed.inviteeEmail,
      });
      return NextResponse.json(result);
    }

    if (preferType === "promo") {
      const result = await validateAsPromo({ code: normalizedCode });
      return NextResponse.json(result);
    }

    const referralResult = await validateAsReferral({
      code: normalizedCode,
      inviteeUserId: parsed.inviteeUserId,
      inviteeEmail: parsed.inviteeEmail,
    });
    if (referralResult.valid) {
      return NextResponse.json(referralResult);
    }

    const promoResult = await validateAsPromo({ code: normalizedCode });
    if (promoResult.valid) {
      return NextResponse.json(promoResult);
    }

    const campaignResult = await validateAsCampaign({ code: normalizedCode, userId: parsed.inviteeUserId });
    if (campaignResult.valid) {
      return NextResponse.json(campaignResult);
    }

    return NextResponse.json({
      success: true,
      valid: false,
      message: "This code is not valid right now.",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          valid: false,
          error: "Validation error",
          details: error.issues,
        },
        { status: 400 }
      );
    }

    console.error("Unified code validation failed:", error);
    return NextResponse.json(
      {
        success: false,
        valid: false,
        error: "Failed to validate code",
      },
      { status: 500 }
    );
  }
}
