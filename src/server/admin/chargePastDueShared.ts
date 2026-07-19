import mongoose from "mongoose";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import InvoiceChargeLog from "@/models/InvoiceChargeLog";
import User from "@/models/User";
import { resumeAfterSuccessfulRenewalPayment } from "@/services/subscription/SubscriptionCollectionPauseService";
import {
  MIN_SECONDS_BETWEEN_ATTEMPTS,
  RECENT_ATTEMPT_WINDOW_HOURS,
  SKIP_REASON_NO_LONGER_PAST_DUE,
  cutoffForDebounce,
  cutoffForRecentAttempt,
  shouldSkipForNotPastDue,
  shouldSkipForRecentAttempt,
} from "./past-due-charge-idempotency";
import { selectCurrentSubscriptionChargeable as _selectCurrentSubscriptionChargeable } from "./chargePastDueSelectionPolicy";
import {
  decidePostPayAction,
  extractPaymentIntentId,
} from "./chargePastDuePostPayPolicy";

export {
  MIN_SECONDS_BETWEEN_ATTEMPTS,
  RECENT_ATTEMPT_WINDOW_HOURS,
  SKIP_REASON_NO_LONGER_PAST_DUE,
  cutoffForDebounce,
  cutoffForRecentAttempt,
  shouldSkipForNotPastDue,
};

/** Row shape returned from bulk and single-user past-due charge flows */
export type PastDueChargeResultRow = {
  invoiceId: string;
  customerId: string;
  userId?: string;
  userEmail?: string;
  status: "success" | "failed" | "skipped";
  error?: string;
  amount?: number;
  skipReason?: string;
  /** Set on success when clearing Stripe `pause_collection` failed (payment still succeeded). */
  resumeCollectionError?: string;
};

/**
 * Pull the trio of fields we persist into InvoiceChargeLog from a Stripe error.
 * `decline_code` is the specific reason (e.g. `do_not_honor`); `code` is the bucket
 * (e.g. `card_declined`). Saving both lets the UI prefer the specific one.
 */
function extractStripeErrorFields(err: Stripe.errors.StripeError): {
  errorCode?: string;
  declineCode?: string;
  errorMessage?: string;
} {
  const cardErr = err as Stripe.errors.StripeError & { decline_code?: string };
  return {
    errorCode: err.code,
    declineCode: cardErr.decline_code,
    errorMessage: err.message,
  };
}

