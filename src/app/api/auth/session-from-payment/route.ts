import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { stripe } from "@/lib/stripe";
import { signAutoLoginToken } from "@/lib/jwt";
import { requireSameOrigin } from "@/utils/security/requireSameOrigin";
import { createDistributedRateLimiter, getClientIdentifier } from "@/utils/security/rateLimiter";

/**
 * POST /api/auth/session-from-payment
 *
 * Mints a sign-in bridge token from **proof of payment alone** — the caller
 * asserts no identity at all.
 *
 * WHY THIS EXISTS: a 3DS/SCA buyer completes payment and lands on
 * `/checkout/success` via Stripe's redirect, having lost all in-page React state
 * (including the `guestUserData` bridge). No success landing page could sign them
 * in, so they finished paying and stayed logged OUT — never reaching the profile
 * setup step, never setting a password, never verifying anything. They are the
 * cohort that becomes locked out later.
 *
 * HOW IT IS SAFE — and stricter than `/api/auth/auto-login`, which it is intended
 * to replace:
 *   • `auto-login` takes `{userId, email, paymentIntentId}` and checks the PI
 *     belongs to that user. Identity comes from the CLIENT and is merely
 *     cross-checked.
 *   • This route takes **only the client secret** Stripe put in the redirect URL,
 *     and derives the user FROM the PaymentIntent's customer. The client cannot
 *     name an account at all.
 *   • It asserts `status === "succeeded"`. `auto-login` never did — combined with
 *     `create-one-time-purchase` returning `autoLogin: true` on a
 *     `requires_action` intent, a session could be minted before the money landed.
 *
 * The client secret is the credential. Stripe returns it only to the payer, it is
 * unguessable, and we compare it against the value Stripe holds — possession
 * proves they are the person who completed this payment.
 *
 * SCOPE NOTE: this currently serves the redirect landings. The three in-modal
 * `MembershipModal` call sites still use `auto-login`; migrating them is a
 * mechanical follow-up, deliberately NOT bundled here so that a fault in this new
 * route cannot break the purchase path that already works. Once this has run in
 * production, delete `auto-login` and point all four at this.
 */

const schema = z.object({
  paymentIntentClientSecret: z.string().min(1, "Client secret is required"),
});

// Modest per-IP cap. The secret is unguessable, so this is anti-hammering rather
// than a security boundary — and it must stay loose enough for the retry loop the
// webhook race requires.
const limiter = createDistributedRateLimiter("auth-session-from-payment", {
  windowMs: 5 * 60 * 1000,
  maxRequests: 30,
});

export async function POST(request: NextRequest) {
  try {
    const csrf = requireSameOrigin(request);
    if (csrf) return csrf;

    const rate = await limiter.check(
      getClientIdentifier(request.headers.get("x-real-ip"), request.headers.get("x-forwarded-for"))
    );
    if (!rate.success) {
      return NextResponse.json(
        { success: false, error: "Too many attempts. Please wait a moment." },
        { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } }
      );
    }

    const { paymentIntentClientSecret } = schema.parse(await request.json());

    // Stripe's client secret is `{pi_id}_secret_{random}`.
    const paymentIntentId = paymentIntentClientSecret.split("_secret_")[0];
    if (!paymentIntentId.startsWith("pi_")) {
      return NextResponse.json({ success: false, error: "Invalid payment reference" }, { status: 400 });
    }

    let paymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    } catch {
      return NextResponse.json({ success: false, error: "Invalid payment reference" }, { status: 403 });
    }

    // Proof of possession: only the payer ever receives this value.
    if (paymentIntent.client_secret !== paymentIntentClientSecret) {
      return NextResponse.json({ success: false, error: "Invalid payment reference" }, { status: 403 });
    }

    // Money must actually have landed. `processing` and `requires_action` are NOT
    // enough — this is the check `auto-login` was missing.
    if (paymentIntent.status !== "succeeded") {
      return NextResponse.json(
        { success: false, error: "Payment is not complete.", paymentStatus: paymentIntent.status },
        { status: 409 }
      );
    }

    const customerId =
      typeof paymentIntent.customer === "string" ? paymentIntent.customer : paymentIntent.customer?.id;
    if (!customerId) {
      return NextResponse.json(
        { success: false, error: "This payment is not linked to an account." },
        { status: 409 }
      );
    }

    await connectDB();
    const user = await User.findOne({ stripeCustomerId: customerId });

    if (!user) {
      // The webhook creates the account for a one-time buyer who never registered,
      // so right after checkout there may be nothing to sign in to yet. Tell the
      // client to retry rather than failing them — they HAVE paid.
      return NextResponse.json(
        { success: false, pending: true, error: "Your account is still being set up." },
        { status: 202 }
      );
    }

    if (user.isActive === false) {
      return NextResponse.json(
        { success: false, error: "This account has been deactivated. Please contact an administrator." },
        { status: 403 }
      );
    }

    user.lastLogin = new Date();
    await user.save();

    const token = await signAutoLoginToken(user);

    return NextResponse.json({
      success: true,
      token,
      user: { id: user._id, email: user.email, firstName: user.firstName, lastName: user.lastName },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: "Invalid request data" }, { status: 400 });
    }
    console.error("session-from-payment error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
