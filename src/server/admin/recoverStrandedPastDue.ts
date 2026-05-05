import mongoose from "mongoose";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import InvoiceChargeLog from "@/models/InvoiceChargeLog";
import User from "@/models/User";
import { getPackageById } from "@/data/membershipPackages";
import {
  buildRecoveryVoidIdempotencyKey,
  buildRecoveryCreateIdempotencyKey,
  buildRecoveryFinalizeIdempotencyKey,
  buildRecoveryItemIdempotencyKey,
  hasRecentRecoveryAttempt,
  isOriginalInvoiceEligibleForRecovery,
  pickHeldDraftForRecovery,
  RECENT_ATTEMPT_WINDOW_HOURS,
} from "./recoverStrandedPastDuePolicy";
import {
  fetchCustomerWithRetry,
  payOpenInvoiceAsPastDueAdmin,
  resolveInvoicePaymentMethodId,
  type PastDueChargeResultRow,
} from "./chargePastDueShared";
import { cutoffForRecentAttempt } from "./past-due-charge-idempotency";

export type RecoverStrandedResult =
  | { ok: true; row: PastDueChargeResultRow; newInvoiceId: string }
  | {
      ok: false;
      reason:
        | "user_not_found"
        | "subscription_inactive"
        | "not_past_due"
        | "package_not_found"
        | "invoice_not_found"
        | "invoice_owner_mismatch"
        | "invoice_subscription_mismatch"
        | "invoice_still_chargeable"
        | "invoice_already_paid"
        | "invoice_unknown_status"
        | "recent_recovery_attempt"
        | "void_failed"
        | "draft_create_failed"
        | "finalize_failed"
        | "no_payment_method";
      message: string;
    };

