import mongoose from "mongoose";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import User from "@/models/User";
import InvoiceChargeLog from "@/models/InvoiceChargeLog";
import ChargeJobLock from "@/models/ChargeJobLock";
import ChargeJobRun from "@/models/ChargeJobRun";
import { aggregateRunTotals, type ChargeLogRowForAggregation } from "./charge-past-due-totals";
import { getPackageById } from "@/data/membershipPackages";
import { getSubscriptionPeriodEnd } from "@/utils/payment/stripe/subscription-period";
import {
  fetchCustomerWithRetry,
  payOpenInvoiceAsPastDueAdmin,
  resolveInvoicePaymentMethodId,
  type PastDueChargeResultRow,
} from "./chargePastDueShared";
import { buildRecoveryVoidIdempotencyKey, buildRecoveryFinalizeIdempotencyKey } from "./recoverStrandedPastDuePolicy";
import { buildAdminChargeIdempotencyKey } from "./past-due-charge-idempotency";
import { classifyMemberForRecovery, type MemberRecoveryPlan } from "./recoverStrandedBulkPolicy";

type PastDueUserLean = {
  _id: mongoose.Types.ObjectId;
  email?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  subscription?: { status?: string | null; packageId?: string | null };
};

export interface StrandedPreviewRow {
  userId: string;
  email: string;
  customerId: string;
  subscriptionId: string;
  classification: MemberRecoveryPlan["classification"];
  currentDraftId: string | null;
  staleOpenIds: string[];
  supersededDraftIds: string[];
  amountCents: number;
}

export interface StrandedPreview {
  recoverable: StrandedPreviewRow[];
  blockedNoDraft: StrandedPreviewRow[];
  totals: { recoverable: number; blockedNoDraft: number; scanned: number; recoverableRevenueCents: number };
}

/** Read-only: scan past_due members and classify each. Rate-limited. */
async function scanStrandedMembers(): Promise<StrandedPreviewRow[]> {
  const users = await User.find({
    "subscription.status": "past_due",
    stripeSubscriptionId: { $exists: true, $ne: null },
    stripeCustomerId: { $exists: true, $ne: null },
  })
    .select("_id email stripeCustomerId stripeSubscriptionId subscription.status subscription.packageId")
    .lean<PastDueUserLean[]>();

  const rows: StrandedPreviewRow[] = [];
  const BATCH = 10;
  const DELAY = 250;
  for (let i = 0; i < users.length; i += BATCH) {
    const batch = users.slice(i, i + BATCH);
    const settled = await Promise.allSettled(
      batch.map(async (u): Promise<StrandedPreviewRow | null> => {
        if (!u.stripeSubscriptionId || !u.stripeCustomerId) return null;
        const pkg = u.subscription?.packageId ? getPackageById(u.subscription.packageId) : undefined;
        if (!pkg || typeof pkg.price !== "number") return null;
        const expected = Math.round(pkg.price * 100);

        const sub = await stripe.subscriptions.retrieve(u.stripeSubscriptionId);
        const currentPeriodEnd = getSubscriptionPeriodEnd(sub);
        if (typeof currentPeriodEnd !== "number") return null;

        const invoices = await stripe.invoices.list({ subscription: u.stripeSubscriptionId, limit: 100 });
        const plan = classifyMemberForRecovery(invoices.data, currentPeriodEnd, expected);
        if (plan.classification === "NOT_STRANDED") return null;

        return {
          userId: String(u._id),
          email: u.email ?? "",
          customerId: u.stripeCustomerId,
          subscriptionId: u.stripeSubscriptionId,
          classification: plan.classification,
          currentDraftId: plan.currentDraft?.id ?? null,
          staleOpenIds: plan.staleOpens.map((i) => i.id!).filter(Boolean),
          supersededDraftIds: plan.supersededDrafts.map((i) => i.id!).filter(Boolean),
          amountCents: expected,
        };
      })
    );
    for (const s of settled) if (s.status === "fulfilled" && s.value) rows.push(s.value);
    if (i + BATCH < users.length) await new Promise((r) => setTimeout(r, DELAY));
  }
  return rows;
}

