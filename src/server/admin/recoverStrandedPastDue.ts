import mongoose from "mongoose";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import InvoiceChargeLog from "@/models/InvoiceChargeLog";
import User from "@/models/User";
import { getPackageById } from "@/data/membershipPackages";
import {
  buildRecoveryVoidIdempotencyKey,
  buildRecoveryFinalizeIdempotencyKey,
  deriveExpectedCycleAmountCents,
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
import { buildAdminChargeIdempotencyKey, cutoffForRecentAttempt } from "./past-due-charge-idempotency";

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
        | "no_held_draft"
        | "no_payment_method"
        | "finalize_failed";
      message: string;
    };

export type RecoveryEligibilityResult =
  | { eligible: true; expectedAmountCents: number }
  | {
      eligible: false;
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
        | "recent_recovery_attempt";
      message: string;
    };

/**
 * Read-only eligibility check — performs the same verifications as the front of
 * `recoverStrandedPastDueInvoice` but makes no Stripe writes and no DB writes.
 * Returns { eligible: true, expectedAmountCents } when recovery can proceed,
 * or { eligible: false, reason, message } with the first blocking reason found.
 */
export async function checkRecoveryEligibility(params: {
  userId: string;
  originalInvoiceId: string;
  /**
   * When true, skip the 6h `hasRecentRecoveryAttempt` lock. Admin-initiated
   * routes (per-user manual recover, bulk recover from history page) set this
   * so an explicit admin click isn't gated by the bulk cron job's prior attempt.
   */
  bypassRecentRecoveryLock?: boolean;
}): Promise<RecoveryEligibilityResult> {
  const { userId, originalInvoiceId } = params;

  // ─── 1. Load user + verify state ───
  const user = await User.findById(userId)
    .select("_id email stripeCustomerId stripeSubscriptionId subscription")
    .lean();
  if (!user) return { eligible: false, reason: "user_not_found", message: "User not found" };

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
  const packageFallbackCents =
    pkg && pkg.isActive && typeof pkg.price === "number" ? Math.round(pkg.price * 100) : null;

  // Prefer the LIVE Stripe subscription price over the (possibly stale) DB package amount. A member
  // who switched tier while past_due has a held draft billed at the NEW price; matching the draft by
  // the stale package amount would wrongly yield `no_held_draft`. See docs/PAST_DUE_REANCHOR.md.
  let subscription: Stripe.Subscription;
  try {
    subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
  } catch (err) {
    return {
      eligible: false,
      reason: "subscription_inactive",
      message: err instanceof Error ? err.message : String(err),
    };
  }
  const expectedAmountCents = deriveExpectedCycleAmountCents(subscription, packageFallbackCents);
  if (expectedAmountCents == null || expectedAmountCents <= 0) {
    return {
      eligible: false,
      reason: "package_not_found",
      message: `No live subscription price and MembershipPackage "${packageId ?? ""}" not found or inactive`,
    };
  }

  // ─── 2. Fetch original invoice and verify eligibility ───
  let originalInvoice: Stripe.Invoice;
  try {
    originalInvoice = await stripe.invoices.retrieve(originalInvoiceId);
  } catch (err) {
    return {
      eligible: false,
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
      eligible: false,
      reason: "invoice_owner_mismatch",
      message: "Original invoice customer does not match user's stripeCustomerId",
    };
  }

  // Stripe API 2025-04-01+ moved invoice.subscription onto parent.subscription_details.
  // Read from parent first, fall back to root for older API versions / cached objects.
  const invoiceWithSub = originalInvoice as Stripe.Invoice & {
    subscription?: string | Stripe.Subscription | null;
    parent?: { subscription_details?: { subscription?: string | null } | null } | null;
  };
  const invoiceSubscriptionId =
    invoiceWithSub.parent?.subscription_details?.subscription ??
    (typeof invoiceWithSub.subscription === "string"
      ? invoiceWithSub.subscription
      : invoiceWithSub.subscription?.id);
  if (invoiceSubscriptionId !== user.stripeSubscriptionId) {
    return {
      eligible: false,
      reason: "invoice_subscription_mismatch",
      message: "Original invoice does not belong to user's current subscription",
    };
  }

  const eligibilityCheck = isOriginalInvoiceEligibleForRecovery(originalInvoice);
  if (!eligibilityCheck.eligible) {
    return {
      eligible: false,
      reason:
        eligibilityCheck.reason === "still_chargeable"
          ? "invoice_still_chargeable"
          : eligibilityCheck.reason === "already_paid"
            ? "invoice_already_paid"
            : "invoice_unknown_status",
      message: `Original invoice status is "${originalInvoice.status}"; not stranded`,
    };
  }

  // ─── 3. 6h lock check (bypassed for admin-initiated paths) ───
  if (!params.bypassRecentRecoveryLock) {
    const recentRows = await InvoiceChargeLog.find({
      userId: new mongoose.Types.ObjectId(userId),
      attemptedAt: { $gte: cutoffForRecentAttempt() },
    })
      .select({ attemptedAt: 1, result: 1 })
      .lean();

    if (hasRecentRecoveryAttempt(recentRows, originalInvoiceId)) {
      return {
        eligible: false,
        reason: "recent_recovery_attempt",
        message: `A recovery attempt for this invoice happened within the last ${RECENT_ATTEMPT_WINDOW_HOURS}h`,
      };
    }
  }

  return { eligible: true, expectedAmountCents };
}