export function sanitizeStripeResponse(response: unknown): Record<string, unknown> {
  if (!response || typeof response !== "object") {
    return {};
  }

  const sanitized: Record<string, unknown> = {};
  const obj = response as Record<string, unknown>;

  for (const [key, value] of Object.entries(obj)) {
    if (
      key.includes("card") ||
      key.includes("payment_method") ||
      key === "pan" ||
      key === "number" ||
      key === "cvc" ||
      key === "exp_month" ||
      key === "exp_year"
    ) {
      continue;
    }

    if (value && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
      sanitized[key] = sanitizeStripeResponse(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

export async function fetchCustomerWithRetry(
  customerId: string,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<Stripe.Customer | null> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const customer = await stripe.customers.retrieve(customerId);
      if (customer.deleted) {
        return null;
      }
      return customer;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      const isRateLimitError =
        (error as Stripe.errors.StripeError).code === "rate_limit" ||
        (error as Stripe.errors.StripeError).statusCode === 429 ||
        lastError.message.toLowerCase().includes("rate limit");

      if (!isRateLimitError) {
        return null;
      }

      if (attempt >= maxRetries) {
        console.error(`Failed to fetch customer ${customerId} after ${maxRetries} retries:`, lastError.message);
        return null;
      }

      const stripeError = error as Stripe.errors.StripeError;
      let waitTime = baseDelay * Math.pow(2, attempt - 1);

      if (stripeError.headers?.["retry-after"]) {
        const retryAfterSeconds = parseInt(stripeError.headers["retry-after"], 10);
        if (!isNaN(retryAfterSeconds)) {
          waitTime = (retryAfterSeconds + 1) * 1000;
        }
      }

      waitTime = Math.min(waitTime, 10000);

      console.warn(
        `⚠️ Rate limit error fetching customer ${customerId} - Retrying in ${Math.round(waitTime)}ms (attempt ${attempt}/${maxRetries})`
      );

      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }

  return null;
}

export async function batchFetchCustomers(
  customerIds: string[],
  batchSize: number = 15,
  batchDelay: number = 200
): Promise<Map<string, string | null>> {
  const customerPaymentMethodMap = new Map<string, string | null>();
  const uniqueCustomerIds = [...new Set(customerIds)];

  for (let i = 0; i < uniqueCustomerIds.length; i += batchSize) {
    const batch = uniqueCustomerIds.slice(i, i + batchSize);

    const batchResults = await Promise.allSettled(
      batch.map(async (customerId) => {
        const customer = await fetchCustomerWithRetry(customerId);
        if (!customer) {
          return { customerId, paymentMethodId: null };
        }

        const customerWithSettings = customer as Stripe.Customer & {
          invoice_settings?: { default_payment_method?: string | Stripe.PaymentMethod };
        };

        const defaultPaymentMethod = customerWithSettings.invoice_settings?.default_payment_method;
        const paymentMethodId = defaultPaymentMethod
          ? typeof defaultPaymentMethod === "string"
            ? defaultPaymentMethod
            : defaultPaymentMethod.id
          : null;

        return { customerId, paymentMethodId };
      })
    );

    for (const result of batchResults) {
      if (result.status === "fulfilled") {
        customerPaymentMethodMap.set(result.value.customerId, result.value.paymentMethodId);
      } else {
        console.error(`Failed to fetch customer in batch:`, result.reason);
      }
    }

    if (i + batchSize < uniqueCustomerIds.length) {
      await new Promise((resolve) => setTimeout(resolve, batchDelay));
    }
  }

  return customerPaymentMethodMap;
}

export function resolveInvoicePaymentMethodId(
  invoice: Stripe.Invoice,
  customerDefaultPaymentMethodId: string | null | undefined
): string | null {
  const invoicePaymentMethod = invoice.default_payment_method
    ? typeof invoice.default_payment_method === "string"
      ? invoice.default_payment_method
      : invoice.default_payment_method?.id
    : null;

  return invoicePaymentMethod || customerDefaultPaymentMethodId || null;
}

/**
 * Pull the customer's `invoice_settings.default_payment_method` ID from an
 * Invoice whose `customer` field has been expanded inline via
 * `expand: ['data.customer']` on the list call. Lets the bulk past-due flows
 * skip the N+1 `customers.retrieve` round-trip — eligibility now needs zero
 * extra Stripe calls per customer.
 *
 * Returns null when the customer is unset, only an ID (not expanded), deleted,
 * or has no default payment method configured.
 */
export function getCustomerDefaultPaymentMethodFromInvoice(
  invoice: Stripe.Invoice
): string | null {
  const customer = invoice.customer;
  if (!customer || typeof customer === "string") return null;
  if ((customer as Stripe.DeletedCustomer).deleted) return null;

  const fullCustomer = customer as Stripe.Customer & {
    invoice_settings?: {
      default_payment_method?: string | Stripe.PaymentMethod | null;
    };
  };
  const dpm = fullCustomer.invoice_settings?.default_payment_method;
  if (!dpm) return null;
  return typeof dpm === "string" ? dpm : dpm.id;
}

/**
 * Reduce a customer's open invoices to the single invoice we should charge —
 * the one attached to the user's current subscription. Older or duplicate
 * cycle invoices (created when pause_collection didn't fire in time) are
 * returned separately so the caller can log them as skipped.
 *
 * Returns `target: null` when no invoice on the current subscription is chargeable.
 *
 * Compatible with both Stripe API <2025-04-01 (invoice.subscription) and
 * >=2025-04-01 (invoice.parent.subscription_details.subscription).
 */
export function selectCurrentSubscriptionChargeable(
  invoices: Stripe.Invoice[],
  userStripeSubscriptionId: string | null | undefined
): { target: Stripe.Invoice | null; skipped: Stripe.Invoice[] } {
  return _selectCurrentSubscriptionChargeable(invoices, userStripeSubscriptionId);
}

type LeanPastDueUser = {
  _id: mongoose.Types.ObjectId | string;
  email?: string | null;
};

/**
 * Pay a single open Stripe invoice using an explicit payment method (admin / off_session).
 * Creates InvoiceChargeLog entries consistent with the bulk past-due job.
 */
export async function payOpenInvoiceAsPastDueAdmin(params: {
  invoice: Stripe.Invoice;
  paymentMethodId: string;
  customerId: string;
  user: LeanPastDueUser;
  adminId: string;
  chargeRunId?: mongoose.Types.ObjectId | null;
  /**
   * REQUIRED Stripe idempotency key for the `invoices.pay` call. Each caller MUST
   * choose the key that matches its dedupe unit — there is deliberately no stable
   * default, because a key reused across separate runs/clicks is REPLAYED by Stripe
   * for 24h (header `idempotent-replayed: true`) and never re-charges. Build it with
   * one of: `buildBulkChargeIdempotencyKey` (run-scoped, bulk daily run),
   * `buildOneOffChargeIdempotencyKey` (fresh per admin/user click on an existing
   * invoice), `buildForceChargeIdempotencyKey` (per-attempt Force Charge), or
   * `buildAdminChargeIdempotencyKey` (stable-per-invoice — recovery's new invoice only).
   * See the "24h replay trap" note in past-due-charge-idempotency.ts.
   */
  idempotencyKey: string;
  /**
   * Override the default 1-per-window lock check. When provided, the function
   * calls this instead of running its own `findOne` on InvoiceChargeLog.
   * Force Charge paths supply a callback that counts per-path Force Charge
   * attempts and allows up to 3 per 6h window.
   *
   * Returns `allowed: true` to proceed or `allowed: false` with a reason/message
   * to skip. Independent of the 30s debounce check, which always runs first.
   */
  attemptBudgetCheck?: () => Promise<
    { allowed: true } | { allowed: false; reason: string; message: string }
  >;
  /**
   * When true, skip the default 1-per-window (6h) lock check. Admin-initiated
   * routes (per-user charge button, manual recover endpoints) set this so a
   * deliberate admin click isn't gated by the bulk cron job's prior attempt.
   * The 30s spam debounce immediately above this branch still fires.
   *
   * Mutually exclusive with `attemptBudgetCheck` (Force Charge supplies its own
   * per-path 3-per-window budget; do not pass both).
   */
  bypassRecentAttemptLock?: boolean;
}): Promise<PastDueChargeResultRow> {
  const {
    invoice,
    paymentMethodId,
    customerId,
    user,
    adminId,
    chargeRunId = null,
    idempotencyKey,
    attemptBudgetCheck,
  } = params;
  const invoiceId = invoice.id;
  if (!invoiceId) {
    return {
      invoiceId: "",
      customerId,
      status: "skipped",
      skipReason: "missing_invoice_id",
      amount: invoice.amount_remaining || 0,
    };
  }

  const userEmail = user.email || "N/A";
  const userIdStr = typeof user._id === "string" ? user._id : String(user._id);
  const amount = invoice.amount_remaining || 0;

  // 30s spam-click debounce — fires before any other lock check.
  // Excludes rows tagged `result.recovery.step` because those are the recovery
  // flow's own void/create/finalize audit rows written milliseconds before this
  // pay call. They are not user-driven attempts and must not gate the pay step.
  const recentRowsForDebounce = await InvoiceChargeLog.find({
    invoiceId,
    attemptedAt: { $gte: cutoffForDebounce() },
    "result.recovery.step": { $exists: false },
  })
    .select({ attemptedAt: 1 })
    .lean();

  if (recentRowsForDebounce.length > 0) {
    await InvoiceChargeLog.create({
      invoiceId,
      customerId,
      userId: new mongoose.Types.ObjectId(userIdStr),
      adminId: new mongoose.Types.ObjectId(adminId),
      status: "skipped",
      amount,
      attemptedAt: new Date(),
      errorMessage: `Skipped: another attempt within last ${MIN_SECONDS_BETWEEN_ATTEMPTS} seconds (debounce)`,
      chargeRunId,
    });

    return {
      invoiceId,
      customerId,
      userId: userIdStr,
      userEmail,
      status: "skipped",
      skipReason: "too_soon",
      amount,
    };
  }

  // Window-based budget check. Default: 1-per-window (any prior attempt blocks).
  // Force Charge paths inject `attemptBudgetCheck` for per-path 3-per-window budgets.
  if (attemptBudgetCheck) {
    const budget = await attemptBudgetCheck();
    if (!budget.allowed) {
      await InvoiceChargeLog.create({
        invoiceId,
        customerId,
        userId: new mongoose.Types.ObjectId(userIdStr),
        adminId: new mongoose.Types.ObjectId(adminId),
        status: "skipped",
        amount,
        attemptedAt: new Date(),
        errorMessage: `Skipped: ${budget.message}`,
        chargeRunId,
      });

      return {
        invoiceId,
        customerId,
        userId: userIdStr,
        userEmail,
        status: "skipped",
        skipReason: budget.reason,
        amount,
      };
    }
  } else {
    // Excludes recovery step-audit rows (`result.recovery.step`) for the same reason the
    // 30s debounce does: they are machinery audit rows written milliseconds before this
    // pay call (create/finalize/void), not real charge attempts. Without this exclusion a
    // NON-bypassed recovery pay would self-block on its own just-written audit rows —
    // which is what previously forced every recovery caller to bypass this lock entirely.
    const recentAttempt = await InvoiceChargeLog.findOne({
      invoiceId,
      attemptedAt: { $gte: cutoffForRecentAttempt() },
      "result.recovery.step": { $exists: false },
    })
      .select({ _id: 1, status: 1, attemptedAt: 1 })
      .lean();

    const recentRowsForCheck = recentAttempt
      ? [{ attemptedAt: recentAttempt.attemptedAt, status: recentAttempt.status as "success" | "failed" | "skipped" }]
      : [];

    if (shouldSkipForRecentAttempt(recentRowsForCheck, params.bypassRecentAttemptLock ?? false)) {
      await InvoiceChargeLog.create({
        invoiceId,
        customerId,
        userId: new mongoose.Types.ObjectId(userIdStr),
        adminId: new mongoose.Types.ObjectId(adminId),
        status: "skipped",
        amount,
        attemptedAt: new Date(),
        errorMessage: `Skipped: prior attempt at ${recentRowsForCheck[0].attemptedAt.toISOString()} within ${RECENT_ATTEMPT_WINDOW_HOURS}h window`,
        chargeRunId,
      });

      return {
        invoiceId,
        customerId,
        userId: userIdStr,
        userEmail,
        status: "skipped",
        skipReason: "recently_attempted",
        amount,
      };
    }
  }

  // Late re-check — user's subscription.status may have flipped from past_due
  // to active mid-run (Stripe's own retry won, or pay-failed-invoice succeeded
  // in another tab). Skip rather than charge a now-current customer.
  const freshUser = await User.findById(userIdStr)
    .select({ "subscription.status": 1 })
    .lean();

  if (shouldSkipForNotPastDue(freshUser?.subscription?.status as string | undefined)) {
    await InvoiceChargeLog.create({
      invoiceId,
      customerId,
      userId: new mongoose.Types.ObjectId(userIdStr),
      adminId: new mongoose.Types.ObjectId(adminId),
      status: "skipped",
      amount,
      attemptedAt: new Date(),
      errorMessage: `Skipped: subscription.status is "${freshUser?.subscription?.status ?? "(missing)"}", no longer past_due`,
      chargeRunId,
    });

    return {
      invoiceId,
      customerId,
      userId: userIdStr,
      userEmail,
      status: "skipped",
      skipReason: SKIP_REASON_NO_LONGER_PAST_DUE,
      amount,
    };
  }

  try {
    const paidInvoiceResponse = await stripe.invoices.pay(
      invoiceId,
      {
        payment_method: paymentMethodId,
        off_session: true,
      },
      { idempotencyKey }
    );
    let paidInvoice = paidInvoiceResponse as Stripe.Invoice;

    // Stripe sometimes leaves the PI in `requires_confirmation` after invoices.pay()
    // (particularly when the invoice already had a PI from finalization). Fetch the
    // PI directly and decide what to do based on its actual state — never trust that
    // a successful pay() response means the invoice is paid.
    let pi: Stripe.PaymentIntent | null = null;
    const piId = extractPaymentIntentId(paidInvoice);
    if (piId) {
      try {
        pi = await stripe.paymentIntents.retrieve(piId);
      } catch (err) {
        console.error(`[payOpenInvoiceAsPastDueAdmin] PI retrieve failed for ${piId}:`, err);
      }
    }

    let decision = decidePostPayAction(paidInvoice, pi);

    // If Stripe left the PI in requires_confirmation, explicitly confirm it.
    // This is the bridge for Stripe's quirk after re-paying invoices with prior PIs.
    if (decision.kind === "needs_confirm") {
      try {
        pi = await stripe.paymentIntents.confirm(decision.piId, {
          off_session: true,
        });
        // Re-fetch invoice to get updated status after confirm
        paidInvoice = (await stripe.invoices.retrieve(invoiceId)) as Stripe.Invoice;
        decision = decidePostPayAction(paidInvoice, pi);
      } catch (confirmErr) {
        const stripeErr = confirmErr as Stripe.errors.StripeError;
        const errFields = extractStripeErrorFields(stripeErr);
        // Confirm threw — log as failed with the actual error
        await InvoiceChargeLog.create({
          invoiceId,
          customerId,
          userId: new mongoose.Types.ObjectId(userIdStr),
          adminId: new mongoose.Types.ObjectId(adminId),
          status: "failed",
          errorCode: errFields.errorCode,
          declineCode: errFields.declineCode,
          errorMessage: errFields.errorMessage,
          amount,
          attemptedAt: new Date(),
          result: sanitizeStripeResponse(stripeErr),
          chargeRunId,
        });
        return {
          invoiceId,
          customerId,
          userId: userIdStr,
          userEmail,
          status: "failed",
          error: stripeErr.message ?? "PaymentIntent confirm failed",
          amount,
        };
      }
    }

    // Now decide based on FINAL state
    if (decision.kind === "success") {
      const baseResult: Record<string, unknown> = {
        ...sanitizeStripeResponse(paidInvoice),
      };
      let resumeCollectionError: string | undefined;

      // Stripe API 2025-04-01+ moved invoice.subscription onto parent.subscription_details.
      // Read from parent first, fall back to root for older API versions / cached objects.
      const withSub = paidInvoice as Stripe.Invoice & {
        subscription?: string | Stripe.Subscription | null;
        parent?: { subscription_details?: { subscription?: string | null } | null } | null;
      };
      const subscriptionId =
        withSub.parent?.subscription_details?.subscription ??
        (typeof withSub.subscription === "string"
          ? withSub.subscription
          : withSub.subscription?.id);
      if (subscriptionId) {
        try {
          await resumeAfterSuccessfulRenewalPayment(subscriptionId);
          baseResult.pauseCollectionResumed = true;
        } catch (resumeErr) {
          resumeCollectionError = resumeErr instanceof Error ? resumeErr.message : String(resumeErr);
          baseResult.pauseCollectionResumeError = resumeCollectionError;
          console.error(
            `[chargePastDue] Payment succeeded but could not clear pause_collection for subscription ${subscriptionId}:`,
            resumeErr
          );
        }
      }

      await InvoiceChargeLog.create({
        invoiceId,
        customerId,
        userId: new mongoose.Types.ObjectId(userIdStr),
        adminId: new mongoose.Types.ObjectId(adminId),
        status: "success",
        amount,
        attemptedAt: new Date(),
        result: baseResult,
        nextPaymentAttempt: paidInvoice.next_payment_attempt
          ? new Date(paidInvoice.next_payment_attempt * 1000)
          : undefined,
        chargeRunId,
      });

      return {
        invoiceId,
        customerId,
        userId: userIdStr,
        userEmail,
        status: "success",
        amount,
        ...(resumeCollectionError ? { resumeCollectionError } : {}),
      };
    }

    // Non-success outcomes — log as failed with the decision's diagnostic info
    const failedErrorCode =
      decision.kind === "requires_authentication"
        ? "authentication_required"
        : decision.kind === "failed"
          ? decision.errorCode
          : `pi_${decision.kind}`;
    const failedErrorMessage =
      decision.kind === "requires_authentication"
        ? "Customer authentication required to complete the charge (3DS or similar)"
        : decision.kind === "failed"
          ? decision.errorMessage
          : `Unexpected post-pay decision: ${decision.kind}`;
    const failedDeclineCode =
      decision.kind === "failed" ? decision.declineCode : undefined;

    await InvoiceChargeLog.create({
      invoiceId,
      customerId,
      userId: new mongoose.Types.ObjectId(userIdStr),
      adminId: new mongoose.Types.ObjectId(adminId),
      status: "failed",
      errorCode: failedErrorCode,
      declineCode: failedDeclineCode,
      errorMessage: failedErrorMessage,
      amount,
      attemptedAt: new Date(),
      result: {
        invoiceStatus: paidInvoice.status,
        piStatus: pi?.status ?? null,
        piId: pi?.id ?? null,
        decision: decision.kind,
      },
      chargeRunId,
    });

    return {
      invoiceId,
      customerId,
      userId: userIdStr,
      userEmail,
      status: "failed",
      error: failedErrorMessage,
      amount,
    };
  } catch (error) {
    const stripeError = error as Stripe.errors.StripeError;

    if (
      stripeError.code === "resource_already_exists" ||
      stripeError.message?.includes("already paid") ||
      stripeError.message?.includes("already_paid")
    ) {
      await InvoiceChargeLog.create({
        invoiceId: invoiceId,
        customerId: customerId,
        userId: new mongoose.Types.ObjectId(userIdStr),
        adminId: new mongoose.Types.ObjectId(adminId),
        status: "skipped",
        amount,
        attemptedAt: new Date(),
        errorCode: stripeError.code,
        declineCode: (stripeError as Stripe.errors.StripeError & { decline_code?: string }).decline_code,
        errorMessage: "Invoice already paid",
        result: sanitizeStripeResponse(stripeError),
        chargeRunId,
      });

      return {
        invoiceId,
        customerId,
        userId: userIdStr,
        userEmail,
        status: "skipped",
        skipReason: "already_paid",
        amount,
      };
    }

    await InvoiceChargeLog.create({
      invoiceId: invoiceId,
      customerId: customerId,
      userId: new mongoose.Types.ObjectId(userIdStr),
      adminId: new mongoose.Types.ObjectId(adminId),
      status: "failed",
      ...extractStripeErrorFields(stripeError),
      amount,
      attemptedAt: new Date(),
      result: sanitizeStripeResponse(stripeError),
      chargeRunId,
    });

    return {
      invoiceId,
      customerId,
      userId: userIdStr,
      userEmail,
      status: "failed",
      error: stripeError.message || "Unknown error",
      amount,
    };
  }
}
