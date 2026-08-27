import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { signJWT } from "@/lib/jwt";
import { normaliseAuMobile } from "@/lib/sms";
import { verifyOtpCode, isOtpExpired, OTP_MAX_VERIFY_ATTEMPTS } from "@/utils/auth/mobile-otp";
import { createDistributedRateLimiter, getClientIdentifier } from "@/utils/security/rateLimiter";
import { requireSameOrigin } from "@/utils/security/requireSameOrigin";

/**
 * POST /api/auth/verify-mobile-login
 *
 * Verifies an SMS sign-in code and returns a short-lived bridge token, which the
 * client exchanges for a session via `signIn("auto-login", { token })` — exactly
 * the flow `verify-login-code` uses for emailed codes. This route does NOT create
 * a session itself.
 *
 * Succeeding also sets `isMobileVerified`: for SMS, logging in IS verifying. The
 * code went to the number already on the account, so returning it proves control
 * of that number — the same proof a dedicated verification step would collect.
 * That is why the ~46k members with an unverified mobile need no backfill campaign.
 */

const schema = z.object({
  mobile: z.string().min(1, "Mobile number is required"),
  code: z.string().length(6, "Sign-in code must be 6 digits"),
});

// Per-IP cap so an attacker cannot brute-force across many numbers, or reset a
// single account's attempt counter by requesting fresh codes. Mirrors
// verify-login-code, whose limits this deliberately matches.
const verifyLimiter = createDistributedRateLimiter("auth-verify-mobile-login", {
  windowMs: 5 * 60 * 1000,
  maxRequests: 10,
});

export async function POST(request: NextRequest) {
  try {
    const csrf = requireSameOrigin(request);
    if (csrf) return csrf;

    const rate = await verifyLimiter.check(
      getClientIdentifier(request.headers.get("x-real-ip"), request.headers.get("x-forwarded-for"))
    );
    if (!rate.success) {
      return NextResponse.json(
        { success: false, error: "Too many attempts. Please wait a moment and try again." },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
      );
    }

    const { mobile, code } = schema.parse(await request.json());

    const e164 = normaliseAuMobile(mobile);
    if (!e164) {
      return NextResponse.json(
        { success: false, error: "Please enter a valid Australian mobile number." },
        { status: 400 }
      );
    }

    await connectDB();
    const user = await User.findOne({ mobile: e164 });

    // One message for "no such number" and "no live code": a wrong guess must not
    // reveal whether the number belongs to an account (see the send route's note
    // on mobile enumeration).
    if (!user || !user.smsOtpHash || !user.smsOtpExpires) {
      return NextResponse.json(
        { success: false, error: "That code isn't valid. Please request a new one." },
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

    // Code is valid. Deactivation is checked only NOW — after proof of control —
    // so account status is never revealed to someone who does not hold the number.
    // Matches verify-login-code; the auto-login provider re-checks as a backstop.
    if (user.isActive === false) {
      return NextResponse.json(
        { success: false, error: "This account has been deactivated. Please contact an administrator." },
        { status: 403 }
      );
    }

    user.smsOtpHash = undefined;
    user.smsOtpExpires = undefined;
    user.smsOtpAttempts = 0;
    user.isMobileVerified = true; // proving control of the number IS verification
    user.lastLogin = new Date();
    await user.save();

    const token = await signJWT({
      sub: user._id.toString(),
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
    });

    try {
      const { ensureUserProfileSynced } = await import("@/utils/integrations/klaviyo/klaviyo-profile-sync");
      ensureUserProfileSynced(user);
    } catch (klaviyoError) {
      console.error("Klaviyo sync after mobile login (non-critical):", klaviyoError);
    }

    return NextResponse.json({
      success: true,
      message: "Signed in successfully",
      token,
      user: { id: user._id, email: user.email, firstName: user.firstName, lastName: user.lastName },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: "Invalid request data" }, { status: 400 });
    }
    console.error("verify-mobile-login error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