export async function previewStrandedRecovery(): Promise<StrandedPreview> {
  const rows = await scanStrandedMembers();
  const recoverable = rows.filter((r) => r.classification === "RECOVERABLE");
  const blockedNoDraft = rows.filter((r) => r.classification === "BLOCKED_NO_DRAFT");
  return {
    recoverable,
    blockedNoDraft,
    totals: {
      recoverable: recoverable.length,
      blockedNoDraft: blockedNoDraft.length,
      scanned: rows.length,
      recoverableRevenueCents: recoverable.reduce((s, r) => s + r.amountCents, 0),
    },
  };
}

export interface RunStrandedRecoveryResult {
  chargeRunId: string;
  attempted: number;
  succeeded: number;
  failed: number;
  skipped: number;
  revenueCents: number;
  rows: Array<PastDueChargeResultRow & { subscriptionId: string }>;
}

const RECOVER_LOCK_ID = "charge-job-lock"; // SAME lock as bulk charge — they must not overlap.

/** Injectable side-effecting deps — defaults to the real ones; overridden in tests. */
export interface RunStrandedRecoveryDeps {
  scan?: () => Promise<StrandedPreviewRow[]>;
  pay?: typeof payOpenInvoiceAsPastDueAdmin;
}

/** Best-effort audit row for a destructive recovery step (void/delete/finalize). Never throws. */
async function logRecoveryStep(p: {
  invoiceId: string;
  customerId: string;
  userId: string;
  adminId: string;
  amount: number;
  chargeRunId: mongoose.Types.ObjectId;
  step: "void" | "delete" | "finalize";
  message: string;
}): Promise<void> {
  try {
    await InvoiceChargeLog.create({
      invoiceId: p.invoiceId,
      customerId: p.customerId,
      userId: new mongoose.Types.ObjectId(p.userId),
      adminId: new mongoose.Types.ObjectId(p.adminId),
      status: "skipped",
      amount: p.amount,
      attemptedAt: new Date(),
      errorMessage: p.message,
      result: { recovery: { step: p.step } },
      chargeRunId: p.chargeRunId,
    });
  } catch (e) {
    console.error(`[recover-stranded] audit log (${p.step}) failed for ${p.invoiceId}:`, e);
  }
}

/**
 * Recover up to `limit` stranded members. Destructive: voids stale opens, voids
 * superseded drafts (finalize→void; subscription drafts can't be deleted), finalizes +
 * pays the current draft (one cycle). Double-charge
 * safety: a paid draft is no longer a draft, so a recovered member is gone from the
 * next scan; the pay uses Stripe idempotency `admin-charge-${draftId}`.
 */
