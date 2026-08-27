import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedUserDoc } from "@/lib/api-auth";
import { verifyOtpCode, isOtpExpired, OTP_MAX_VERIFY_ATTEMPTS } from "@/utils/auth/mobile-otp";
import { requireSameOrigin } from "@/utils/security/requireSameOrigin";

/**
 * POST /api/auth/verify-mobile
 *
 * Confirms the code from `send-mobile-verification` and marks the signed-in
 * member's mobile verified. The sibling of `verify-email`.
 *
 * Issues NO session — the caller already has one. That is the whole difference
 * from `verify-mobile-login`, which proves identity to a logged-out visitor.
 */

const schema = z.object({
  code: z.string().length(6, "Code must be 6 digits"),
});

export async function POST(request: NextRequest) {
  try {
    const csrf = requireSameOrigin(request);
    if (csrf) return csrf;

    const auth = await requireAuthenticatedUserDoc();
    if ("errorResponse" in auth) return auth.errorResponse;
    const { user } = auth;

    const { code } = schema.parse(await request.json());

    if (!user.smsOtpHash || !user.smsOtpExpires) {
      return NextResponse.json(
        { success: false, error: "No code to check. Please request a new one." },
        { status: 400 }
      );
    }

    if (isOtpExpired(user.smsOtpExpires)) {
      user.smsOtpHash = undefined;
      user.smsOtpExpires = undefined;
      user.smsOtpAttempts = 0;
      await user.save();
      return NextResponse.json(
        { success: false, error: "That code has expired. Please request a new one." },
        { status: 400 }
      );
    }

    const attempts = user.smsOtpAttempts || 0;
    if (attempts >= OTP_MAX_VERIFY_ATTEMPTS) {
      user.smsOtpHash = undefined;
      user.smsOtpExpires = undefined;
      user.smsOtpAttempts = 0;
      await user.save();
      return NextResponse.json(
        { success: false, error: "Too many incorrect attempts. Please request a new code." },
        { status: 400 }
      );
    }

    if (!verifyOtpCode(code, user.smsOtpHash)) {
      user.smsOtpAttempts = attempts + 1;
      await user.save();
      const remaining = OTP_MAX_VERIFY_ATTEMPTS - user.smsOtpAttempts;
      return NextResponse.json(
        {
          success: false,
          error: `That code isn't right. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
          remainingAttempts: remaining,
        },
        { status: 400 }
      );
    }

    user.smsOtpHash = undefined;
    user.smsOtpExpires = undefined;
    user.smsOtpAttempts = 0;
    user.isMobileVerified = true;
    await user.save();

    try {
      const { ensureUserProfileSynced } = await import("@/utils/integrations/klaviyo/klaviyo-profile-sync");
      // Keeps the segmentable `is_mobile_verified` profile property in step.
      ensureUserProfileSynced(user);
    } catch (klaviyoError) {
      console.error("Klaviyo sync after mobile verification (non-critical):", klaviyoError);
    }

    return NextResponse.json({
      success: true,
      message: "Mobile verified",
      isMobileVerified: true,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: "Invalid request data" }, { status: 400 });
    }
    console.error("verify-mobile error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
