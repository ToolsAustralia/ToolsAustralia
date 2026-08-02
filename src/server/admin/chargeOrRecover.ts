import mongoose from "mongoose";
import type Stripe from "stripe";
import { chooseChargeAction } from "./chargeOrRecoverPolicy";
import { payOpenInvoiceAsPastDueAdmin, type PastDueChargeResultRow } from "./chargePastDueShared";
import { buildOneOffChargeIdempotencyKey } from "./past-due-charge-idempotency";
import { recoverStrandedPastDueInvoice } from "./recoverStrandedPastDue";

/**
 * Admin per-user composition: pay a live open invoice, or auto-recover a
 * "Stripe gave up" stranded invoice (void + finalize held draft + pay).
 *
 * Picks the branch via `chooseChargeAction`. The pay branch and the recovery
 * branch both end up writing InvoiceChargeLog rows and (on success) clearing
 * Stripe `pause_collection` — no caller-side bookkeeping required.
 *
 * Manual lock bypass: this composition exists for admin-initiated routes;
 * both branches pass `bypass*: true` so the 6h budget doesn't gate explicit
 * admin clicks. The 30s spam debounce still fires inside the pay primitive.
 */
export async function chargeOrRecover(params: {
  invoice: Stripe.Invoice;
  paymentMethodId: string;
  customerId: string;
  user: { _id: mongoose.Types.ObjectId | string; email?: string | null };
  adminId: string;
}): Promise<PastDueChargeResultRow & { recovered?: true; newInvoiceId?: string }> {
  const decision = chooseChargeAction(params.invoice);

  if (decision.kind === "pay") {
    return payOpenInvoiceAsPastDueAdmin({
      invoice: params.invoice,
      paymentMethodId: params.paymentMethodId,
      customerId: params.customerId,
      user: params.user,
      adminId: params.adminId,
      bypassRecentAttemptLock: true,
      // Window-bucketed key (30s): a deliberate retry 30s+ later gets a fresh key (a
      // stable key would be replayed by Stripe for 24h and never re-charge), while two
      // concurrent submits of the SAME click share the bucket so Stripe dedupes them to
      // one charge. This path has no ChargeJobLock and the 30s debounce is non-atomic,
      // so the key bucket is the real concurrent-double-charge guard. See builder doc.
      idempotencyKey: buildOneOffChargeIdempotencyKey(params.invoice.id ?? ""),
    });
  }

  // Recover branch: needs the original invoice ID + the user's Mongo _id.
  const originalInvoiceId = params.invoice.id;
  if (!originalInvoiceId) {
    return {
      invoiceId: "",
      customerId: params.customerId,
      userId: String(params.user._id),
      userEmail: params.user.email ?? "N/A",
      status: "skipped",
      skipReason: "missing_invoice_id",
      amount: params.invoice.amount_remaining ?? 0,
    };
  }

  const result = await recoverStrandedPastDueInvoice({
    userId: String(params.user._id),
    originalInvoiceId,
    adminId: params.adminId,
    bypassRecentRecoveryLock: true,
    // Per-user admin action holds no RecoveryClaim, so the mint's own claim is conflict-free.
    // A deliberate admin "Charge" on a no_held_draft stranded member force-collects the current
    // cycle now (mint) instead of dead-ending — the member's card is charged and their renewal
    // resets ~1 month out.
    //
    // NOTE: the bulk run enables this too (chargePastDueJob.ts, `mintCurrentCycleIfNoDraft: true`),
    // passing `callerHoldsRecoveryClaim` so the mint reuses the claim it already holds. This
    // comment previously claimed the opposite ("the bulk run does NOT enable this") — that was
    // true only before 2026-07-21 and is corrected here; the anchor-reset trade it warned about
    // is real and accepted, and is documented in BUSINESS.md §9e.
    mintCurrentCycleIfNoDraft: true,
  });

  if (result.ok) {
    return {
      ...result.row,
      recovered: true,
      newInvoiceId: result.newInvoiceId,
    };
  }

  // Recovery refused or failed mid-flight. Split by whether the refusal
  // happened before any Stripe write (→ "skipped", so the history/totals
  // bucketer in charge-past-due-totals.ts groups them as skips with the
  // discriminant preserved as `skipReason`) or during the void/finalize/pay
  // sequence (→ "failed", because Stripe state may have changed).
  //
  // Exhaustive switch so a future variant added to `RecoverStrandedResult`
  // surfaces as a compile error rather than silently falling through.
  const baseRow = {
    invoiceId: originalInvoiceId,
    customerId: params.customerId,
    userId: String(params.user._id),
    userEmail: params.user.email ?? "N/A",
    amount: params.invoice.amount_remaining ?? 0,
  } as const;

  switch (result.reason) {
    // ── Refused before any Stripe write ──
    case "user_not_found":
    case "subscription_inactive":
    case "not_past_due":
    case "package_not_found":
    case "invoice_not_found":
    case "invoice_owner_mismatch":
    case "invoice_subscription_mismatch":
    case "invoice_still_chargeable":
    case "invoice_already_paid":
    case "invoice_unknown_status":
    case "recent_recovery_attempt":
    case "member_ending":
    case "no_held_draft":
    case "no_payment_method":
      return {
        ...baseRow,
        status: "skipped",
        skipReason: result.reason,
      };

    // ── Failed mid-flight (Stripe state may have changed) ──
    case "void_failed":
    case "draft_create_failed":
    case "finalize_failed":
      return {
        ...baseRow,
        status: "failed",
        error: `Recovery ${result.reason}: ${result.message}`,
      };

    default: {
      // Exhaustiveness guard: if a new reason is added to RecoverStrandedResult,
      // TypeScript will flag this assignment. Fall through to "failed" defensively.
      const _exhaustive: never = result.reason;
      void _exhaustive;
      return {
        ...baseRow,
        status: "failed",
        error: `Recovery ${result.reason as string}: ${result.message}`,
      };
    }
  }
}
