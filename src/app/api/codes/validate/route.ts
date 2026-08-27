import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import { authOptions } from "@/lib/auth";
import { validateReferralCodeForUser } from "@/lib/referral";
import PromoLink from "@/models/PromoLink";
import { createRateLimiter, getClientIdentifier } from "@/utils/security/rateLimiter";
import {
  CampaignCodeValidationService,
  type CampaignCodeValidation,
} from "@/services/redeemables/CampaignCodeValidationService";

const validateCodeSchema = z.object({
  code: z.string().trim().min(3, "Code is required"),
  /**
   * REFERRAL LEG ONLY. This is a referral-graph input (which invitee is being
   * checked against which referrer), never an identity claim — the campaign leg
   * resolves the caller from the session instead. Trusting it there let anyone
   * holding a mass-emailed code plus a victim's ObjectId read back whether that
   * customer held the code, whether they had spent it, and the exact instant of
   * their personal window.
   */
  inviteeUserId: z.string().optional(),
  inviteeEmail: z.string().email().optional(),
  preferType: z.enum(["auto", "referral", "promo"]).optional(),
});

const PROMO_CODE_REGEX = /^(?=.{6,32}$)[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

// Matches the sibling public validator `/api/promo/link/validate`. This endpoint
// is unauthenticated by design (guest checkout must be able to check a code), so
// a limit is the only thing between it and enumerating the campaign code space.
const validateCodeRateLimiter = createRateLimiter("codes-validate", {
  windowMs: 60 * 1000,
  maxRequests: 60,
});

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

/**
 * Detect the ONE session-resolution failure that is not a fault: calling
 * `getServerSession` outside a Next request scope, which reaches for
 * `headers()` and throws. That happens in a tsx test harness, never in a real
 * request. Anything else — an unreachable session store, a malformed JWT, a
 * misconfigured secret — is a genuine failure and must not be swallowed.
 */
function isOutsideRequestScope(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("outside a request scope") || message.includes("next-dynamic-api-wrong-context");
}

/**
 * The caller's own id, or undefined for a guest.
 *
 * A guest is `getServerSession` RETURNING null, which is the normal path and
 * needs no catch. The narrow catch below covers only the out-of-request-scope
 * case. Every other error is rethrown deliberately: this endpoint's answer
 * DEPENDS on identity, so silently downgrading a signed-in customer to the
 * guest answer would tell them a code applies when it may not — the exact
 * "sees APPLIED, pays, gets nothing" failure this branch is closing. A 500 is
 * the honest response to "we could not determine who is asking", and it is
 * visible; a wrong `valid: true` is neither.
 */
async function resolveCallerId(): Promise<string | undefined> {
  try {
    const session = await getServerSession(authOptions);
    return session?.user?.id;
  } catch (error) {
    if (isOutsideRequestScope(error)) return undefined;
    console.error("[codes/validate] session resolution failed — refusing to answer as a guest", error);
    throw error;
  }
}

/** Response shaping only — the decision itself belongs to the service. */
function toUnifiedResult(result: CampaignCodeValidation): UnifiedValidationResult {
  if (result.valid) {
    return {
      success: true,
      valid: true,
      type: "campaign",
      data: {
        code: result.code,
        campaignName: result.campaignName,
        purchaseRequirement: result.purchaseRequirement,
      },
    };
  }
  return { success: true, valid: false, message: result.message };
}

export async function POST(request: NextRequest) {
  try {
    const clientIp = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? null;
    const identifier = getClientIdentifier(clientIp, request.headers.get("x-forwarded-for"));
    const rateLimitResult = validateCodeRateLimiter.check(identifier);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          success: false,
          valid: false,
          error: "Too many requests",
          retryAfterSeconds: rateLimitResult.retryAfterSeconds,
        },
        { status: 429, headers: { "Retry-After": String(rateLimitResult.retryAfterSeconds) } }
      );
    }

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

    // Identity for the campaign leg comes from the SESSION, never the body — see
    // the `inviteeUserId` note on the schema. No session is the guest-checkout
    // case, which the service answers from the campaign window alone.
    const campaignResult = await CampaignCodeValidationService.validate({
      code: normalizedCode,
      userId: await resolveCallerId(),
    });
    if (campaignResult.valid) {
      return NextResponse.json(toUnifiedResult(campaignResult));
    }
    if (campaignResult.reason !== "not_found") {
      // The code DID resolve to a real campaign — surface the specific reason
      // ("already redeemed" / the dated personal-window expiry / not on this
      // account) instead of the generic message below, which exists for codes
      // that matched nothing.
      return NextResponse.json(toUnifiedResult(campaignResult));
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

