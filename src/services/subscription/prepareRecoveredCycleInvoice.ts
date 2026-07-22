import Stripe from "stripe";
import mongoose from "mongoose";
import { stripe } from "@/lib/stripe";
import InvoiceChargeLog from "@/models/InvoiceChargeLog";
import { extractPaymentIntentFromInvoice } from "@/utils/payment/failed-invoice-handler";
import {
  buildRecoveryFinalizeIdempotencyKey,
  buildRecoveryVoidIdempotencyKey,
  pickHeldDraftForRecovery,
} from "@/utils/payment/recovery/stranded-invoice-policy";

/**
 * The ONE shared "prepare a payable cycle invoice from a stranded past-due state" primitive.
 *
 * Ordering is deliberately **pick → finalize → void** (NOT void-first): we never void the stranded
 * original until we have a finalized, payable held draft, so a `no_held_draft` outcome can never
 * leave a member's current cycle with zero invoices (manual invoices are forbidden — they'd flip
 * `billing_reason` off `subscription_cycle` and skip the webhook renewal pipeline + reanchor).
 *
 * The primitive NEVER pays, resumes `pause_collection`, or reanchors — those stay in the caller
 * (interactive → return the PI client_secret; off_session → pay the draft) and the
 * `invoice.payment_succeeded` webhook.
 *
 * Reused by the admin recover flow, the member interactive Pay-Now flow, and the member/admin
 * off_session Force-Charge flow. See docs/superpowers/specs/2026-07-07-stranded-past-due-member-recovery-design.md.
 */

export type RecoveryActor = "admin" | "member" | "system";

/** Audit context. When supplied, the primitive writes the recovery `InvoiceChargeLog` rows. */
export interface PrepareRecoveryAudit {
  actor: RecoveryActor;
  userId: string;
  customerId: string;
  amount: number; // cents, for the audit row
  adminId?: string; // required only when actor === "admin"
}

export interface PrepareRecoveredCycleInvoiceParams {
  subscriptionId: string;
  /** The eligible-for-recovery stranded original (open-exhausted / uncollectible / void). */
  strandedInvoice: Stripe.Invoice;
  /** Per-cycle amount to match the held draft against — single-sourced from the live sub price. */
  expectedAmountCents: number;
  /** Omit for a non-auditing call (unit tests only). All production callers supply it. */
  audit?: PrepareRecoveryAudit;
}

export type PrepareRecoveredCycleInvoiceResult =
  | { ok: true; finalizedInvoice: Stripe.Invoice; paymentIntent: Stripe.PaymentIntent | null }
  | { ok: false; reason: "no_held_draft" | "draft_create_failed" | "finalize_failed"; message: string };

type RecoveryStepName = "void" | "create" | "finalize";

export interface RecoveryStepRow {
  invoiceId: string;
  actor: RecoveryActor;
  userId: string;
  customerId: string;
  adminId?: string;
  amount: number;
  status: "success" | "failed" | "skipped";
  errorMessage: string;
  result: { recovery: { step: RecoveryStepName; originalInvoiceId: string; newInvoiceId?: string } };
}

/** Injectable side-effecting deps (default to the real Stripe client + InvoiceChargeLog). */
export interface PrepareRecoveredCycleInvoiceDeps {
  listDrafts: (subscriptionId: string) => Promise<Stripe.Invoice[]>;
  /**
   * Stamp `dunning_recovery: "1"` onto the held draft (merging existing metadata) BEFORE it
   * is finalized + paid, so the paid invoice carries the durable dunning marker the past-due
   * reanchor gate reads (`invoiceMetadataDunningRecovery`). Without it, recovery drafts reach
   * the webhook with no marker, attempt_count=1, and pause already cleared — so the reanchor
   * silently skips and the member gets re-billed on their old anchor days later
   * (see docs/PAST_DUE_REANCHOR.md; observed live 2026-07). Best-effort: a failure here must
   * NOT abort the recovery (collection succeeds either way — the member just misses one reanchor).
   */
  markDunningRecovery: (draftId: string, existingMetadata: Record<string, string>) => Promise<void>;
  finalizeInvoice: (draftId: string, idempotencyKey: string) => Promise<Stripe.Invoice>;
  voidInvoice: (originalId: string, idempotencyKey: string) => Promise<void>;
  retrievePaymentIntent: (id: string) => Promise<Stripe.PaymentIntent>;
  recordRecoveryStep: (row: RecoveryStepRow) => Promise<void>;
}

function defaultDeps(): PrepareRecoveredCycleInvoiceDeps {
  return {
    listDrafts: async (subscriptionId) => {
      const page = await stripe.invoices.list({ subscription: subscriptionId, status: "draft", limit: 10 });
      return page.data;
    },
    markDunningRecovery: async (draftId, existingMetadata) => {
      await stripe.invoices.update(draftId, {
        metadata: { ...existingMetadata, dunning_recovery: "1" },
      });
    },
    finalizeInvoice: (draftId, idempotencyKey) =>
      stripe.invoices.finalizeInvoice(
        draftId,
        // auto_advance:false so pause_collection:keep_as_draft doesn't auto-collect during finalize;
        // the caller drives collection (interactive PI confirm / off_session pay).
        { expand: ["payment_intent"], auto_advance: false },
        { idempotencyKey }
      ),
    voidInvoice: async (originalId, idempotencyKey) => {
      await stripe.invoices.voidInvoice(originalId, undefined, { idempotencyKey });
    },
    retrievePaymentIntent: (id) => stripe.paymentIntents.retrieve(id, { expand: ["payment_method"] }),
    recordRecoveryStep: async (row) => {
      await InvoiceChargeLog.create({
        invoiceId: row.invoiceId,
        customerId: row.customerId,
        userId: new mongoose.Types.ObjectId(row.userId),
        actor: row.actor,
        ...(row.adminId ? { adminId: new mongoose.Types.ObjectId(row.adminId) } : {}),
        status: row.status,
        amount: row.amount,
        attemptedAt: new Date(),
        errorMessage: row.errorMessage,
        result: row.result,
      });
    },
  };
}

