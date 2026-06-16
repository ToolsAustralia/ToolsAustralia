/**
 * Pure classifier for bulk stranded-invoice recovery. No Stripe SDK / Mongo imports
 * (type-only), so it unit-tests without STRIPE_SECRET_KEY or a DB.
 *
 * A "stranded" member is past_due with a held DRAFT for the current cycle blocked
 * behind stale OPEN cycle invoices Stripe refuses ("no longer be paid"). See
 * docs/superpowers/specs/2026-06-16-bulk-stranded-recovery-design.md.
 */
import type Stripe from "stripe";
import { isOriginalInvoiceEligibleForRecovery } from "./recoverStrandedPastDuePolicy";

export type MemberRecoveryClassification = "RECOVERABLE" | "BLOCKED_NO_DRAFT" | "NOT_STRANDED";

export interface MemberRecoveryPlan {
  classification: MemberRecoveryClassification;
  /** The current-cycle held draft to finalize + pay (exactly one). */
  currentDraft: Stripe.Invoice | null;
  /** Open-but-exhausted cycle invoices to void (write off missed months). */
  staleOpens: Stripe.Invoice[];
  /** Older held drafts to delete (never paid). */
  supersededDrafts: Stripe.Invoice[];
}

/** Period end of an invoice (Basil: read the single subscription line's period). */
function invoicePeriodEnd(invoice: Stripe.Invoice): number | undefined {
  return invoice.lines?.data?.[0]?.period?.end;
}

/**
 * Classify a member's invoices for bulk recovery.
 *
 * NOT_STRANDED returns an EMPTY plan (no currentDraft, empty buckets) by design — it means our
 * recovery path does not touch this member at all (the normal bulk charger owns them, or there is
 * nothing actionable). Callers must not read staleOpens/supersededDrafts on a NOT_STRANDED result.
 *
 * @param invoices       all invoices on the member's current subscription
 * @param currentPeriodEnd  subscription's current item period end (seconds)
 * @param expectedAmountCents  one cycle at the current package price
 */
export function classifyMemberForRecovery(
  invoices: Stripe.Invoice[],
  currentPeriodEnd: number,
  expectedAmountCents: number
): MemberRecoveryPlan {
  const drafts = invoices.filter((i) => i.status === "draft");
  const opens = invoices.filter((i) => i.status === "open");

  // The current cycle's held draft: a draft for the current period at the expected amount.
  const currentDraft =
    drafts.find((d) => invoicePeriodEnd(d) === currentPeriodEnd && d.amount_due === expectedAmountCents) ?? null;
  const supersededDrafts = drafts.filter((d) => d.id !== currentDraft?.id);

  // Opens split by Stripe's retry state. NOTE the polarity: isOriginalInvoiceEligibleForRecovery
  // returns eligible:true for an EXHAUSTED/dead open invoice (the void-and-rebill path), and
  // eligible:false while Stripe is still retrying it.
  const staleOpens = opens.filter((o) => isOriginalInvoiceEligibleForRecovery(o).eligible); // exhausted → recover
  const chargeableOpens = opens.filter((o) => !isOriginalInvoiceEligibleForRecovery(o).eligible); // still retrying → normal charger

  // A still-chargeable open invoice means the NORMAL bulk charger handles them — not us.
  if (chargeableOpens.length > 0) {
    return { classification: "NOT_STRANDED", currentDraft: null, staleOpens: [], supersededDrafts: [] };
  }
  if (currentDraft) {
    return { classification: "RECOVERABLE", currentDraft, staleOpens, supersededDrafts };
  }
  if (staleOpens.length > 0) {
    return { classification: "BLOCKED_NO_DRAFT", currentDraft: null, staleOpens, supersededDrafts };
  }
  return { classification: "NOT_STRANDED", currentDraft: null, staleOpens: [], supersededDrafts };
}
