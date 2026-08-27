/**
 * Writes the customer's applied campaign code onto the Stripe object that is
 * about to be charged — the LAST moment before the card is touched, and the
 * only moment at which the code is actually known.
 *
 * WHY THIS MODULE EXISTS. `MembershipModal` pre-warms the checkout object the
 * instant step 2 mounts: the subscription via `create-subscription(-existing-user)`,
 * the one-time pack via `create-payment-intent`. The coupon box lives on that
 * SAME step (`MembershipModal/CouponRow.tsx`, rendered by `PaymentStep.tsx`), so
 * at pre-warm time the customer has had no opportunity to type. The code arrives
 * ~30s later and nothing carried it to Stripe: the PURCHASE handler reuses the
 * pre-warmed object, the webhook reads `metadata.campaignCode`, finds nothing,
 * and grants nothing — while the customer saw APPLIED and was charged.
 *
 * The one-time leg failed differently and worse: `create-one-time-purchase`
 * DOES resolve the code, but patches the PaymentIntent metadata AFTER the
 * browser confirmed it, so it raced `handlePaymentSuccess`'s fresh retrieve
 * (`stripe-webhook-handlers/index.ts` — "Retrieve fresh PaymentIntent") and lost
 * most, but not all, of the time. A race in a money path is worse than a
 * deterministic bug: it looks green in some test runs. And under
 * `redirect: "if_required"`, any confirm that navigates the browser away means
 * that post-confirm patch never runs at all.
 *
 * THE INVARIANT. Write the DESIRED state of `campaignCode` onto an object that
 * has NOT yet been paid, after re-verifying server-side that this customer
 * genuinely holds the code. Desired-state (not append-only) is what makes
 * apply A -> decline -> apply B correct: the write must be able to CLEAR a stale
 * stamp, which it does by writing an empty string (every downstream read is a
 * truthiness check, so "" and "key absent" are equally correct).
 *
 * WHAT THIS IS NOT. It never creates, cancels, re-times or re-prices anything.
 * The only Stripe mutation is `metadata`, which `docs/PAST_DUE_REANCHOR.md`'s
 * pre-flight checklist (item 2) names explicitly as spawning **no** new paid
 * invoice — so the duplicate-`invoice.payment_succeeded` footgun is not engaged.
 */
import mongoose from "mongoose";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import User from "@/models/User";
import { CampaignCodeValidationService } from "@/services/redeemables/CampaignCodeValidationService";

/**
 * The checkout object to stamp, plus the proof the caller legitimately holds it.
 *
 * WHY TWO DIFFERENT PROOFS. This runs for GUEST checkout, so it cannot be gated
 * on a session. Each object already carries a natural, SERVER-WRITTEN token the
 * browser provably holds, and neither needs new plumbing: a subscription's
 * `metadata.subscriptionRequestId` is written by both create routes and
 * persisted in the modal's checkout sessionStorage blob; a PaymentIntent's
 * `client_secret` is a first-class Stripe field the modal already holds. Without
 * a proof this is an IDOR — and the nastier direction is not writing a code, it
 * is clearing a stranger's code so they pay and receive nothing.
 */
export type CheckoutCampaignTarget =
  | { kind: "subscription"; subscriptionId: string; subscriptionRequestId: string }
  | { kind: "payment_intent"; paymentIntentId: string; clientSecret: string };

export type AttachCampaignCodeResult =
  | { ok: true; campaignCode: string | null }
  | { ok: false; reason: "not_found" | "not_authorized" | "wrong_state" | "stripe_error" };

/**
 * Subscription statuses that still mean "the first invoice has not been paid".
 *
 * `incomplete` is the plain `payment_behavior: "default_incomplete"` case. But on
 * the anchor days (AEST 25/26/27 — `anchor-billing.ts` `ANCHOR_JOIN_DAYS`) both
 * create routes also send `trial_end`, and Stripe will NOT hold a trialing
 * subscription at `incomplete`; the up-front charge arrives as an
 * `add_invoice_items` line on an OPEN invoice while the subscription itself
 * reads `trialing` (`docs/BILLING_ANCHOR_24.md`: "subscription status is
 * `trialing` until the 24th"). Accepting only `incomplete` would make this whole
 * fix a silent no-op for every signup on three days of every month.
 *
 * The paid/unpaid invariant is NOT weakened by that: both statuses are paired
 * with a mandatory `latest_invoice.status !== "paid"` check below, so a
 * subscription that has already been charged is refused either way.
 */
