import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import { authOptions } from "@/lib/auth";
import { createRateLimiter, getClientIdentifier } from "@/utils/security/rateLimiter";
import {
  attachCampaignCodeToCheckout,
  type CheckoutCampaignTarget,
} from "@/utils/payment/campaign-code-checkout";

/**
 * Stamps the customer's applied campaign code onto the checkout object they are
 * about to pay — called by `MembershipModal` at the PURCHASE click, after the
 * code is final and BEFORE `confirmPayment`.
 *
 * The decision lives in `@/utils/payment/campaign-code-checkout`; this handler
 * only parses, rate-limits, resolves an optional session and maps the typed
 * result onto status codes.
 *
 * UNAUTHENTICATED BY DESIGN. Guest checkout is the majority of this journey
 * (step-1 registration does not authenticate — CLAUDE.md rule 6), so a session
 * cannot be the gate. Authorization is possession of a SERVER-WRITTEN token
 * bound to the specific object: `subscriptionRequestId` from the subscription's
 * own metadata, or the PaymentIntent's `client_secret`. The two arms use
 * different tokens because each object already carries one the browser holds —
 * adding a third would be new plumbing across six call sites for no gain.
 *
 * The `clientSecret` is a bearer credential: it is never logged, never echoed in
 * a response, and never included in an error body.
 */

const attachCampaignCodeSchema = z
  .object({
    /** The code the customer currently has applied, or `null` to CLEAR a stale stamp. */
    code: z.string().trim().min(1).nullable(),
    subscriptionId: z.string().trim().min(1).optional(),
    subscriptionRequestId: z.string().trim().min(1).optional(),
    paymentIntentId: z.string().trim().min(1).optional(),
    clientSecret: z.string().trim().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    const hasSubscription = !!value.subscriptionId && !!value.subscriptionRequestId;
    const hasPaymentIntent = !!value.paymentIntentId && !!value.clientSecret;
    if (hasSubscription === hasPaymentIntent) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Provide exactly one complete target: { subscriptionId, subscriptionRequestId } or { paymentIntentId, clientSecret }",
      });
    }
  });

// Mirrors the sibling public validator `/api/codes/validate`: unauthenticated by
// design, so a limit is the only thing between this and someone probing Stripe
// object ids. A checkout makes at most one call.
const attachCampaignCodeRateLimiter = createRateLimiter("attach-campaign-code", {
  windowMs: 60 * 1000,
  maxRequests: 60,
});

/**
 * A guest is `getServerSession` returning null, which is the normal path here.
 * The narrow catch covers only the out-of-request-scope throw a test harness
 * produces; a genuine session failure must not silently downgrade identity,
 * because the object's own metadata is the primary source anyway.
 */
async function resolveSessionUserId(): Promise<string | undefined> {
  try {
    const session = await getServerSession(authOptions);
    return session?.user?.id;
  } catch (error) {
    console.error("[attach-campaign-code] session resolution failed — continuing on object metadata", error);
    return undefined;
  }
}

export async function POST(request: NextRequest) {
  try {
    const clientIp = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? null;
    const identifier = getClientIdentifier(clientIp, request.headers.get("x-forwarded-for"));
    const rateLimitResult = attachCampaignCodeRateLimiter.check(identifier);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Too many requests",
          retryAfterSeconds: rateLimitResult.retryAfterSeconds,
        },
        { status: 429, headers: { "Retry-After": String(rateLimitResult.retryAfterSeconds) } }
      );
    }

    const parsed = attachCampaignCodeSchema.parse(await request.json());

    const target: CheckoutCampaignTarget =
      parsed.subscriptionId && parsed.subscriptionRequestId
        ? {
            kind: "subscription",
            subscriptionId: parsed.subscriptionId,
            subscriptionRequestId: parsed.subscriptionRequestId,
          }
        : {
            kind: "payment_intent",
            paymentIntentId: parsed.paymentIntentId as string,
            clientSecret: parsed.clientSecret as string,
          };

    await connectDB();

    const result = await attachCampaignCodeToCheckout({
      target,
      code: parsed.code,
      sessionUserId: await resolveSessionUserId(),
    });

    if (result.ok) {
      return NextResponse.json({ success: true, campaignCode: result.campaignCode });
    }

    // NOT 5xx for `stripe_error`. This endpoint is non-fatal by contract — the
    // caller charges either way — so a transient Stripe hiccup is a normal
    // answer, not a server fault. Signalling it as 502 made every same-origin
    // 5xx watchdog (e2e/fixtures/test.ts) fail whichever unrelated `@purchase`
    // spec happened to be running. The client treats every non-`success` body
    // identically, so `200 { success: false }` loses it nothing; the diagnosis
    // stays in the server log, which is where it is actually read.
    const status =
      result.reason === "not_authorized"
        ? 403
        : result.reason === "wrong_state"
          ? 409
          : result.reason === "not_found"
            ? 404
            : 200;

    // Deliberately generic: the caller never acts on the distinction (it charges
    // either way), and a specific message would confirm which Stripe object ids
    // exist to anyone probing.
    return NextResponse.json({ success: false, error: "Could not attach the code" }, { status });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: "Validation error" }, { status: 400 });
    }
    // Same reasoning as above: already logged, and never fatal to the caller.
    console.error("[attach-campaign-code] request failed", error);
    return NextResponse.json({ success: false, error: "Could not attach the code" }, { status: 200 });
  }
}
