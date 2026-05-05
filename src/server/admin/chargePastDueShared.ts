import mongoose from "mongoose";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import InvoiceChargeLog from "@/models/InvoiceChargeLog";
import { resumeAfterSuccessfulRenewalPayment } from "@/services/subscription/SubscriptionCollectionPauseService";
import {
  RECENT_ATTEMPT_WINDOW_HOURS,
  buildAdminChargeIdempotencyKey,
  cutoffForRecentAttempt,
} from "./past-due-charge-idempotency";

export {
  RECENT_ATTEMPT_WINDOW_HOURS,
  buildAdminChargeIdempotencyKey,
  cutoffForRecentAttempt,
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
}): Promise<PastDueChargeResultRow> {
  const { invoice, paymentMethodId, customerId, user, adminId } = params;
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

  // 24h skip — protects against repeat decline fees when an admin (or two admins,
  // or the per-user retry endpoint and the bulk endpoint) hits the same invoice
  // within Stripe's idempotency window. The Stripe key below is the second line of
  // defence; this DB check is the first because it avoids the Stripe call entirely.
  const recentAttempt = await InvoiceChargeLog.findOne({
    invoiceId,
    attemptedAt: { $gte: cutoffForRecentAttempt() },
  })
    .select({ _id: 1, status: 1, attemptedAt: 1 })
    .lean();

  if (recentAttempt) {
    await InvoiceChargeLog.create({
      invoiceId,
      customerId,
      userId: new mongoose.Types.ObjectId(userIdStr),
      adminId: new mongoose.Types.ObjectId(adminId),
      status: "skipped",
      amount,
      attemptedAt: new Date(),
      errorMessage: `Skipped: prior attempt at ${recentAttempt.attemptedAt.toISOString()} within ${RECENT_ATTEMPT_WINDOW_HOURS}h window`,
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

  try {
    const paidInvoiceResponse = await stripe.invoices.pay(
      invoiceId,
      {
        payment_method: paymentMethodId,
        off_session: true,
      },
      { idempotencyKey: buildAdminChargeIdempotencyKey(invoiceId) }
    );
    const paidInvoice = paidInvoiceResponse as Stripe.Invoice;

    const baseResult: Record<string, unknown> = {
      ...sanitizeStripeResponse(paidInvoice),
    };
    let resumeCollectionError: string | undefined;

    if (paidInvoice.status === "paid") {
      const withSub = paidInvoice as Stripe.Invoice & {
        subscription?: string | Stripe.Subscription | null;
      };
      const subRaw = withSub.subscription;
      const subscriptionId =
        typeof subRaw === "string" ? subRaw : subRaw && typeof subRaw === "object" && "id" in subRaw
          ? (subRaw as Stripe.Subscription).id
          : undefined;
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
    }

    await InvoiceChargeLog.create({
      invoiceId: invoiceId,
      customerId: customerId,
      userId: new mongoose.Types.ObjectId(userIdStr),
      adminId: new mongoose.Types.ObjectId(adminId),
      status: "success",
      amount,
      attemptedAt: new Date(),
      result: baseResult,
      nextPaymentAttempt: paidInvoice.next_payment_attempt
        ? new Date(paidInvoice.next_payment_attempt * 1000)
        : undefined,
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
        errorMessage: "Invoice already paid",
        result: sanitizeStripeResponse(stripeError),
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
      errorCode: stripeError.code,
      errorMessage: stripeError.message,
      amount,
      attemptedAt: new Date(),
      result: sanitizeStripeResponse(stripeError),
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
