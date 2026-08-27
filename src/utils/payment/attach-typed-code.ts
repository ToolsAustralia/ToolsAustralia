/**
 * Writes the customer's typed discount code onto the Stripe object that is about
 * to be charged — the LAST moment before the card is touched, and the only
 * moment at which the code is actually known.
 *
 * WHY THIS MODULE EXISTS. `MembershipModal` pre-warms the checkout object the
 * instant step 2 mounts: the subscription via `create-subscription(-existing-user)`,
 * the one-time pack via `create-payment-intent`. The coupon box lives on that
 * SAME step (`MembershipModal/CouponRow.tsx`, rendered by `PaymentStep.tsx`), so
 * at pre-warm time the customer has had no opportunity to type. The code arrives
 * ~30s later and nothing carried it to Stripe: the PURCHASE handler reuses the
 * pre-warmed object, the webhook reads the metadata, finds nothing, and grants
 * nothing — while the customer saw APPLIED and was charged.
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
 * ALL THREE CODE TYPES, NOT JUST CAMPAIGN. `referralCode` and `promoLinkCode`
 * ride ONLY in a create-subscription body, so on the two doors where the
 * pre-warm means that create call is SKIPPED (`canReuseSubscription`, and the
 * guest `subscriptionCreatedRef` branch) they never left the browser at all —
 * pressing Apply did not rescue them either. The webhook already reads all three
 * off Stripe metadata (`stripe-webhook-handlers/index.ts`: `promoLinkCode` from
 * subscription + PaymentIntent + invoice, `referralCode` from subscription +
 * invoice + PaymentIntent, `campaignCode` from subscription + PaymentIntent), so
 * widening THIS seam delivers them on every door using a proven mechanism
 * instead of a new one.
 *
 * NAMED FOR WHAT IT DOES. This was `campaign-code-checkout` while campaign was
 * the only type it carried. It now carries three, so the name moved with the
 * behaviour — onto `typedCode`, the word this seam's own client half, its slot
 * marker (`metadata.typedCodeSlot`), its slot type (`CheckoutCodeSlot`) and its
 * sibling gate module (`typed-code-at-checkout.ts`) were already using. One
 * concept, one name: the module, the route, the hook method, the ref and the
 * `[typed-code]` log prefix all say the same word. `campaignCode` stays the name
 * of the METADATA KEY and of `CampaignCodeValidationService`, because those two
 * really are campaign-only — renaming them would be the fork this avoids.
 *
 * THE CLIENT SENDS A RAW STRING; THE SERVER CLASSIFIES IT. `code` is whatever
 * the customer typed. This module runs the SAME three-way classification
 * `/api/codes/validate` runs (referral -> promo -> campaign) and validates each
 * leg against an identity resolved from the Stripe object's OWN server-written
 * metadata. That is what makes widening safe: the browser gains no new trust,
 * because it never says which KIND of code it typed.
 *
 * THE INVARIANT. Write the DESIRED state of the typed-code slot onto an object
 * that has NOT yet been paid, after re-verifying server-side that this customer
 * genuinely holds the code. Desired-state (not append-only) is what makes
 * apply A -> decline -> apply B correct: the write must be able to CLEAR a stale
 * stamp, which it does by writing an empty string (every downstream read is a
 * truthiness check, so "" and "key absent" are equally correct).
 *
 * WHICH KEY IS "THE SLOT" is recorded in `metadata.typedCodeSlot`, and that
 * marker is what makes clearing safe now that three keys are in play. Without
 * it, a customer who typed a campaign code would have had their `?promo=`
 * ATTRIBUTION `promoLinkCode` — written at create time by a different writer,
 * for a different purpose — wiped as collateral. The marker means this seam only
 * ever clears a key it wrote itself. A legacy object stamped before the marker
 * existed carries `campaignCode` and no marker, so an absent marker falls back
 * to "campaign", preserving the original clear-on-removal behaviour exactly.
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
import PromoLink from "@/models/PromoLink";
import { validateReferralCodeForUser } from "@/lib/referral";
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
export type TypedCodeCheckoutTarget =
  | { kind: "subscription"; subscriptionId: string; subscriptionRequestId: string }
  | { kind: "payment_intent"; paymentIntentId: string; clientSecret: string };

/**
 * Which metadata key the typed code landed in. Mirrors `/api/codes/validate`'s
 * discriminated `type` exactly, so the browser's optimistic classification and
 * the server's authoritative one are the same three words.
 */
export type CheckoutCodeSlot = "referral" | "promo" | "campaign";

/** The metadata key each slot writes into — the keys the webhook already reads. */
const SLOT_METADATA_KEY: Record<CheckoutCodeSlot, string> = {
  referral: "referralCode",
  promo: "promoLinkCode",
  campaign: "campaignCode",
};

