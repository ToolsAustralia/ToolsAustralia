import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { stripe } from "@/lib/stripe";
import { requireSameOrigin } from "@/utils/security/requireSameOrigin";
import { createDistributedRateLimiter, getClientIdentifier } from "@/utils/security/rateLimiter";

/**
 * POST /api/stripe/cancel-payment-intent
 * Cancel an abandoned PaymentIntent (best-effort cleanup when the membership modal closes
 * before payment). Prevents an orphaned intent from later charging the customer.
 *
 * ── AUTHORIZATION: client_secret, not session ────────────────────────────────
 * This endpoint deliberately does NOT require a logged-in session. `create-payment-intent`
 * gates on `if (session?.user?.id)` — a CONDITIONAL, not a requirement — so guests
 * legitimately hold PaymentIntents (registration does not auto-login in this codebase; a
 * step-1 guest bridges to step 2 via `guestUserData`). Requiring a session here would break
 * cleanup for exactly the users most likely to abandon a payment.
 *
 * Ownership is instead proven with the intent's `client_secret`, which is Stripe's own
 * capability token for a PaymentIntent — it is what the browser uses to confirm the payment,
 * it is only ever handed to the client that created the intent, and it is not derivable from
 * the `pi_...` id. Verified with a length-safe constant-time compare so the endpoint cannot
 * be used as an oracle to brute-force a secret.
 *
 * Previously this route accepted a bare `paymentIntentId` from an unauthenticated body and
 * cancelled it — meaning anyone who obtained or guessed an id (they are exposed to the
 * browser during checkout) could cancel another member's in-flight payment.
 */

const cancelPaymentIntentSchema = z.object({
  paymentIntentId: z.string().regex(/^pi_/, "Invalid PaymentIntent ID"),
  // Stripe's own capability token for the intent. Proves the caller is the client the
  // intent was minted for — see the authorization note above.
  clientSecret: z.string().min(1, "client_secret is required"),
});

/**
 * Guards the unauthenticated surface, mirroring `POST /api/auth/auto-login` — the repo's
 * existing precedent for a state-changing Stripe route with no session. Bounds any attempt
 * to grind client_secrets, and is per-IP because there is no user to key on.
 */
const cancelPaymentIntentRateLimiter = createDistributedRateLimiter("stripe-cancel-payment-intent", {
  windowMs: 5 * 60 * 1000,
  maxRequests: 20,
});

/** Timing-safe string compare that does not leak length via early return. */
function secretsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** States where cancelling is meaningful. `succeeded` is intentionally absent. */
const CANCELLABLE_STATES = new Set([
  "requires_payment_method",
  "requires_confirmation",
  "requires_action",
  "requires_capture",
]);

export async function POST(request: NextRequest) {
  try {
    const csrf = requireSameOrigin(request);
    if (csrf) return csrf;

    const identifier = getClientIdentifier(
      request.headers.get("x-real-ip"),
      request.headers.get("x-forwarded-for")
    );
    const rateCheck = await cancelPaymentIntentRateLimiter.check(identifier);
    if (!rateCheck.success) {
      return NextResponse.json(
        { success: false, error: "Too many attempts. Please wait a moment and try again." },
        { status: 429, headers: { "Retry-After": rateCheck.retryAfterSeconds.toString() } }
      );
    }

    const parsed = cancelPaymentIntentSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid request data", details: parsed.error.issues },
        { status: 400 }
      );
    }
    const { paymentIntentId, clientSecret } = parsed.data;

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    // Ownership gate. Deliberately returns the SAME 403 shape whether the intent is missing
    // its secret or the secret simply doesn't match — never reveal which.
    if (!paymentIntent.client_secret || !secretsMatch(paymentIntent.client_secret, clientSecret)) {
      console.error(
        `[cancel-payment-intent] Rejected cancel for ${paymentIntentId} — client_secret mismatch`
      );
      return NextResponse.json({ success: false, error: "Not authorized" }, { status: 403 });
    }

    if (paymentIntent.status === "succeeded") {
      console.error(
        `[cancel-payment-intent] Refused: ${paymentIntentId} already succeeded (possible double-charge attempt)`
      );
      return NextResponse.json(
        { success: false, error: "PaymentIntent already succeeded - cannot cancel", status: paymentIntent.status },
        { status: 400 }
      );
    }

    if (paymentIntent.status === "canceled") {
      return NextResponse.json({
        success: true,
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status,
        message: "Already cancelled",
      });
    }

    if (!CANCELLABLE_STATES.has(paymentIntent.status)) {
      // e.g. `processing` — leave it alone; Stripe will resolve it.
      return NextResponse.json({
        success: true,
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status,
        message: "No action needed",
      });
    }

    try {
      const cancelled = await stripe.paymentIntents.cancel(paymentIntentId);
      return NextResponse.json({
        success: true,
        paymentIntentId: cancelled.id,
        status: cancelled.status,
      });
    } catch (cancelError: unknown) {
      // Race: another request (or a second modal close) cancelled it first.
      const err = cancelError as { code?: string };
      if (err?.code === "payment_intent_unexpected_state") {
        const refreshed = await stripe.paymentIntents.retrieve(paymentIntentId);
        if (refreshed.status === "canceled") {
          return NextResponse.json({
            success: true,
            paymentIntentId,
            status: "canceled",
            message: "Already cancelled by another request",
          });
        }
      }
      throw cancelError;
    }
  } catch (error) {
    console.error("[cancel-payment-intent] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to cancel PaymentIntent" },
      { status: 500 }
    );
  }
}