export async function recoverStrandedPastDueInvoice(params: {
  userId: string;
  originalInvoiceId: string;
  adminId: string;
}): Promise<RecoverStrandedResult> {
  const { userId, originalInvoiceId, adminId } = params;

  // ─── 1. Load user + verify state ───
  const user = await User.findById(userId)
    .select("_id email stripeCustomerId stripeSubscriptionId subscription")
    .lean();
  if (!user) return { ok: false, reason: "user_not_found", message: "User not found" };

  const subStatus = (user.subscription as { status?: string } | undefined)?.status;
  if (subStatus !== "past_due") {
    return {
      ok: false,
      reason: "not_past_due",
      message: `Subscription status is "${subStatus ?? "(missing)"}", not past_due`,
    };
  }
  if (!user.stripeCustomerId || !user.stripeSubscriptionId) {
    return {
      ok: false,
      reason: "subscription_inactive",
      message: "User has no active Stripe subscription/customer",
    };
  }

  const packageId = (user.subscription as { packageId?: string } | undefined)?.packageId;
  const pkg = packageId ? getPackageById(packageId) : undefined;
  if (!pkg || !pkg.isActive || typeof pkg.price !== "number") {
    return {
      ok: false,
      reason: "package_not_found",
      message: `MembershipPackage "${packageId ?? ""}" not found or inactive`,
    };
  }
  const expectedAmountCents = Math.round(pkg.price * 100);

  // ─── 2. Fetch original invoice and verify eligibility ───
  let originalInvoice: Stripe.Invoice;
  try {
    originalInvoice = await stripe.invoices.retrieve(originalInvoiceId);
  } catch (err) {
    return {
      ok: false,
      reason: "invoice_not_found",
      message: err instanceof Error ? err.message : String(err),
    };
  }

  const invoiceCustomerId =
    typeof originalInvoice.customer === "string"
      ? originalInvoice.customer
      : originalInvoice.customer?.id;
  if (invoiceCustomerId !== user.stripeCustomerId) {
    return {
      ok: false,
      reason: "invoice_owner_mismatch",
      message: "Original invoice customer does not match user's stripeCustomerId",
    };
  }

  // Tighter check: the invoice must belong to the user's current subscription,
  // not an old (canceled-and-resubscribed) one. Prevents accidental recovery
  // of legacy invoices that the admin shouldn't be touching.
  const invoiceWithSub = originalInvoice as Stripe.Invoice & {
    subscription?: string | Stripe.Subscription | null;
  };
  const invoiceSubscriptionId =
    typeof invoiceWithSub.subscription === "string"
      ? invoiceWithSub.subscription
      : invoiceWithSub.subscription?.id;
  if (invoiceSubscriptionId !== user.stripeSubscriptionId) {
    return {
      ok: false,
      reason: "invoice_subscription_mismatch",
      message: "Original invoice does not belong to user's current subscription",
    };
  }

  const eligibility = isOriginalInvoiceEligibleForRecovery(originalInvoice);
  if (!eligibility.eligible) {
    return {
      ok: false,
      reason:
        eligibility.reason === "still_chargeable"
          ? "invoice_still_chargeable"
          : eligibility.reason === "already_paid"
            ? "invoice_already_paid"
            : "invoice_unknown_status",
      message: `Original invoice status is "${originalInvoice.status}"; not stranded`,
    };
  }

  // ─── 3. 24h lock check ───
  const recentRows = await InvoiceChargeLog.find({
    userId: new mongoose.Types.ObjectId(userId),
    attemptedAt: { $gte: cutoffForRecentAttempt() },
  })
    .select({ attemptedAt: 1, result: 1 })
    .lean();

  if (hasRecentRecoveryAttempt(recentRows, originalInvoiceId)) {
    return {
      ok: false,
      reason: "recent_recovery_attempt",
      message: `A recovery attempt for this invoice happened within the last ${RECENT_ATTEMPT_WINDOW_HOURS}h`,
    };
  }

  const baseLogFields = {
    customerId: user.stripeCustomerId,
    userId: new mongoose.Types.ObjectId(userId),
    adminId: new mongoose.Types.ObjectId(adminId),
    amount: expectedAmountCents,
  };

  // ─── 4. Void original (idempotent) ───
  if (originalInvoice.status === "uncollectible") {
    try {
      await stripe.invoices.voidInvoice(originalInvoiceId, undefined, {
        idempotencyKey: buildRecoveryVoidIdempotencyKey(originalInvoiceId),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await InvoiceChargeLog.create({
        ...baseLogFields,
        invoiceId: originalInvoiceId,
        status: "failed",
        attemptedAt: new Date(),
        errorMessage: `void failed: ${message}`,
        result: { recovery: { step: "void", originalInvoiceId } },
      });
      return { ok: false, reason: "void_failed", message };
    }
  }
  await InvoiceChargeLog.create({
    ...baseLogFields,
    invoiceId: originalInvoiceId,
    status: originalInvoice.status === "void" ? "skipped" : "success",
    attemptedAt: new Date(),
    errorMessage:
      originalInvoice.status === "void"
        ? "Original already void; skipped void step"
        : "Voided original invoice",
    result: { recovery: { step: "void", originalInvoiceId } },
  });

  // ─── 5. Find or create a draft for the missed cycle ───
  let draftInvoice: Stripe.Invoice | null = null;
  let usedExistingDraft = false;
  try {
    const drafts = await stripe.invoices.list({
      subscription: user.stripeSubscriptionId,
      status: "draft",
      limit: 10,
    });
    draftInvoice = pickHeldDraftForRecovery(drafts.data, expectedAmountCents);
    if (draftInvoice) usedExistingDraft = true;
  } catch (err) {
    // Listing failed; fall through to create
    console.error("[recoverStrandedPastDue] listing drafts failed:", err);
  }

  if (!draftInvoice) {
    try {
      draftInvoice = await stripe.invoices.create(
        {
          customer: user.stripeCustomerId,
          subscription: user.stripeSubscriptionId,
          collection_method: "charge_automatically",
          auto_advance: false,
          pending_invoice_items_behavior: "exclude",
        },
        { idempotencyKey: buildRecoveryCreateIdempotencyKey(originalInvoiceId) }
      );

      // Add the cycle line item
      await stripe.invoiceItems.create(
        {
          customer: user.stripeCustomerId,
          invoice: draftInvoice.id,
          amount: expectedAmountCents,
          currency: "aud",
          description: `Recovery for ${pkg.name} (replaces ${originalInvoiceId})`,
        },
        { idempotencyKey: buildRecoveryItemIdempotencyKey(originalInvoiceId) }
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await InvoiceChargeLog.create({
        ...baseLogFields,
        invoiceId: originalInvoiceId,
        status: "failed",
        attemptedAt: new Date(),
        errorMessage: `create failed: ${message}`,
        result: { recovery: { step: "create", originalInvoiceId } },
      });
      return { ok: false, reason: "draft_create_failed", message };
    }
  }

  const newInvoiceId = draftInvoice.id;
  // Defensive: Stripe always returns an id on Invoice.create, but the type allows null.
  // Narrow before passing to downstream calls that require a string.
  if (!newInvoiceId) {
    return {
      ok: false,
      reason: "draft_create_failed",
      message: "Stripe returned a draft without an id",
    };
  }
  await InvoiceChargeLog.create({
    ...baseLogFields,
    invoiceId: newInvoiceId,
    status: "skipped",
    attemptedAt: new Date(),
    errorMessage: usedExistingDraft
      ? `Used existing held draft ${newInvoiceId}`
      : `Created fresh draft ${newInvoiceId}`,
    result: { recovery: { step: "create", originalInvoiceId, newInvoiceId } },
  });

  // ─── 6. Finalize the draft ───
  let finalizedInvoice: Stripe.Invoice;
  try {
    finalizedInvoice = await stripe.invoices.finalizeInvoice(
      newInvoiceId,
      { expand: ["payment_intent"] },
      { idempotencyKey: buildRecoveryFinalizeIdempotencyKey(newInvoiceId) }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await InvoiceChargeLog.create({
      ...baseLogFields,
      invoiceId: newInvoiceId,
      status: "failed",
      attemptedAt: new Date(),
      errorMessage: `finalize failed: ${message}`,
      result: { recovery: { step: "finalize", originalInvoiceId, newInvoiceId } },
    });
    return { ok: false, reason: "finalize_failed", message };
  }
  await InvoiceChargeLog.create({
    ...baseLogFields,
    invoiceId: newInvoiceId,
    status: "skipped",
    attemptedAt: new Date(),
    errorMessage: `Finalized; status=${finalizedInvoice.status}`,
    result: { recovery: { step: "finalize", originalInvoiceId, newInvoiceId } },
  });

  // ─── 7. Pay via the existing primitive (writes its own log row + resumes pause) ───
  const customer = await fetchCustomerWithRetry(user.stripeCustomerId);
  const customerWithSettings = customer as
    | (Stripe.Customer & {
        invoice_settings?: { default_payment_method?: string | Stripe.PaymentMethod };
      })
    | null;
  const customerDefaultPm = customerWithSettings?.invoice_settings?.default_payment_method;
  const customerDefaultPmId = customerDefaultPm
    ? typeof customerDefaultPm === "string"
      ? customerDefaultPm
      : customerDefaultPm.id
    : null;

  const paymentMethodId = resolveInvoicePaymentMethodId(finalizedInvoice, customerDefaultPmId);

  if (!paymentMethodId) {
    return {
      ok: false,
      reason: "no_payment_method",
      message: "Finalized invoice has no payment method on invoice or customer default",
    };
  }

  // No chargeRunId — recovery is per-user, not batch.
  const row = await payOpenInvoiceAsPastDueAdmin({
    invoice: finalizedInvoice,
    paymentMethodId,
    customerId: user.stripeCustomerId,
    user: { _id: user._id, email: user.email },
    adminId,
  });

  return { ok: true, row, newInvoiceId };
}