/** Records which key THIS seam owns, so clearing never touches another writer's. */
const TYPED_CODE_SLOT_KEY = "typedCodeSlot";

export type AttachTypedCodeResult =
  | {
      ok: true;
      /** The canonical code written, or `null` when nothing was (or it was cleared). */
      code: string | null;
      /** Which slot it landed in, or `null` when nothing was written. */
      slot: CheckoutCodeSlot | null;
    }
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

/**
 * The customer's email as the SERVER wrote it onto the checkout object. Used by
 * the referral leg, which keys on invitee identity; `"guest"` is the literal
 * placeholder both create paths write when there is no account yet.
 */
function resolveOwnerEmail(metadata: Stripe.Metadata | null | undefined): string | undefined {
  const email = metadataString(metadata, "userEmail");
  return email && email !== "guest" ? email.toLowerCase() : undefined;
}

/**
 * WHAT KIND OF CODE IS THIS? — run server-side, in the same order and with the
 * same rules as `/api/codes/validate`: referral, then promo-link, then campaign.
 *
 * The browser sends only the raw string it was typed as, so this is the ONLY
 * classification that decides anything. Each leg validates before it claims the
 * code:
 *
 *  - REFERRAL — `validateReferralCodeForUser` against the invitee identity the
 *    SERVER resolved (self-referral, an already-running referral for a different
 *    code, and an unknown code all throw). Without a resolved identity the
 *    referral leg is skipped entirely rather than guessed at: the webhook keys
 *    the grant on the invitee, so an unattributable referral is a stamp that
 *    could only fail later.
 *  - PROMO — the live `PromoLink` row, expiry included. Note this is STRICTER
 *    than the create routes, which stamp `promoLinkCode` from the request body
 *    with no check at all.
 *  - CAMPAIGN — `resolveCodeForCheckout`, the authoritative per-user gate that
 *    already fails closed and logs on its own.
 *
 * Never throws: every leg's failure is "not this type", and a total failure is
 * `null`, which the caller writes as "no code". The caller charges either way.
 */
async function classifyCheckoutCode(params: {
  code: string;
  userId?: string;
  email?: string;
  context: string;
}): Promise<{ slot: CheckoutCodeSlot; code: string } | null> {
  const code = params.code.trim().toUpperCase();
  if (!code) return null;

  if (params.userId || params.email) {
    try {
      await validateReferralCodeForUser({
        referralCode: code,
        inviteeUserId: params.userId,
        inviteeEmail: params.email,
      });
      return { slot: "referral", code };
    } catch {
      // Not a referral code, or not one this customer may use. Fall through.
    }
  }

  try {
    const promoLink = await PromoLink.findActiveByCode(code);
    if (promoLink && !promoLink.isExpired()) {
      return { slot: "promo", code: promoLink.code };
    }
  } catch (error) {
    // FAIL CLOSED on this leg only — an unreadable PromoLink must not become a
    // promo stamp nothing later validates. The campaign leg still gets its turn.
    console.error("[typed-code] promo-link lookup failed at checkout", {
      context: params.context,
      code,
      error,
    });
  }

  const campaignCode = await CampaignCodeValidationService.resolveCodeForCheckout({
    code,
    userId: params.userId,
    context: params.context,
  });
  return campaignCode ? { slot: "campaign", code: campaignCode } : null;
}

/**
 * The slot this seam last wrote, so the desired-state write clears its OWN key
 * and never another writer's.
 *
 * The legacy fallback is load-bearing. Objects stamped before the marker existed
 * carry `campaignCode` and no marker; reading them as slot-less would break
 * "apply A -> card declines -> remove A -> retry", which is the whole reason the
 * write is desired-state. `promoLinkCode` gets NO such fallback on purpose — it
 * is routinely written at create time from `?promo=` attribution by a different
 * writer, and treating that as ours would clear a live attribution link the
 * customer never touched.
 */