export async function runStrandedRecovery(
  params: {
    adminId: string;
    limit: number;
    userIds?: string[];
  },
  deps: RunStrandedRecoveryDeps = {}
): Promise<RunStrandedRecoveryResult> {
  const { adminId, limit } = params;
  const scan = deps.scan ?? scanStrandedMembers;
  const pay = deps.pay ?? payOpenInvoiceAsPastDueAdmin;
  const adminObjId = new mongoose.Types.ObjectId(adminId);

  // 1. Acquire the global mutex atomically (same pattern + same lock as charge-past-due).
  const now = new Date();
  const lockedUntil = new Date(now.getTime() + 30 * 60 * 1000);
  await ChargeJobLock.findOneAndUpdate(
    { _id: RECOVER_LOCK_ID, $or: [{ isLocked: { $ne: true } }, { lockedUntil: { $lte: now } }] },
    { $set: { isLocked: true, lockedUntil, lockedBy: adminObjId, lockedAt: now } },
    { new: true, upsert: true }
  ); // E11000 (lock held) bubbles to the route → 409

  // ChargeJobRun creation lives INSIDE the try so a create failure still releases the lock (I-1).
  let chargeRunId: mongoose.Types.ObjectId | null = null;
  const rows: Array<PastDueChargeResultRow & { subscriptionId: string }> = [];
  let succeeded = 0,
    failed = 0,
    skipped = 0,
    revenueCents = 0;

  try {
    const run = await ChargeJobRun.create({
      adminId: adminObjId,
      kind: "recover",
      startedAt: new Date(),
      status: "running",
      totals: { eligibleCount: 0 },
    });
    chargeRunId = run._id as mongoose.Types.ObjectId;
    const runId = chargeRunId; // non-null binding for use below

    // 2. Re-scan LIVE (authoritative; never trust a stale preview before charging).
    let worklist = (await scan()).filter((r) => r.classification === "RECOVERABLE");
    const seen = new Set<string>();
    worklist = worklist.filter((r) => (seen.has(r.userId) ? false : (seen.add(r.userId), true)));
    if (params.userIds?.length) worklist = worklist.filter((r) => params.userIds!.includes(r.userId));
    worklist = worklist.slice(0, limit);

    await ChargeJobRun.updateOne({ _id: runId }, { $set: { "totals.eligibleCount": worklist.length } });

    for (const row of worklist) {
      try {
        // 3. Void stale opens (idempotency-keyed; tolerate already-void). Audit each.
        for (const openId of row.staleOpenIds) {
          try {
            await stripe.invoices.voidInvoice(openId, undefined, { idempotencyKey: buildRecoveryVoidIdempotencyKey(openId) });
            await logRecoveryStep({ invoiceId: openId, customerId: row.customerId, userId: row.userId, adminId, amount: row.amountCents, chargeRunId: runId, step: "void", message: "Voided stale open cycle invoice" });
          } catch (e) {
            if (e instanceof Stripe.errors.StripeError && /already.*void|no longer/i.test(e.message)) {
              await logRecoveryStep({ invoiceId: openId, customerId: row.customerId, userId: row.userId, adminId, amount: row.amountCents, chargeRunId: runId, step: "void", message: "Already void; skipped" });
            } else {
              throw e;
            }
          }
        }
        // 4. Dispose of superseded held drafts (best-effort). Subscription-created drafts CANNOT be
        //    deleted (Stripe 400 "You can't delete invoices created by subscriptions"); the only
        //    supported disposal is finalize → void. We finalize with auto_advance:false so Stripe
        //    never auto-attempts payment between finalize and void (held keep_as_draft invoices
        //    already carry auto_advance:false; we set it explicitly to be safe). Voiding writes off
        //    the superseded cycle, exactly like voiding a stale open. A failure here never blocks
        //    paying the current draft.
        for (const draftId of row.supersededDraftIds) {
          try {
            try {
              await stripe.invoices.finalizeInvoice(
                draftId,
                { auto_advance: false },
                { idempotencyKey: buildRecoveryFinalizeIdempotencyKey(draftId) }
              );
            } catch (finErr) {
              // Already finalized/open/void from a prior run → fall through to the void attempt.
              if (!(finErr instanceof Stripe.errors.StripeError)) throw finErr;
            }
            await stripe.invoices.voidInvoice(draftId, undefined, { idempotencyKey: buildRecoveryVoidIdempotencyKey(draftId) });
            await logRecoveryStep({ invoiceId: draftId, customerId: row.customerId, userId: row.userId, adminId, amount: row.amountCents, chargeRunId: runId, step: "void", message: "Voided superseded held draft (finalize→void; subscription drafts can't be deleted)" });
          } catch (e) {
            if (e instanceof Stripe.errors.StripeError && /already.*void|no longer/i.test(e.message)) {
              await logRecoveryStep({ invoiceId: draftId, customerId: row.customerId, userId: row.userId, adminId, amount: row.amountCents, chargeRunId: runId, step: "void", message: "Superseded draft already void; skipped" });
            } else {
              console.error(`[recover-stranded] dispose superseded draft ${draftId} failed:`, e);
            }
          }
        }
        // 5. Finalize the current draft → open.
        if (!row.currentDraftId) {
          skipped++;
          rows.push({ invoiceId: "", customerId: row.customerId, userId: row.userId, userEmail: row.email, status: "skipped", skipReason: "no_current_draft", amount: row.amountCents, subscriptionId: row.subscriptionId });
          continue;
        }
        const finalized = await stripe.invoices.finalizeInvoice(
          row.currentDraftId,
          { expand: ["payment_intent"] },
          { idempotencyKey: buildRecoveryFinalizeIdempotencyKey(row.currentDraftId) }
        );
        await logRecoveryStep({ invoiceId: row.currentDraftId, customerId: row.customerId, userId: row.userId, adminId, amount: row.amountCents, chargeRunId: runId, step: "finalize", message: `Finalized current-cycle draft; status=${finalized.status}` });

        // 6. Resolve payment method.
        const customer = await fetchCustomerWithRetry(row.customerId);
        const cws = customer as (Stripe.Customer & { invoice_settings?: { default_payment_method?: string | Stripe.PaymentMethod } }) | null;
        const dpm = cws?.invoice_settings?.default_payment_method;
        const customerDefaultPmId = typeof dpm === "string" ? dpm : dpm?.id ?? null;
        const paymentMethodId = resolveInvoicePaymentMethodId(finalized, customerDefaultPmId);
        if (!paymentMethodId) {
          skipped++;
          rows.push({ invoiceId: finalized.id ?? "", customerId: row.customerId, userId: row.userId, userEmail: row.email, status: "skipped", skipReason: "no_payment_method", amount: row.amountCents, subscriptionId: row.subscriptionId });
          continue;
        }
        // 7. Pay. bypassRecentAttemptLock:true so a prior 6h-window attempt on this invoice
        //    (another run / the normal charger) doesn't gate this deliberate admin recovery.
        //    Double-charge safety rests on the paid != draft structural guard + Stripe
        //    idempotency (admin-charge-${finalizedId}), NOT on this lock.
        const payRow = await pay({
          invoice: finalized,
          paymentMethodId,
          customerId: row.customerId,
          user: { _id: new mongoose.Types.ObjectId(row.userId), email: row.email },
          adminId,
          chargeRunId: runId,
          bypassRecentAttemptLock: true,
          // Stable key on the freshly-finalized invoice id: it is unique per recovery,
          // so this never collides across runs; stability only dedupes a retried pay of
          // this same new invoice. (Not the bare-invoice replay trap — see past-due-charge-idempotency.ts.)
          idempotencyKey: buildAdminChargeIdempotencyKey(finalized.id ?? row.currentDraftId ?? ""),
        });
        if (payRow.status === "success") {
          succeeded++;
          revenueCents += row.amountCents;
        } else if (payRow.status === "failed") failed++;
        else skipped++;
        rows.push({ ...payRow, subscriptionId: row.subscriptionId });
      } catch (memberErr) {
        failed++;
        rows.push({ invoiceId: row.currentDraftId ?? "", customerId: row.customerId, userId: row.userId, userEmail: row.email, status: "failed", error: memberErr instanceof Error ? memberErr.message : String(memberErr), amount: row.amountCents, subscriptionId: row.subscriptionId });
      }
      // No inter-member sleep: the loop is fully serial (never >1 in-flight Stripe call), so
      // peak rate is ~3-5 req/s — far under Stripe's ~100 req/s live limit. A sleep here only
      // burned wall-clock against the 300s function cap.
    }

    // Aggregate authoritative totals (typed skip breakdown) from the per-member rows (M-1).
    const aggregationRows: ChargeLogRowForAggregation[] = rows.map((r) => ({ status: r.status, amount: r.amount ?? 0, skipReason: r.skipReason }));
    const finalTotals = aggregateRunTotals(aggregationRows, worklist.length);
    await ChargeJobRun.updateOne({ _id: runId }, { $set: { finishedAt: new Date(), status: "completed", totals: finalTotals } });
  } catch (err) {
    if (chargeRunId) {
      await ChargeJobRun.updateOne({ _id: chargeRunId }, { $set: { finishedAt: new Date(), status: "failed", error: err instanceof Error ? err.message : String(err) } });
    }
    throw err;
  } finally {
    await ChargeJobLock.findByIdAndUpdate(RECOVER_LOCK_ID, { isLocked: false });
  }

  return { chargeRunId: chargeRunId ? String(chargeRunId) : "", attempted: rows.length, succeeded, failed, skipped, revenueCents, rows };
}
