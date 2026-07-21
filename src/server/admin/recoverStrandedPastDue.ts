import mongoose from "mongoose";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import InvoiceChargeLog from "@/models/InvoiceChargeLog";
import User from "@/models/User";
import { getPackageById } from "@/data/membershipPackages";
import {
  deriveExpectedCycleAmountCents,
  hasRecentRecoveryAttempt,
  isOriginalInvoiceEligibleForRecovery,
  RECENT_ATTEMPT_WINDOW_HOURS,
} from "./recoverStrandedPastDuePolicy";
import {
  fetchCustomerWithRetry,
  payOpenInvoiceAsPastDueAdmin,
  resolveInvoicePaymentMethodId,
  type PastDueChargeResultRow,
} from "./chargePastDueShared";
import { buildAdminChargeIdempotencyKey, cutoffForRecentAttempt } from "./past-due-charge-idempotency";
import { prepareRecoveredCycleInvoice } from "@/services/subscription/prepareRecoveredCycleInvoice";
import { mintCurrentCycleInvoice } from "@/services/subscription/mintCurrentCycleInvoice";

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
        | "member_ending"
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
   * steps just made. (Note: the pay primitive's 6h check now excludes recovery
   * step-audit rows itself, so non-bypassed recovery no longer self-blocks —
   * bulk passes false to keep the 6h repeat-guard active.)
   */
  bypassRecentRecoveryLock?: boolean;
  /**
   * When set (bulk chunked run), tags the recovery's PAY row on the NEW invoice
   * with the run id — keeping bulk machine activity out of the Manual Retries
   * view ({ chargeRunId: null }) and letting decline analytics count the pay
   * attempt (which carries the real declineCode) exactly once. Run totals are
   * unaffected: they are restricted to worklist invoice ids, and the new
   * invoice id is never in the worklist. Per-user callers omit it (null).
   */
  chargeRunId?: mongoose.Types.ObjectId | null;
  /**
   * When true, fall back to `mintCurrentCycleInvoice` if the member is `no_held_draft`
   * (stranded, but no held draft to finalize yet — their next cycle hasn't minted one).
   * That force-collects the current cycle now (unpause + billing_cycle_anchor:'now',
   * which auto-charges AND moves the renewal ~1 month out). Enabled by BOTH the per-user
   * `chargeOrRecover` AND the bulk charge job — so a bulk run collects/notifies EVERY stranded
   * member instead of skipping the no-draft cohort. The mint's own guards (double-charge,
   * cancel_at_period_end, upgrade-entry) make it safe to run unattended.
   */
  mintCurrentCycleIfNoDraft?: boolean;
  /**
   * True when the CALLER already holds this subscription's `RecoveryClaim` (the bulk chunk acquires it
   * per member). Threaded to the mint as `skipClaim` so it reuses the held claim instead of self-
   * deadlocking to `claim_held`. The per-user path holds no claim → leaves this false (mint acquires its own).
   */
  callerHoldsRecoveryClaim?: boolean;
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

  // ─── 4–6. Void stranded original + finalize held draft (shared primitive) ───
  // prepareRecoveredCycleInvoice does pick-held-draft → finalize(auto_advance:false) → void
  // (non-fatal), writes the recovery-tagged InvoiceChargeLog rows via the admin audit ctx, and
  // returns the finalized draft. Its failure reasons are a subset of RecoverStrandedResult.reason
  // (frozen union). NOTE two intended behavior deltas vs the old inline flow: it now voids
  // OPEN-stranded originals (not only `uncollectible`), and a void failure is non-fatal
  // (logged, recovery proceeds) rather than returning `void_failed`. The `result.recovery.step`
  // tags are preserved so `payOpenInvoiceAsPastDueAdmin`'s 30s debounce still excludes them.
  const prepared = await prepareRecoveredCycleInvoice({
    subscriptionId: user.stripeSubscriptionId,
    strandedInvoice: originalInvoice,
    expectedAmountCents,
    audit: {
      actor: "admin",
      adminId,
      userId,
      customerId: user.stripeCustomerId,
      amount: expectedAmountCents,
    },
  });
  if (!prepared.ok) {
    // no_held_draft fallback: the member is stranded but has no held draft to finalize
    // (their next cycle hasn't minted one). If the caller allows it, force-collect the
    // current cycle now — unpause + billing_cycle_anchor:'now' auto-charges the card AND
    // moves the renewal ~1 month out (so it doubles as the reanchor). See mintCurrentCycleInvoice.
    if (prepared.reason === "no_held_draft" && params.mintCurrentCycleIfNoDraft) {
      const mint = await mintCurrentCycleInvoice({
        subscriptionId: user.stripeSubscriptionId,
        originalInvoiceId,
        claimedBy: `recover-mint:${adminId}`,
        skipClaim: params.callerHoldsRecoveryClaim === true,
      });
      if (mint.ok) {
        // Per-user paths: this rebill row IS the audit. The BULK caller writes exactly ONE run-tagged
        // summary row (item.invoiceId, worklist-keyed) via summarizeBulkRecoveryOutcome, so writing here
        // too would double-count the outcome/revenue in the run totals — skip it when the caller owns it.
        if (!params.callerHoldsRecoveryClaim) {
          await InvoiceChargeLog.create({
            ...baseLogFields,
            invoiceId: mint.invoiceId,
            amount: mint.amountPaid,
            status: "success",
            attemptedAt: new Date(),
            errorMessage: `Re-billed current cycle (was no_held_draft): minted+charged ${mint.invoiceId}; renewal moved out`,
            result: { recovery: { rebill: true, originalInvoiceId } },
            ...(params.chargeRunId ? { chargeRunId: params.chargeRunId } : {}),
          });
        }
        return {
          ok: true,
          row: {
            invoiceId: mint.invoiceId,
            customerId: user.stripeCustomerId,
            userId,
            userEmail: user.email ?? "N/A",
            status: "success",
            amount: mint.amountPaid,
          },
          newInvoiceId: mint.invoiceId,
        };
      }
      // Non-ok: the guard/concurrency reasons (claim conflict, scheduled-to-cancel, already-collected)
      // touched NO card, so log them as SKIPPED — keeps them out of the failed/decline analytics and
      // shows the admin an accurate skip. A real charge decline or a mid-flight error is a FAILED row.
      const isSkip =
        mint.reason === "claim_held" ||
        mint.reason === "member_ending" ||
        mint.reason === "already_collected" ||
        mint.reason === "subscription_inactive";
      if (!params.callerHoldsRecoveryClaim) {
        // See the success branch: the BULK caller writes its own single worklist-keyed summary row, so a
        // rebill row here (which for a guard-skip falls back to the worklist original invoice id) would
        // double-count in the run totals. Per-user paths keep it as their audit row.
        await InvoiceChargeLog.create({
          ...baseLogFields,
          invoiceId: mint.invoiceId ?? originalInvoiceId,
          amount: expectedAmountCents,
          status: isSkip ? "skipped" : "failed",
          attemptedAt: new Date(),
          errorMessage: `Re-bill ${isSkip ? "skipped" : "failed"} (${mint.reason}): ${mint.message}`,
          result: { recovery: { rebill: true, originalInvoiceId } },
          ...(params.chargeRunId ? { chargeRunId: params.chargeRunId } : {}),
        });
      }
      // Map to a frozen RecoverStrandedResult reason (chargeOrRecover's exhaustive switch buckets
      // skip vs failed): claim conflict → recent_recovery_attempt; scheduled-to-cancel → member_ending;
      // already collected by a prior re-bill → not_past_due; real decline / mid-flight → finalize_failed.
      const mappedReason =
        mint.reason === "claim_held"
          ? ("recent_recovery_attempt" as const)
          : mint.reason === "member_ending"
            ? ("member_ending" as const)
            : mint.reason === "already_collected"
              ? ("not_past_due" as const)
              : mint.reason === "subscription_inactive"
                ? ("subscription_inactive" as const)
                : ("finalize_failed" as const);
      return {
        ok: false,
        reason: mappedReason,
        message: `Re-bill ${isSkip ? "skipped" : "failed"} (${mint.reason}): ${mint.message}`,
      };
    }
    return { ok: false, reason: prepared.reason, message: prepared.message };
  }
  const finalizedInvoice = prepared.finalizedInvoice;
  const newInvoiceId = finalizedInvoice.id;
  if (!newInvoiceId) {
    return { ok: false, reason: "draft_create_failed", message: "Finalized invoice has no id" };
  }

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

  // chargeRunId: null for per-user recovery; the bulk chunked run passes its run id
  // (see the param doc above).
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
    chargeRunId: params.chargeRunId ?? null,
    bypassRecentAttemptLock: params.bypassRecentRecoveryLock,
    idempotencyKey: buildAdminChargeIdempotencyKey(newInvoiceId),
  });

  return { ok: true, row, newInvoiceId };
}