const UNPAID_SUBSCRIPTION_STATUSES: ReadonlySet<string> = new Set(["incomplete", "trialing"]);

/** PaymentIntent statuses that still mean "the card has not been charged". */
const UNPAID_PAYMENT_INTENT_STATUSES: ReadonlySet<string> = new Set([
  "requires_payment_method",
  "requires_confirmation",
  "requires_action",
]);

/** Metadata `userId` placeholders written for a customer with no account row yet. */
const NON_IDENTITY_USER_IDS: ReadonlySet<string> = new Set(["guest", "new", ""]);

function metadataString(metadata: Stripe.Metadata | null | undefined, key: string): string | undefined {
  const value = metadata?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

/**
 * The customer this checkout belongs to, resolved ONLY from what the server
 * itself wrote onto the Stripe object. The request body is never an identity
 * claim — `resolveCodeForCheckout` is only a real gate because the user id it
 * checks against was not supplied by the caller.
 *
 * `undefined` is a legitimate answer (a code applied by someone with no account
 * can never redeem); the validator turns that into a refusal, not a throw.
 */
async function resolveOwnerUserId(
  metadata: Stripe.Metadata | null | undefined,
  sessionUserId?: string
): Promise<string | undefined> {
  const metadataUserId = metadataString(metadata, "userId");
  if (
    metadataUserId &&
    !NON_IDENTITY_USER_IDS.has(metadataUserId) &&
    mongoose.Types.ObjectId.isValid(metadataUserId)
  ) {
    return metadataUserId;
  }

  const metadataEmail = metadataString(metadata, "userEmail");
  if (metadataEmail && metadataEmail !== "guest") {
    const user = await User.findOne({ email: metadataEmail.toLowerCase() })
      .select("_id")
      .lean<{ _id: unknown } | null>();
    if (user?._id) return String(user._id);
  }

  return sessionUserId && mongoose.Types.ObjectId.isValid(sessionUserId) ? sessionUserId : undefined;
}

/** `latest_invoice` comes back expanded; a bare id or a paid invoice both fail the guard. */
function subscriptionInvoiceIsUnpaid(subscription: Stripe.Subscription): boolean {
  const invoice = subscription.latest_invoice;
  if (!invoice || typeof invoice === "string") return false;
  return invoice.status !== "paid";
}

/** For the refusal log line only — never carries the possession proof. */
function describeSubscriptionState(subscription: Stripe.Subscription): string {
  const invoice = subscription.latest_invoice;
  const invoiceState = invoice && typeof invoice !== "string" ? (invoice.status ?? "unknown") : "no-invoice";
  return `${subscription.status}/${invoiceState}`;
}

/**
 * Re-verify `code` against the customer this checkout object belongs to, then
 * write the answer into the object's `campaignCode` metadata.
 *
 * Never throws. Every failure is a typed result, because the caller's contract
 * is "take the payment either way": a bonus-code lookup that times out is not a
 * reason to refuse a membership sale, and a genuine holder keeps the unspent
 * issuance in their rewards wallet where they can claim it themselves.
 *
 * @param params.code the code the customer currently has applied, or `null` to CLEAR.
 * @param params.sessionUserId last-resort identity only; never preferred over the
 *   object's own server-written metadata.
 */
export async function attachCampaignCodeToCheckout(params: {
  target: CheckoutCampaignTarget;
  code: string | null;
  sessionUserId?: string;
}): Promise<AttachCampaignCodeResult> {
  const { target, code, sessionUserId } = params;

  try {
    // 1. RETRIEVE. Everything below is decided from Stripe's copy of the object,
    //    never from the request body.
    let objectId: string;
    let metadata: Stripe.Metadata | null | undefined;
    let authorized: boolean;
    let stateOk: boolean;
    let observedState: string;

    if (target.kind === "subscription") {
      objectId = target.subscriptionId;
      const subscription = await stripe.subscriptions.retrieve(target.subscriptionId, {
        expand: ["latest_invoice"],
      });
      metadata = subscription.metadata;
      // 2. AUTHORIZE — possession of the id the SERVER minted for this checkout.
      const expected = metadataString(subscription.metadata, "subscriptionRequestId");
      authorized = !!expected && expected === target.subscriptionRequestId;
      // 3. STATE — the object must not already have been paid.
      stateOk =
        UNPAID_SUBSCRIPTION_STATUSES.has(subscription.status) && subscriptionInvoiceIsUnpaid(subscription);
      observedState = describeSubscriptionState(subscription);
    } else {
      objectId = target.paymentIntentId;
      const paymentIntent = await stripe.paymentIntents.retrieve(target.paymentIntentId);
      metadata = paymentIntent.metadata;
      authorized =
        typeof paymentIntent.client_secret === "string" &&
        paymentIntent.client_secret.length > 0 &&
        paymentIntent.client_secret === target.clientSecret;
      stateOk = UNPAID_PAYMENT_INTENT_STATUSES.has(paymentIntent.status);
      observedState = paymentIntent.status;
    }

    if (!authorized) {
      // NEVER log the proof itself — a client_secret in a log is a charge anyone
      // holding that log can confirm.
      console.error("[campaign-code] attach refused — possession proof did not match", {
        kind: target.kind,
        objectId,
      });
      return { ok: false, reason: "not_authorized" };
    }

    if (!stateOk) {
      console.error("[campaign-code] attach refused — object is not an unpaid checkout", {
        kind: target.kind,
        objectId,
        state: observedState,
      });
      return { ok: false, reason: "wrong_state" };
    }

    // 4. IDENTITY, from the object's own metadata.
    const userId = await resolveOwnerUserId(metadata, sessionUserId);

    // 5. RE-VERIFY. Called verbatim — this service is the authoritative gate and
    //    already fails closed and logs on its own.
    const verified = await CampaignCodeValidationService.resolveCodeForCheckout({
      code,
      userId,
      context: `attach-campaign-code:${target.kind}`,
    });

    // 6. RECORD THE INTENT ON OUR SIDE, BEFORE Stripe. The Stripe update below is
    //    the slow half — two round trips on a cold lambda — and it is what the
    //    browser's 15s cap gives up on. Once it does, the client reports
    //    "unknown" and charges anyway, and if the write had not landed the
    //    customer pays with nothing to recover from: Stripe metadata was the ONLY
    //    record. Writing here means the server's own knowledge survives the
    //    client hanging up, and `checkAndRedeemCampaign` can finish the job off
    //    the paid webhook. `verified` being undefined CLEARS it, so removing a
    //    code is honoured by the fallback exactly as it is by the stamp.
    //    Never throws; a failure only costs us the recovery, never the sale.
    await CampaignCodeValidationService.recordCheckoutIntent({
      userId,
      campaignCode: verified ?? null,
      targetId: objectId,
    });

    // 7. WRITE THE DESIRED STATE. The full spread is NON-NEGOTIABLE: these update
    //    calls take a metadata MAP, so a partial payload would destroy the
    //    packageId the webhook looks the package up by, the CAPI match keys, the
    //    A/B assignment and the attribution — on an object the customer is about
    //    to be charged on. Both existing writers spread the same way
    //    (`create-one-time-purchase/route.ts`, `stripe-webhook-handlers/index.ts`).
    const nextMetadata: Stripe.MetadataParam = { ...(metadata ?? {}), campaignCode: verified ?? "" };

    if (target.kind === "subscription") {
      await stripe.subscriptions.update(target.subscriptionId, { metadata: nextMetadata });
    } else {
      await stripe.paymentIntents.update(target.paymentIntentId, { metadata: nextMetadata });
    }

    return { ok: true, campaignCode: verified ?? null };
  } catch (error) {
    const stripeCode = (error as { code?: string } | null)?.code;
    if (stripeCode === "resource_missing") {
      console.error("[campaign-code] attach refused — Stripe has no such checkout object", {
        kind: target.kind,
      });
      return { ok: false, reason: "not_found" };
    }
    console.error("[campaign-code] attach failed at the Stripe boundary", {
      kind: target.kind,
      hasCode: !!code,
      error,
    });
    return { ok: false, reason: "stripe_error" };
  }
}