export async function prepareRecoveredCycleInvoice(
  params: PrepareRecoveredCycleInvoiceParams,
  deps: PrepareRecoveredCycleInvoiceDeps = defaultDeps()
): Promise<PrepareRecoveredCycleInvoiceResult> {
  const { subscriptionId, strandedInvoice, expectedAmountCents, audit } = params;
  const originalInvoiceId = strandedInvoice.id ?? "";

  const record = async (
    step: RecoveryStepName,
    invoiceId: string,
    status: RecoveryStepRow["status"],
    errorMessage: string,
    newInvoiceId?: string
  ): Promise<void> => {
    if (!audit) return; // non-auditing call (unit tests only)
    await deps.recordRecoveryStep({
      invoiceId,
      actor: audit.actor,
      userId: audit.userId,
      customerId: audit.customerId,
      adminId: audit.adminId,
      amount: audit.amount,
      status,
      errorMessage,
      result: { recovery: { step, originalInvoiceId, ...(newInvoiceId ? { newInvoiceId } : {}) } },
    });
  };

  // ── 1. Pick the held cycle draft FIRST (never void before we can re-bill) ──
  let drafts: Stripe.Invoice[] = [];
  try {
    drafts = await deps.listDrafts(subscriptionId);
  } catch {
    drafts = [];
  }
  const draft = pickHeldDraftForRecovery(drafts, expectedAmountCents);
  if (!draft || !draft.id) {
    await record(
      "create",
      originalInvoiceId,
      "skipped",
      "No held draft found; recovery cannot proceed without one (never create a manual invoice).",
    );
    return {
      ok: false,
      reason: "no_held_draft",
      message:
        "No held draft invoice exists on the subscription; recovery cannot proceed. Stripe must have a " +
        "cycle-billed draft to finalize and pay; manual invoices break the renewal pipeline.",
    };
  }
  const newInvoiceId = draft.id;
  await record("create", newInvoiceId, "skipped", `Using held draft ${newInvoiceId}`, newInvoiceId);

  // ── 1b. Stamp the dunning marker on the draft BEFORE finalize, so the paid invoice carries
  //        it and the past-due reanchor gate fires (the original marker-bearing invoice is voided
  //        below). Best-effort — never abort recovery if the stamp fails. ──
  try {
    await deps.markDunningRecovery(
      newInvoiceId,
      (draft.metadata as Record<string, string> | null) ?? {}
    );
  } catch (err) {
    await record(
      "create",
      newInvoiceId,
      "skipped",
      `dunning marker stamp failed (non-fatal; reanchor may be missed): ${err instanceof Error ? err.message : String(err)}`,
      newInvoiceId
    );
  }

  // ── 2. Finalize the draft (creates the payable invoice + PaymentIntent) ──
  let finalizedInvoice: Stripe.Invoice;
  try {
    finalizedInvoice = await deps.finalizeInvoice(newInvoiceId, buildRecoveryFinalizeIdempotencyKey(newInvoiceId));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await record("finalize", newInvoiceId, "failed", `finalize failed: ${message}`, newInvoiceId);
    return { ok: false, reason: "finalize_failed", message };
  }
  await record("finalize", newInvoiceId, "skipped", `Finalized; status=${finalizedInvoice.status}`, newInvoiceId);

  // ── 3. Void the stranded original LAST — non-fatal ──
  // We only reach here with a finalized, payable draft, so a void failure must NOT strand it.
  if (originalInvoiceId && strandedInvoice.status !== "void") {
    try {
      await deps.voidInvoice(originalInvoiceId, buildRecoveryVoidIdempotencyKey(originalInvoiceId));
      await record("void", originalInvoiceId, "success", "Voided stranded original invoice", newInvoiceId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Non-fatal: the draft is finalized and payable; a lingering un-voided original is cleanup.
      await record("void", originalInvoiceId, "failed", `void failed (non-fatal): ${message}`, newInvoiceId);
    }
  } else if (originalInvoiceId) {
    await record("void", originalInvoiceId, "skipped", "Original already void; skipped void step", newInvoiceId);
  }

  // ── 4. Surface the finalized draft's PaymentIntent for the interactive caller ──
  let paymentIntent = extractPaymentIntentFromInvoice(finalizedInvoice);
  if (!paymentIntent) {
    const inv = finalizedInvoice as Stripe.Invoice & {
      payment_intent?: string | Stripe.PaymentIntent;
      latest_payment_intent?: string | Stripe.PaymentIntent;
    };
    const piId =
      typeof inv.payment_intent === "string"
        ? inv.payment_intent
        : typeof inv.latest_payment_intent === "string"
          ? inv.latest_payment_intent
          : null;
    if (piId) {
      try {
        paymentIntent = await deps.retrievePaymentIntent(piId);
      } catch {
        // Leave null — the off_session caller pays via invoices.pay() which does not need it.
      }
    }
  }

  return { ok: true, finalizedInvoice, paymentIntent: paymentIntent ?? null };
}
