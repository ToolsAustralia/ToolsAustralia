// src/server/admin/forceChargePastDue.ts
/**
 * WEBHOOK AUDIT (verified 2026-05-05):
 *
 * Force Charge ALWAYS finalizes/pays an existing invoice. Stripe-created
 * cycle invoices (whether finalized as `open` or held as `draft` under
 * pause_collection) have `billing_reason: "subscription_cycle"`, which is
 * preserved by `finalizeInvoice()`. This billing_reason hits all webhook
 * branches that drive the renewal pipeline:
 *   - route.ts:3295  upsertRenewalCycleFromPaidInvoice (subscription_cycle)
 *   - route.ts:3598-3618  dispatch ladder → processPaymentBenefits
 *   - route.ts:4114  Klaviyo "Renewed" event (via recordMembershipRecurringAffiliate)
 *   - route.ts:4283  endDate sync
 *   - route.ts:3395  pause_collection clear (also has `prev === past_due` fallback)
 *
 * If we ever support creating a new manual invoice (V2), the webhook
 * ladder needs a metadata-based fallback because billing_reason: "manual"
 * is not currently handled. See spec section "Why no manual invoices".
 */

import mongoose from "mongoose";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import InvoiceChargeLog from "@/models/InvoiceChargeLog";
import User from "@/models/User";
import { getPackageById } from "@/data/membershipPackages";
import {
  buildForceChargeFinalizeIdempotencyKey,
  hasRecentSuccessfulChargeOnSubscription,
  isCurrentPeriodAlreadyPaid,
  pickForceChargeTarget,
  type ForceChargeTarget,
} from "./forceChargePastDuePolicy";
import {
  MAX_FORCE_CHARGE_ATTEMPTS_PER_WINDOW,
  RECENT_ATTEMPT_WINDOW_HOURS,
  buildForceChargeIdempotencyKey,
  countForceChargeAttempts,
  cutoffForRecentAttempt,
  hasForceChargeBudgetExhausted,
} from "./past-due-charge-idempotency";
import {
  payOpenInvoiceAsPastDueAdmin,
  type PastDueChargeResultRow,
} from "./chargePastDueShared";

/** A read-only diagnostic of the user's force-charge eligibility. */
export type ForceChargeEligibility =
  | {
      eligible: true;
      target: ForceChargeTarget;
      expectedAmountCents: number;
      subscriptionId: string;
    }
  | {
      eligible: false;
      reason:
        | "user_not_found"
        | "subscription_inactive"
        | "not_past_due"
        | "package_not_found"
        | "recent_charge_attempt"
        | "period_already_paid"
        | "no_chargeable_invoice";
      message: string;
    };

export type ForceChargeResultReason =
  | "user_not_found"
  | "subscription_inactive"
  | "not_past_due"
  | "package_not_found"
  | "recent_charge_attempt"
  | "period_already_paid"
  | "no_chargeable_invoice"
  | "finalize_failed"
  | "pay_failed";

export type ForceChargeResult =
  | { ok: true; row: PastDueChargeResultRow; chargedInvoiceId: string }
  | {
      ok: false;
      reason: ForceChargeResultReason;
      message: string;
    };

/**
 * Read-only check used by the test/diagnostic scripts and by the orchestrator
 * itself. Single source of truth for "can we Force Charge this user right now?"
 */
