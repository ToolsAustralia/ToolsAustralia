/**
 * Resolve the ONE PaymentIntent that a one-time pack purchase is allowed to charge.
 *
 * WHY THIS EXISTS (production bug, 2026-09-04)
 * -------------------------------------------
 * A one-time pack checkout has TWO places that can move money:
 *
 *   1. `/api/stripe/create-payment-intent` mints an upfront PaymentIntent so Apple Pay /
 *      Google Pay can display the correct amount. The BROWSER confirms it — that is a real
 *      charge, not a dry run.
 *   2. The purchase route (`create-one-time-purchase[-existing-user]`) creates its own
 *      PaymentIntent with `confirm: true`.
 *
 * If step 2 runs without being told about step 1, the member is charged TWICE, and the
 * webhook — which grants per PaymentIntent — grants the pack's entries twice with it.
 *
 * The guest route had always guarded this by accepting a `paymentIntentId` and reusing it.
 * The existing-user route never did, so every authenticated member paying with a NEW card
 * was double-charged: 57 checkouts, 54 members, Jan–Sep 2026. Stripe metadata confirmed the
 * mechanism on 14/14 sampled pairs (upfront PI, then purchase-route PI, same card, same
 * amount, both succeeded, 1–3s apart).
 *
 * The root cause was NOT the missing parameter — it was that the same purchase logic lived
 * in two routes and only one copy got fixed. Hence one shared resolver, used by both, so a
 * third caller cannot quietly reintroduce it.
 *
 * Named to match its sibling `resolvePurchaseIdentity` in ../checkout-identity.ts.
 *
 * See docs/superpowers/specs/2026-09-04-one-time-pack-double-charge-design.md
 */

import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { normalizeMembershipPlanId } from "@/utils/membership/additional-package-mapping";

/**
 * Metadata marker written by whichever route takes ownership of a charge.
 *
 * This is what makes recovery precise. An UNCLAIMED succeeded PaymentIntent is an upfront
 * charge nobody has booked yet — safe to adopt. A CLAIMED one has already been turned into
 * a purchase, so a member deliberately buying the same pack a second time still gets
 * charged a second time, which is correct.
 */
export const ONE_TIME_CHARGE_CLAIMED_KEY = "oneTimeChargeClaimed";

/** How far back `recover` will look for an unclaimed upfront charge. */
const RECOVERY_WINDOW_SECONDS = 15 * 60;

/** Statuses where the money has moved (or is moving) and must not be charged again. */
const ADOPTABLE_STATUSES: ReadonlySet<Stripe.PaymentIntent.Status> = new Set([
  "succeeded",
  "processing",
]);

export type ResolvePurchaseOutcome = "adopted" | "recovered" | "created";

export interface ResolvePurchasePaymentIntentOptions {
  /** Stripe customer that must own the charge. */
  customerId: string;
  /** Canonical package id. Normalised internally, so either form is safe to pass. */
  packageId: string;
  /**
   * PaymentIntent the CLIENT already confirmed, when it has one. Absent for saved-card
   * purchases, where no upfront intent was ever confirmed.
   */
  suppliedPaymentIntentId?: string;
  /**
   * Built by `createPaymentIntentConfig`. Single source of the amount, description and the
   * full webhook metadata — for BOTH the create path and the stamp path. Taking those
   * separately as well would let the charged amount and the validated amount drift apart,
   * which is the one mistake this resolver exists to prevent.
   */
  createConfig: Stripe.PaymentIntentCreateParams;
  /** Stripe idempotency key for the create path (the caller's per-click checkout key). */
  idempotencyKey: string;
  /** Tag for log lines, e.g. the route name. */
  context: string;
}

export interface ResolvePurchasePaymentIntentResult {
  paymentIntent: Stripe.PaymentIntent;
  outcome: ResolvePurchaseOutcome;
}

/** Thrown when a supplied PaymentIntent must not be adopted. Callers answer 400. */
export class PaymentIntentNotAdoptableError extends Error {
  constructor(public readonly reason: string, public readonly details: string) {
    super(reason);
    this.name = "PaymentIntentNotAdoptableError";
  }
}

const customerIdOf = (pi: Stripe.PaymentIntent): string | undefined =>
  typeof pi.customer === "string" ? pi.customer : pi.customer?.id;

/**
 * Does this PaymentIntent describe the same purchase we are being asked to book?
 * Package ids are compared AFTER normalisation: the upfront intent carries the raw id from
 * the browser, which may still hold the `-member` suffix that `getPackageById` rejects.
 */
function describesSamePurchase(
  paymentIntent: Stripe.PaymentIntent,
  { customerId, packageId, amount }: { customerId: string; packageId: string; amount: number }
): boolean {
  const piCustomer = customerIdOf(paymentIntent);
  const piPackageId = paymentIntent.metadata?.packageId;
  return (
    paymentIntent.amount === amount &&
    // A PaymentIntent created before the customer existed has none yet — that is the guest
    // flow, and it is adopted rather than rejected (the guest route then attaches it).
    (!piCustomer || piCustomer === customerId) &&
    (!piPackageId || normalizeMembershipPlanId(piPackageId) === normalizeMembershipPlanId(packageId))
  );
}

/**
 * Stamp the webhook metadata (and the claim marker) onto an adopted PaymentIntent.
 *
 * NEVER THROWS. The money has already moved; failing the request here would show the buyer
 * an error for a payment that succeeded. The webhook falls back to package data when
 * `entriesCount` is missing, so the entries still land — only the optional attribution
 * codes are at risk. `console.error` because production builds strip `console.log`/`warn`.
 */
