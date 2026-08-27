import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUserDoc } from "@/lib/api-auth";
import { sendSms, normaliseAuMobile } from "@/lib/sms";
import {
  claimOtpSendAllowance,
  describeOtpRefusal,
  generateOtpCode,
  hashOtpCode,
  getOtpExpiry,
  OTP_EXPIRY_MINUTES,
} from "@/utils/auth/mobile-otp";
import { requireSameOrigin } from "@/utils/security/requireSameOrigin";

/**
 * POST /api/auth/send-mobile-verification
 *
 * Texts a verification code to the mobile ON FILE for the signed-in account.
 * Used by the profile-setup step and by account settings to satisfy the
 * "at least one verified contact channel" requirement.
 *
 * The sibling of `send-email-verification`. Unlike the SMS *login* route, this one
 * is session-authed, so there is no enumeration surface and no `hasEverPaid` gate
 * is needed — the caller is already a signed-in member, and only their own number
 * can be targeted. The body is empty by design: the destination comes from the
 * session's user record, never from the request.
 */
export async function POST(request: NextRequest) {
  try {
    const csrf = requireSameOrigin(request);
    if (csrf) return csrf;

    const auth = await requireAuthenticatedUserDoc();
    if ("errorResponse" in auth) return auth.errorResponse;
    const { user } = auth;

    if (user.isMobileVerified) {
      return NextResponse.json(
        { success: false, error: "Your mobile is already verified." },
        { status: 400 }
      );
    }

    const e164 = normaliseAuMobile(user.mobile);
    if (!e164) {
      // Actionable, not a dead end: settings lets them correct the number.
      return NextResponse.json(
        {
          success: false,
          error: "We don't have a valid Australian mobile on your account. Update it and try again.",
          code: "NO_VALID_MOBILE",
        },
        { status: 400 }
      );
    }

    // Keyed on the user, not the number: this route is authenticated, so the
    // account is the thing worth budgeting.
    const allowance = await claimOtpSendAllowance(`user:${user._id.toString()}`);
    if (!allowance.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: describeOtpRefusal(allowance),
          retryAfterSeconds: allowance.retryAfterSeconds,
        },
        { status: 429, headers: { "Retry-After": String(allowance.retryAfterSeconds) } }
      );
    }

    const code = generateOtpCode();
    user.smsOtpHash = hashOtpCode(code);
    user.smsOtpExpires = getOtpExpiry();
    user.smsOtpAttempts = 0;
    await user.save();

    const sent = await sendSms(
      e164,
      `${code} is your Tools Australia verification code. It expires in ${OTP_EXPIRY_MINUTES} minutes.`,
      { reference: "verify" }
    );

    if (!sent.success) {
      // Nothing delivered ⇒ nothing charged against their 3/day, and clear the
      // code so it cannot silently consume their verify attempts.
      await allowance.release();
      user.smsOtpHash = undefined;
      user.smsOtpExpires = undefined;
      await user.save();
      console.error(`send-mobile-verification: gateway failure — ${sent.error}`);
      return NextResponse.json(
        { success: false, error: "We couldn't send the code right now. Please try again shortly." },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Code sent. It expires in ${OTP_EXPIRY_MINUTES} minutes.`,
      remainingToday: allowance.remainingToday,
    });
  } catch (error) {
    console.error("send-mobile-verification error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