export async function checkForceChargeEligibility(params: {
  userId: string;
}): Promise<ForceChargeEligibility> {
  const { userId } = params;

  const user = await User.findById(userId)
    .select("_id email stripeCustomerId stripeSubscriptionId subscription")
    .lean();
  if (!user) {
    return { eligible: false, reason: "user_not_found", message: "User not found" };
  }

  const subStatus = (user.subscription as { status?: string } | undefined)?.status;
  if (subStatus !== "past_due") {
    return {
      eligible: false,
      reason: "not_past_due",
      message: `Subscription status is "${subStatus ?? "(missing)"}", not past_due`,
    };
  }
  if (!user.stripeCustomerId || !user.stripeSubscriptionId) {
    return {
      eligible: false,
      reason: "subscription_inactive",
      message: "User has no active Stripe subscription/customer",
    };
  }

  const packageId = (user.subscription as { packageId?: string } | undefined)?.packageId;
  const pkg = packageId ? getPackageById(packageId) : undefined;
  if (!pkg || !pkg.isActive || typeof pkg.price !== "number") {
    return {
      eligible: false,
      reason: "package_not_found",
      message: `MembershipPackage "${packageId ?? ""}" not found or inactive`,
    };
  }
  const expectedAmountCents = Math.round(pkg.price * 100);

  // 1. DB lock check — use the shared window constant
  const recentRows = await InvoiceChargeLog.find({
    userId: new mongoose.Types.ObjectId(userId),
    attemptedAt: { $gte: cutoffForRecentAttempt() },
  })
    .select({ attemptedAt: 1, status: 1, result: 1 })
    .lean();
  if (
    hasRecentSuccessfulChargeOnSubscription(
      recentRows.map((r) => ({
        attemptedAt: r.attemptedAt,
        status: r.status as "success" | "failed" | "skipped",
        result: r.result,
      })),
      user.stripeSubscriptionId
    )
  ) {
    return {
      eligible: false,
      reason: "recent_charge_attempt",
      message: `A successful charge for this subscription happened within the last ${RECENT_ATTEMPT_WINDOW_HOURS}h`,
    };
  }

  // 2. Stripe paid-period check
  // Stripe API 2025-04-01+ moved current_period_start/end onto subscription items.
  // Old API still has them at the root. Read from items first, fall back to root.
  const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
  const subWithPeriod = subscription as Stripe.Subscription & {
    current_period_start?: number;
    current_period_end?: number;
  };
  const itemWithPeriod = subscription.items?.data?.[0] as
    | (Stripe.SubscriptionItem & {
        current_period_start?: number;
        current_period_end?: number;
      })
    | undefined;
  const cps = itemWithPeriod?.current_period_start ?? subWithPeriod.current_period_start;
  const cpe = itemWithPeriod?.current_period_end ?? subWithPeriod.current_period_end;
  if (typeof cps !== "number" || typeof cpe !== "number") {
    return {
      eligible: false,
      reason: "subscription_inactive",
      message: "Subscription has no current_period window (root or items[0])",
    };
  }
  const paidList = await stripe.invoices.list({
    subscription: user.stripeSubscriptionId,
    status: "paid",
    limit: 5,
  });
  if (isCurrentPeriodAlreadyPaid(paidList.data, cps, cpe)) {
    return {
      eligible: false,
      reason: "period_already_paid",
      message: "Current billing period is already settled by a paid invoice",
    };
  }

  // 3. Find the target invoice
  const [openList, draftList] = await Promise.all([
    stripe.invoices.list({
      subscription: user.stripeSubscriptionId,
      status: "open",
      limit: 10,
    }),
    stripe.invoices.list({
      subscription: user.stripeSubscriptionId,
      status: "draft",
      limit: 10,
    }),
  ]);

  const target = pickForceChargeTarget(openList.data, draftList.data, expectedAmountCents);
  if (!target) {
    return {
      eligible: false,
      reason: "no_chargeable_invoice",
      message:
        "No chargeable invoice on current subscription (no open invoice, no held draft matching expected amount)",
    };
  }

  return {
    eligible: true,
    target,
    expectedAmountCents,
    subscriptionId: user.stripeSubscriptionId,
  };
}

/**
 * Force Charge orchestrator. Used by admin endpoint, user self-serve endpoint,
 * and the live mode of test-force-charge.ts.
 */
