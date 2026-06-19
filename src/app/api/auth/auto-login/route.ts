import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { stripe } from "@/lib/stripe";
import { signAutoLoginToken } from "@/lib/jwt";
import { requireSameOrigin } from "@/utils/security/requireSameOrigin";
import { createDistributedRateLimiter, getClientIdentifier } from "@/utils/security/rateLimiter";

const autoLoginSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  email: z.string().email("Invalid email address"),
  // Proof of a completed payment. Required: identity must NOT be taken on trust
  // from {userId,email} alone (both are non-secret). See the security note below.
  paymentIntentId: z.string().min(1, "paymentIntentId is required"),
});

const autoLoginRateLimiter = createDistributedRateLimiter("auth-auto-login", {
  windowMs: 5 * 60 * 1000,
  maxRequests: 10,
});

/**
 * POST /api/auth/auto-login
 * Establish a session for a user immediately after a server-verifiable payment.
 *
 * SECURITY: this route previously minted a 30-day session from `{userId, email}`
 * plus the user merely having a `stripeCustomerId` — both non-secret, so anyone
 * who knew a past customer's email + ObjectId could take over their account. It
 * now requires a Stripe `paymentIntentId` that belongs to this user's Stripe
 * customer: proof the caller actually completed the payment (an attacker cannot
 * obtain a victim's PaymentIntent id). The email-verification login flow no longer
 * uses this route — it receives its bridge token from `/api/auth/verify-email`.
 */
export async function POST(request: NextRequest) {
  try {
    const csrf = requireSameOrigin(request);
    if (csrf) return csrf;

    const identifier = getClientIdentifier(
      request.headers.get("x-real-ip"),
      request.headers.get("x-forwarded-for")
    );
    const rateCheck = await autoLoginRateLimiter.check(identifier);
    if (!rateCheck.success) {
      return NextResponse.json(
        { success: false, error: "Too many attempts. Please wait a moment and try again." },
        { status: 429, headers: { "Retry-After": rateCheck.retryAfterSeconds.toString() } }
      );
    }

    const body = await request.json();
    const { userId, email, paymentIntentId } = autoLoginSchema.parse(body);

    await connectDB();

    const user = await User.findById(userId);
    if (!user || user.email !== email) {
      return NextResponse.json(
        { success: false, error: "User not found or email mismatch" },
        { status: 404 }
      );
    }

    // Proof of possession: the PaymentIntent must belong to this user's Stripe
    // customer. Knowing the (non-secret) userId + email is not enough.
    if (!user.stripeCustomerId) {
      return NextResponse.json(
        { success: false, error: "No payment on file for this user" },
        { status: 403 }
      );
    }

    let paymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    } catch {
      return NextResponse.json({ success: false, error: "Invalid payment reference" }, { status: 403 });
    }

    const piCustomerId =
      typeof paymentIntent.customer === "string" ? paymentIntent.customer : paymentIntent.customer?.id;
    if (!piCustomerId || piCustomerId !== user.stripeCustomerId) {
      return NextResponse.json(
        { success: false, error: "Payment does not belong to this user" },
        { status: 403 }
      );
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Keep Klaviyo profile fresh (non-critical)
    try {
      const { ensureUserProfileSynced } = await import("@/utils/integrations/klaviyo/klaviyo-profile-sync");
      ensureUserProfileSynced(user);
    } catch (klaviyoError) {
      console.error("Klaviyo import/update error (non-critical):", klaviyoError);
    }

    const token = await signAutoLoginToken(user);

    return NextResponse.json({
      success: true,
      message: "Auto-login successful",
      token,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isMobileVerified: user.isMobileVerified,
        hasActiveMembership: Boolean(
          user.subscription?.isActive ||
            user.oneTimePackages?.some((pkg: { isActive: boolean }) => pkg.isActive) ||
            (user.oneTimePackages && user.oneTimePackages.length > 0) ||
            user.stripeCustomerId
        ),
      },
    });
  } catch (error) {
    console.error("❌ Auto-login error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Invalid request data", details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