function previousSlotOf(metadata: Stripe.Metadata | null | undefined): CheckoutCodeSlot | undefined {
  const marked = metadataString(metadata, TYPED_CODE_SLOT_KEY);
  if (marked === "referral" || marked === "promo" || marked === "campaign") return marked;
  if (marked) return undefined;
  return metadataString(metadata, SLOT_METADATA_KEY.campaign) ? "campaign" : undefined;
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
 * Classify the RAW typed `code` server-side, re-verify it against the customer
 * this checkout object belongs to, and write the answer into the matching
 * metadata key (`referralCode` / `promoLinkCode` / `campaignCode`).
 *
 * Never throws. Every failure is a typed result, because the caller's contract
 * is "take the payment either way": a bonus-code lookup that times out is not a
 * reason to refuse a membership sale, and a genuine holder keeps the unspent
 * issuance in their rewards wallet where they can claim it themselves.
 *
 * @param params.code the RAW string the customer typed, or `null` to CLEAR. It is
 *   never trusted as a classification — this module decides the kind.
 * @param params.sessionUserId last-resort identity only; never preferred over the
 *   object's own server-written metadata.
 */
export async function attachTypedCodeToCheckout(params: {
  target: TypedCodeCheckoutTarget;
  code: string | null;
  sessionUserId?: string;
}): Promise<AttachTypedCodeResult> {
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
      console.error("[typed-code] attach refused — possession proof did not match", {
        kind: target.kind,
        objectId,
      });
      return { ok: false, reason: "not_authorized" };
    }

    if (!stateOk) {
      console.error("[typed-code] attach refused — object is not an unpaid checkout", {
        kind: target.kind,
        objectId,
        state: observedState,
      });
      return { ok: false, reason: "wrong_state" };
    }

    // 4. IDENTITY, from the object's own metadata.
    const userId = await resolveOwnerUserId(metadata, sessionUserId);

    // 5. CLASSIFY + RE-VERIFY. The browser sent a raw string and said nothing
    //    about its kind, so this is where referral / promo / campaign is decided —
    //    against the identity resolved in step 4 from the object's own metadata,
    //    never from the request.
    const resolved = code
      ? await classifyCheckoutCode({
          code,
          userId,
          email: resolveOwnerEmail(metadata),
          context: `attach-typed-code:${target.kind}`,
        })
      : null;

    // 6. RECORD THE INTENT ON OUR SIDE, BEFORE Stripe. The Stripe update below is
    //    the slow half — two round trips on a cold lambda — and it is what the
    //    browser's 15s cap gives up on. Once it does, the client reports
    //    "unknown" and charges anyway, and if the write had not landed the
    //    customer pays with nothing to recover from: Stripe metadata was the ONLY
    //    record. Writing here means the server's own knowledge survives the
    //    client hanging up, and `checkAndRedeemCampaign` can finish the job off
    //    the paid webhook. A non-campaign answer (or none) CLEARS it, so removing
    //    a code — or replacing it with a referral code — is honoured by the
    //    fallback exactly as it is by the stamp.
    //    Never throws; a failure only costs us the recovery, never the sale.
    const verifiedCampaignCode = resolved?.slot === "campaign" ? resolved.code : null;
    await CampaignCodeValidationService.recordCheckoutIntent({
      userId,
      campaignCode: verifiedCampaignCode,
      targetId: objectId,
    });

    // 7. WRITE THE DESIRED STATE. The full spread is NON-NEGOTIABLE: these update
    //    calls take a metadata MAP, so a partial payload would destroy the
    //    packageId the webhook looks the package up by, the CAPI match keys, the
    //    A/B assignment and the attribution — on an object the customer is about
    //    to be charged on. Both existing writers spread the same way
    //    (`create-one-time-purchase/route.ts`, `stripe-webhook-handlers/index.ts`).
    //
    //    Only the slot THIS seam owns moves. The previous slot is cleared when it
    //    is a different one, so "type a referral code, then replace it with a
    //    campaign code" cannot leave the customer holding both — and a
    //    `promoLinkCode` written at create time from `?promo=` attribution is
    //    never touched, because the marker says it was not ours.
    const previousSlot = previousSlotOf(metadata);
    const nextMetadata: Stripe.MetadataParam = { ...(metadata ?? {}) };
    if (previousSlot && previousSlot !== resolved?.slot) {
      nextMetadata[SLOT_METADATA_KEY[previousSlot]] = "";
    }
    if (resolved) {
      nextMetadata[SLOT_METADATA_KEY[resolved.slot]] = resolved.code;
    }
    nextMetadata[TYPED_CODE_SLOT_KEY] = resolved?.slot ?? "";

    if (target.kind === "subscription") {
      await stripe.subscriptions.update(target.subscriptionId, { metadata: nextMetadata });
    } else {
      await stripe.paymentIntents.update(target.paymentIntentId, { metadata: nextMetadata });
    }

    return { ok: true, code: resolved?.code ?? null, slot: resolved?.slot ?? null };
  } catch (error) {
    const stripeCode = (error as { code?: string } | null)?.code;
    if (stripeCode === "resource_missing") {
      console.error("[typed-code] attach refused — Stripe has no such checkout object", {
        kind: target.kind,
      });
      return { ok: false, reason: "not_found" };
    }
    console.error("[typed-code] attach failed at the Stripe boundary", {
      kind: target.kind,
      hasCode: !!code,
      error,
    });
    return { ok: false, reason: "stripe_error" };
  }
}