export async function recoverStrandedPastDueInvoice(params: {
  userId: string;
  originalInvoiceId: string;
  adminId: string;
  /**
   * When true, skip the 6h recovery-lock check AND pass
   * `bypassRecentAttemptLock: true` to the final `payOpenInvoiceAsPastDueAdmin`
   * call so the recovered pay isn't gated by the very write that void/finalize
   * steps just made.
   */
  bypassRecentRecoveryLock?: boolean;
}): Promise<RecoverStrandedResult> {
  const { userId, originalInvoiceId, adminId } = params;

  // ─── 1–3. Eligibility check (delegates to shared read-only function) ───
  const eligibilityResult = await checkRecoveryEligibility({
    userId,
    originalInvoiceId,
    bypassRecentRecoveryLock: params.bypassRecentRecoveryLock,
  });
  if (!eligibilityResult.eligible) {
    // Map RecoveryEligibilityResult reason to RecoverStrandedResult reason (identical union subset)
    return { ok: false, reason: eligibilityResult.reason, message: eligibilityResult.message };
  }

  const { expectedAmountCents } = eligibilityResult;

  // Re-load user and invoice (needed for the write path; eligibility check already validated them)
  const user = await User.findById(userId)
    .select("_id email stripeCustomerId stripeSubscriptionId subscription")
    .lean();
  // These cannot be null/undefined — eligibility check passed — but narrow for TypeScript
  if (!user || !user.stripeCustomerId || !user.stripeSubscriptionId) {
    return { ok: false, reason: "user_not_found", message: "User not found after eligibility check" };
  }

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

  // ─── 5. Find a held draft for the missed cycle ───
  // CRITICAL: never create new manual invoices. Stripe-cycle drafts preserve
  // `billing_reason: "subscription_cycle"`, which the webhook needs to fire
  // the full renewal pipeline. A manually-created invoice would have
  // `billing_reason: "manual"` and silently skip the pipeline.
  let draftInvoice: Stripe.Invoice | null = null;
  try {
    const drafts = await stripe.invoices.list({
      subscription: user.stripeSubscriptionId,
      status: "draft",
      limit: 10,
    });
    draftInvoice = pickHeldDraftForRecovery(drafts.data, expectedAmountCents);
  } catch (err) {
    console.error("[recoverStrandedPastDue] listing drafts failed:", err);
  }

  if (!draftInvoice) {
    await InvoiceChargeLog.create({
      ...baseLogFields,
      invoiceId: originalInvoiceId,
      status: "skipped",
      attemptedAt: new Date(),
      errorMessage:
        "No held draft found on the subscription; recovery cannot proceed without one (manual invoices break the webhook renewal pipeline)",
      result: { recovery: { step: "create", originalInvoiceId } },
    });
    return {
      ok: false,
      reason: "no_held_draft",
      message:
        "No held draft invoice exists on the subscription. Stripe must have a cycle-billed invoice to finalize and pay; manual invoices break the renewal pipeline.",
    };
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
    errorMessage: `Used existing held draft ${newInvoiceId}`,
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
    await InvoiceChargeLog.create({
      ...baseLogFields,
      invoiceId: newInvoiceId,
      status: "failed",
      attemptedAt: new Date(),
      errorMessage: "Finalized invoice has no payment method on invoice or customer default",
      result: { recovery: { step: "pay", originalInvoiceId, newInvoiceId } },
    });
    return {
      ok: false,
      reason: "no_payment_method",
      message: "Finalized invoice has no payment method on invoice or customer default",
    };
  }

  // No chargeRunId — recovery is per-user, not batch.
  // Stable key on `newInvoiceId` (a held draft selected per recovery, then finalized).
  // Stability is correct here, and does NOT hit the 24h replay trap, because once
  // finalized this invoice leaves the draft pool (`pickHeldDraftForRecovery` only
  // selects `status: draft`), so a later recovery can't re-select and re-pay it; the
  // 6h recent-recovery lock blocks fast retries. Within a single recovery, stability
  // dedupes a retried pay of this same invoice to one charge.
  const row = await payOpenInvoiceAsPastDueAdmin({
    invoice: finalizedInvoice,
    paymentMethodId,
    customerId: user.stripeCustomerId,
    user: { _id: user._id, email: user.email },
    adminId,
    bypassRecentAttemptLock: params.bypassRecentRecoveryLock,
    idempotencyKey: buildAdminChargeIdempotencyKey(newInvoiceId),
  });

  return { ok: true, row, newInvoiceId };
}