export async function forceChargeCurrentCycle(params: {
  userId: string;
  triggeredBy: "admin" | "user";
  /** When triggeredBy === "admin", the admin's User._id. When "user", pass the user's own _id. */
  adminId: string;
}): Promise<ForceChargeResult> {
  const { userId, adminId } = params;

  const eligibility = await checkForceChargeEligibility({ userId });
  if (!eligibility.eligible) {
    return {
      ok: false,
      reason: eligibility.reason,
      message: eligibility.message,
    };
  }

  const { target, expectedAmountCents, subscriptionId } = eligibility;

  // Per-path Force Charge budget: count prior force-charge attempts on this
  // invoice + this triggeredBy path within the 6h window.
  const targetInvoiceId = target.invoice.id;
  if (!targetInvoiceId) {
    return {
      ok: false,
      reason: "pay_failed",
      message: "Target invoice missing id",
    };
  }
  const priorAttemptRows = await InvoiceChargeLog.find({
    invoiceId: targetInvoiceId,
    attemptedAt: { $gte: cutoffForRecentAttempt() },
  })
    .select({ attemptedAt: 1, result: 1 })
    .lean();
  const priorPathRows = priorAttemptRows.map((r) => ({
    attemptedAt: r.attemptedAt,
    result: r.result,
  }));
  if (hasForceChargeBudgetExhausted(priorPathRows, params.triggeredBy)) {
    return {
      ok: false,
      reason: "recent_charge_attempt",
      message: `Force Charge budget for ${params.triggeredBy} exhausted (max ${MAX_FORCE_CHARGE_ATTEMPTS_PER_WINDOW} per ${RECENT_ATTEMPT_WINDOW_HOURS}h). Try again later.`,
    };
  }
  const attemptNumber =
    countForceChargeAttempts(priorPathRows, params.triggeredBy) + 1;

  // Re-fetch user for the write path (user could have changed between eligibility and execution).
  const user = await User.findById(userId)
    .select("_id email stripeCustomerId")
    .lean();
  if (!user || !user.stripeCustomerId) {
    return { ok: false, reason: "user_not_found", message: "User vanished mid-execution" };
  }

  // Step 1: Finalize the draft if needed
  let payableInvoice: Stripe.Invoice = target.invoice;
  if (target.kind === "draft") {
    const targetId = target.invoice.id;
    if (!targetId) {
      return {
        ok: false,
        reason: "finalize_failed",
        message: "Draft invoice missing id",
      };
    }
    try {
      payableInvoice = await stripe.invoices.finalizeInvoice(
        targetId,
        { expand: ["payment_intent"] },
        { idempotencyKey: buildForceChargeFinalizeIdempotencyKey(targetId) }
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await InvoiceChargeLog.create({
        invoiceId: targetId,
        customerId: user.stripeCustomerId,
        userId: new mongoose.Types.ObjectId(userId),
        adminId: new mongoose.Types.ObjectId(adminId),
        status: "failed",
        amount: expectedAmountCents,
        attemptedAt: new Date(),
        errorMessage: `force-charge finalize failed: ${message}`,
        result: { forceCharge: { step: "finalize" }, subscriptionId },
      });
      return { ok: false, reason: "finalize_failed", message };
    }
  }

  const chargedInvoiceId = payableInvoice.id;
  if (!chargedInvoiceId) {
    return {
      ok: false,
      reason: "pay_failed",
      message: "Payable invoice missing id",
    };
  }

  // Step 2: Pay via the existing primitive
  const paymentMethodId =
    typeof payableInvoice.default_payment_method === "string"
      ? payableInvoice.default_payment_method
      : payableInvoice.default_payment_method?.id;

  let resolvedPmId = paymentMethodId ?? null;
  if (!resolvedPmId) {
    const customer = await stripe.customers.retrieve(user.stripeCustomerId);
    if (!customer.deleted) {
      const c = customer as Stripe.Customer & {
        invoice_settings?: { default_payment_method?: string | Stripe.PaymentMethod };
      };
      const dpm = c.invoice_settings?.default_payment_method;
      resolvedPmId = typeof dpm === "string" ? dpm : dpm?.id ?? null;
    }
  }

  if (!resolvedPmId) {
    await InvoiceChargeLog.create({
      invoiceId: chargedInvoiceId,
      customerId: user.stripeCustomerId,
      userId: new mongoose.Types.ObjectId(userId),
      adminId: new mongoose.Types.ObjectId(adminId),
      status: "failed",
      amount: expectedAmountCents,
      attemptedAt: new Date(),
      errorMessage: "force-charge pay failed: no payment method",
      result: { forceCharge: { step: "pay" }, subscriptionId },
    });
    return {
      ok: false,
      reason: "pay_failed",
      message: "No payment method on invoice or customer default",
    };
  }

  const idempotencyKey = buildForceChargeIdempotencyKey(
    targetInvoiceId,
    params.triggeredBy,
    attemptNumber
  );

  // TOCTOU recheck: re-validate the budget right before the Stripe call.
  // Cheap (one indexed query) and protects against concurrent Force Charges
  // racing past the initial check.
  const attemptBudgetCheck = async () => {
    const freshRows = await InvoiceChargeLog.find({
      invoiceId: targetInvoiceId,
      attemptedAt: { $gte: cutoffForRecentAttempt() },
    })
      .select({ attemptedAt: 1, result: 1 })
      .lean();
    const freshPathRows = freshRows.map((r) => ({
      attemptedAt: r.attemptedAt,
      result: r.result,
    }));
    if (hasForceChargeBudgetExhausted(freshPathRows, params.triggeredBy)) {
      return {
        allowed: false as const,
        reason: "recent_charge_attempt",
        message: `Force Charge budget for ${params.triggeredBy} exhausted (max ${MAX_FORCE_CHARGE_ATTEMPTS_PER_WINDOW} per ${RECENT_ATTEMPT_WINDOW_HOURS}h)`,
      };
    }
    return { allowed: true as const };
  };

  const row = await payOpenInvoiceAsPastDueAdmin({
    invoice: payableInvoice,
    paymentMethodId: resolvedPmId,
    customerId: user.stripeCustomerId,
    user: { _id: user._id, email: user.email },
    adminId,
    idempotencyKey,
    attemptBudgetCheck,
  });

  // Stamp subscriptionId into the most-recently-created log row so the 24h lock
  // can find it next time. (payOpenInvoiceAsPastDueAdmin writes its own row that
  // includes invoiceId; we add a tag for the lock.)
  await InvoiceChargeLog.findOneAndUpdate(
    {
      invoiceId: chargedInvoiceId,
      userId: new mongoose.Types.ObjectId(userId),
    },
    {
      $set: {
        "result.subscriptionId": subscriptionId,
        "result.forceCharge.step": "pay",
        "result.forceCharge.triggeredBy": params.triggeredBy,
      },
    },
    { sort: { attemptedAt: -1 } }
  );

  return {
    ok: row.status === "success" || row.status === "skipped" ? true : false as never,
    row,
    chargedInvoiceId,
  } as ForceChargeResult;
}