async function claimPaymentIntent(
  paymentIntent: Stripe.PaymentIntent,
  { customerId, createConfig, context }: { customerId: string; createConfig: Stripe.PaymentIntentCreateParams; context: string }
): Promise<Stripe.PaymentIntent> {
  const metadata: Record<string, string> = {
    ...paymentIntent.metadata,
    ...((createConfig.metadata ?? {}) as Record<string, string>),
    [ONE_TIME_CHARGE_CLAIMED_KEY]: "true",
  };

  try {
    return await stripe.paymentIntents.update(paymentIntent.id, {
      // The webhook resolves the buyer from the customer, so attach it if the upfront
      // intent was created before one existed.
      ...(customerIdOf(paymentIntent) ? {} : { customer: customerId }),
      ...(createConfig.description ? { description: createConfig.description } : {}),
      metadata,
    });
  } catch (updateError) {
    // A succeeded PaymentIntent refuses a `customer` change. Metadata still updates, and
    // metadata is the part the webhook actually needs.
    try {
      return await stripe.paymentIntents.update(paymentIntent.id, { metadata });
    } catch (metadataError) {
      console.error(
        `[${context}] Could not stamp PaymentIntent ${paymentIntent.id}; continuing with the charge as-is.`,
        { updateError, metadataError }
      );
      return paymentIntent;
    }
  }
}

/**
 * Return the single PaymentIntent this purchase should be booked against, charging the card
 * only when there is genuinely nothing to adopt.
 *
 * Resolution order, first match wins:
 *   1. adopt    — the client handed us a confirmed intent
 *   2. recover  — an unclaimed confirmed intent for this purchase exists (client confirmed,
 *                 then the purchase call failed and the buyer retried)
 *   3. create   — nothing to adopt; charge as before
 */
export async function resolvePurchasePaymentIntent({
  customerId,
  packageId,
  suppliedPaymentIntentId,
  createConfig,
  idempotencyKey,
  context,
}: ResolvePurchasePaymentIntentOptions): Promise<ResolvePurchasePaymentIntentResult> {
  const amount = createConfig.amount;
  const match = { customerId, packageId, amount };

  // ── 1. ADOPT ──────────────────────────────────────────────────────────────────────────
  if (suppliedPaymentIntentId) {
    const supplied = await stripe.paymentIntents.retrieve(suppliedPaymentIntentId);

    if (!ADOPTABLE_STATUSES.has(supplied.status)) {
      // `requires_action` lands here: the bank still wants authentication, so no money has
      // moved and the client's completePendingAuthentication owns the next step.
      throw new PaymentIntentNotAdoptableError(
        "PaymentIntent must be succeeded or processing to reuse",
        `Current status: ${supplied.status}`
      );
    }

    if (!describesSamePurchase(supplied, match)) {
      throw new PaymentIntentNotAdoptableError(
        "PaymentIntent does not match this purchase",
        `Expected amount ${amount} for package ${packageId} on customer ${customerId}`
      );
    }

    // Already claimed AND matching means the previous call succeeded and its response was
    // lost — the client is retrying. Hand back the same charge instead of erroring; a 400
    // here would report failure for a purchase that completed.
    if (supplied.metadata?.[ONE_TIME_CHARGE_CLAIMED_KEY] === "true") {
      console.error(
        `[${context}] Replay of already-claimed PaymentIntent ${supplied.id} — returning it without charging.`
      );
      return { paymentIntent: supplied, outcome: "adopted" };
    }

    return {
      paymentIntent: await claimPaymentIntent(supplied, { customerId, createConfig, context }),
      outcome: "adopted",
    };
  }

  // ── 2. RECOVER ────────────────────────────────────────────────────────────────────────
  // No id supplied. If the browser confirmed an upfront intent and then lost the purchase
  // call, that charge is sitting unclaimed on the customer — book it rather than charging
  // again. Bounded to the customer's 10 most recent intents inside a 15-minute window.
  const cutoff = Math.floor(Date.now() / 1000) - RECOVERY_WINDOW_SECONDS;
  let recoverable: Stripe.PaymentIntent | undefined;

  try {
    const recent = await stripe.paymentIntents.list({
      customer: customerId,
      limit: 10,
      created: { gte: cutoff },
    });

    recoverable = recent.data.find(
      (pi) =>
        ADOPTABLE_STATUSES.has(pi.status) &&
        pi.metadata?.[ONE_TIME_CHARGE_CLAIMED_KEY] !== "true" &&
        describesSamePurchase(pi, match)
    );
  } catch (listError) {
    // The safety net is best-effort. Losing it falls through to `create`, which is exactly
    // today's behaviour — never block a sale because a lookup failed.
    console.error(`[${context}] Recovery lookup failed; proceeding to create.`, listError);
  }

  if (recoverable) {
    console.error(
      `[${context}] Recovered unclaimed PaymentIntent ${recoverable.id} for ${packageId} — not charging again.`
    );
    return {
      paymentIntent: await claimPaymentIntent(recoverable, { customerId, createConfig, context }),
      outcome: "recovered",
    };
  }

  // ── 3. CREATE ─────────────────────────────────────────────────────────────────────────
  const paymentIntent = await stripe.paymentIntents.create(
    {
      ...createConfig,
      metadata: {
        ...((createConfig.metadata ?? {}) as Record<string, string>),
        [ONE_TIME_CHARGE_CLAIMED_KEY]: "true",
      },
    },
    { idempotencyKey }
  );

  return { paymentIntent, outcome: "created" };
}
