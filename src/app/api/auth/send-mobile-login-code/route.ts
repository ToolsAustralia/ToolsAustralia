import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { sendSms, normaliseAuMobile } from "@/lib/sms";
import { hasEverPaid } from "@/utils/auth/has-ever-paid";
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
 * POST /api/auth/send-mobile-login-code
 *
 * Sends a one-time sign-in code by SMS. The counterpart to the emailed
 * `send-login-code`, and the recovery path for a member whose email is wrong or
 * unverified — they can still read their own texts.
 *
 * SECURITY — the account is resolved BY MOBILE, and the code goes to that same
 * number. The body carries no other identifier, so there is no {account A,
 * deliver to B} pair to manipulate. That is what makes the OTP-redirect takeover
 * class (docs/auth/gotchas.md) structurally impossible here rather than merely
 * guarded against, and it is why the previous `passwordless-login` route — which
 * took `{email, mobile}` — was deleted instead of patched.
 */

const schema = z.object({
  // ONLY the mobile. Do not add an email/userId field: pairing an account
  // identifier with a caller-chosen delivery number is the takeover shape.
  mobile: z.string().min(1, "Mobile number is required"),
});

/**
 * One response for every outcome.
 *
 * Unlike `send-login-code` (which 404s on an unknown email), this route does NOT
 * reveal whether a number has an account. Mobile numbers are enumerable in a way
 * email addresses are not — an attacker can walk `04xxxxxxxx` — so a distinguishable
 * reply here would turn the endpoint into a customer-list oracle. The per-number
 * allowance (3/day) throttles scanning; the uniform reply removes the signal.
 *
 * The copy names the fallback so a genuine non-customer is not left waiting.
 */
const UNIFORM_OK = {
  success: true,
  message: `If that number is on an account, a code is on its way. It expires in ${OTP_EXPIRY_MINUTES} minutes.`,
};

export async function POST(request: NextRequest) {
  try {
    const csrf = requireSameOrigin(request);
    if (csrf) return csrf;

    const body = await request.json();
    const { mobile } = schema.parse(body);

    const e164 = normaliseAuMobile(mobile);
    if (!e164) {
      // A malformed number is a client-side mistake, not an account probe —
      // telling the member the format is wrong reveals nothing.
      return NextResponse.json(
        { success: false, error: "Please enter a valid Australian mobile number." },
        { status: 400 }
      );
    }

    // Rate limit BEFORE the lookup, keyed on the number: an attacker walking the
    // number space is throttled without ever reaching the database.
    const allowance = await claimOtpSendAllowance(e164);
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

    await connectDB();
    const user = await User.findOne({ mobile: e164 }).select(
      "_id firstName isActive processedPayments stripeSubscriptionId oneTimePackages subscription.startDate"
    );

    // Every non-send path below returns UNIFORM_OK and releases the allowance, so
    // neither the response body nor the remaining-attempts count distinguishes a
    // real account from a stranger's number.
    if (!user || user.isActive === false || !hasEverPaid(user)) {
      await allowance.release();
      return NextResponse.json(UNIFORM_OK);
    }

    const code = generateOtpCode();
    user.smsOtpHash = hashOtpCode(code);
    user.smsOtpExpires = getOtpExpiry();
    user.smsOtpAttempts = 0;
    await user.save();

    const sent = await sendSms(
      e164,
      `${code} is your Tools Australia sign-in code. It expires in ${OTP_EXPIRY_MINUTES} minutes.`,
      { reference: "login" }
    );

    if (!sent.success) {
      // Nothing was delivered, so nothing should be charged against the member's
      // 3-a-day. Clear the code too — leaving a live one they never received
      // would just burn their verify attempts.
      await allowance.release();
      user.smsOtpHash = undefined;
      user.smsOtpExpires = undefined;
      await user.save();
      console.error(`send-mobile-login-code: gateway failure — ${sent.error}`);
      return NextResponse.json(
        { success: false, error: "We couldn't send the code right now. Please try again shortly." },
        { status: 502 }
      );
    }

    return NextResponse.json({ ...UNIFORM_OK, remainingToday: allowance.remainingToday });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: "Invalid request data" }, { status: 400 });
    }
    console.error("send-mobile-login-code error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
