/**
 * Cron-free CHUNKED bulk past-due charge job.
 *
 * The legacy flow charged all ~800 invoices inside one HTTP request and overran
 * Vercel's 300s cap (leaving runs stuck "running" and money half-collected). This
 * splits the run across many short client-driven requests:
 *
 *   start  → acquire the global lock, snapshot the eligible worklist ONCE
 *            (one Stripe list pass, no charging), create the ChargeJobRun.
 *   chunk  → charge the next N worklist invoices that don't yet have an
 *            InvoiceChargeLog row for this run, renew the lock, recompute live
 *            totals from logs; finalize + release the lock when the worklist is
 *            drained.
 *
 * Resumability/double-charge safety comes entirely from the existing per-invoice
 * primitive `payOpenInvoiceAsPastDueAdmin` (30s debounce, 6h recent-attempt lock,
 * late still-past-due re-check, already-paid catch, plus a RUN-SCOPED Stripe
 * idempotency key `admin-charge-${invoiceId}-run-${runId}`). A killed chunk resumes
 * from the unlogged remainder; re-touching an already-logged invoice is skipped, and
 * the run-scoped key is the in-run backstop. The key is deliberately scoped to the
 * run (not a bare `admin-charge-${invoiceId}`): Stripe replays a stable key for 24h
 * without re-charging, so a bare key turned every <24h re-run into a replay of the
 * prior decline (incident 2026-06-29 — 668 "failed", $0). See docs/CHARGE_PAST_DUE_CUSTOMERS.md.
 */

import mongoose from "mongoose";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import ChargeJobLock from "@/models/ChargeJobLock";
import ChargeJobRun, { type ChargeJobRunTotals } from "@/models/ChargeJobRun";
import ChargeJobWorklist from "@/models/ChargeJobWorklist";
import InvoiceChargeLog from "@/models/InvoiceChargeLog";
import { previewChargePastDueInvoices } from "@/services/admin/previewChargePastDueInvoices";
import {
  getCustomerDefaultPaymentMethodFromInvoice,
  payOpenInvoiceAsPastDueAdmin,
  resolveInvoicePaymentMethodId,
} from "@/server/admin/chargePastDueShared";
import { buildBulkChargeIdempotencyKey } from "@/server/admin/past-due-charge-idempotency";
import {
  ORPHAN_RUN_THRESHOLD_MS,
  aggregateRunTotals,
  type ChargeLogRowForAggregation,
} from "@/server/admin/charge-past-due-totals";

const LOCK_ID = "charge-job-lock";
const LOCK_WINDOW_MS = 30 * 60 * 1000; // 30 min — renewed each chunk.

/** Default invoices charged per chunk request. Sized so a chunk finishes far under 300s. */
export const DEFAULT_CHUNK_SIZE = 30;
export const MAX_CHUNK_SIZE = 60;

/** Sub-batch within a chunk — mirrors the legacy 15-parallel / 500ms throttle. */
const SUB_BATCH_SIZE = 15;
const SUB_BATCH_DELAY_MS = 500;

export class ChargeJobLockedError extends Error {
  constructor() {
    super("Another bulk charge/recover is already running.");
    this.name = "ChargeJobLockedError";
  }
}

export interface StartChargeJobResult {
  runId: string;
  total: number;
  /** True when there was nothing eligible — the run is finalized immediately. */
  done: boolean;
}

export interface ChargeChunkResult {
  runId: string;
  total: number;
  processed: number;
  processedThisChunk: number;
  done: boolean;
  totals: ChargeJobRunTotals;
}

/** Best-effort map a skip log's errorMessage back to a skip-bucket reason. */
function classifySkipReason(errorMessage?: string | null): string | undefined {
  if (!errorMessage) return undefined;
  const m = errorMessage.toLowerCase();
  if (m.includes("already paid")) return "already_paid";
  if (m.includes("no longer past_due") || m.includes('not past_due') || m.includes('no_longer_past_due')) return "no_longer_past_due";
  if (m.includes("payment method")) return "missing_payment_method";
  if (m.includes("window") || m.includes("debounce") || m.includes("within last")) return "recently_attempted";
  return undefined; // → "other" bucket
}

/** Recompute authoritative totals for a run from its persisted InvoiceChargeLog rows. */
async function recomputeTotalsFromLogs(
  runId: mongoose.Types.ObjectId,
  eligibleCount: number
): Promise<ChargeJobRunTotals> {
  const rows = await InvoiceChargeLog.find({ chargeRunId: runId })
    .select({ status: 1, amount: 1, errorMessage: 1 })
    .lean();
  const aggRows: ChargeLogRowForAggregation[] = rows.map((r) => ({
    status: r.status,
    amount: r.amount ?? 0,
    skipReason: classifySkipReason(r.errorMessage),
  }));
  return aggregateRunTotals(aggRows, eligibleCount);
}

/**
 * Finalize any `running` ChargeJobRun aged past the orphan threshold: recompute
 * its real totals from logs and mark it `aborted`. Mirrors fix-stuck-charge-jobs.ts
 * but runs inline at the next kickoff so the history self-heals.
 */
async function sweepOrphanRuns(): Promise<void> {
  const cutoff = new Date(Date.now() - ORPHAN_RUN_THRESHOLD_MS);
  const orphans = await ChargeJobRun.find({ status: "running", startedAt: { $lt: cutoff } })
    .select({ _id: 1, totals: 1 })
    .lean();
  for (const run of orphans) {
    const totals = await recomputeTotalsFromLogs(
      run._id as mongoose.Types.ObjectId,
      run.totals?.eligibleCount ?? 0
    );
    await ChargeJobRun.updateOne(
      { _id: run._id, status: "running" },
      {
        $set: {
          status: "aborted",
          finishedAt: new Date(),
          totals,
          error: "Aborted by orphan sweep — exceeded lock window without finalize (totals recomputed from logs)",
        },
      }
    );
  }
}

async function releaseLock(): Promise<void> {
  await ChargeJobLock.findByIdAndUpdate(LOCK_ID, { isLocked: false });
}

async function renewLock(adminId: string): Promise<void> {
  await ChargeJobLock.findByIdAndUpdate(LOCK_ID, {
    isLocked: true,
    lockedUntil: new Date(Date.now() + LOCK_WINDOW_MS),
    lockedBy: new mongoose.Types.ObjectId(adminId),
    lockedAt: new Date(),
  });
}

/**
 * START a chunked bulk charge job. Acquires the global lock atomically, sweeps
 * orphaned runs, snapshots the eligible worklist (one Stripe list pass — NO
 * charging), and creates the ChargeJobRun. Throws ChargeJobLockedError (→409) if
 * another job holds the lock.
 */
export async function startChargePastDueJob(params: { adminId: string }): Promise<StartChargeJobResult> {
  const { adminId } = params;
  const now = new Date();

  // Atomic mutex acquire — unlocked-or-expired predicate + upsert; race loser E11000.
  try {
    await ChargeJobLock.findOneAndUpdate(
      { _id: LOCK_ID, $or: [{ isLocked: { $ne: true } }, { lockedUntil: { $lte: now } }] },
      {
        $set: {
          isLocked: true,
          lockedUntil: new Date(now.getTime() + LOCK_WINDOW_MS),
          lockedBy: new mongoose.Types.ObjectId(adminId),
          lockedAt: now,
        },
      },
      { new: true, upsert: true }
    );
  } catch (lockErr) {
    if ((lockErr as { code?: number })?.code === 11000) {
      throw new ChargeJobLockedError();
    }
    throw lockErr;
  }

  try {
    await sweepOrphanRuns();

    // Snapshot the eligible set ONCE (shared with the GET preview by construction).
    const preview = await previewChargePastDueInvoices();
    const worklistItems = preview.users.map((u) => ({
      invoiceId: u.invoiceId,
      customerId: u.customerId,
      userId: new mongoose.Types.ObjectId(u.userId),
      amount: u.amount,
    }));

    const run = await ChargeJobRun.create({
      adminId: new mongoose.Types.ObjectId(adminId),
      kind: "charge",
      startedAt: new Date(),
      status: "running",
      totals: { eligibleCount: worklistItems.length },
    });
    const runId = run._id as mongoose.Types.ObjectId;

    await ChargeJobWorklist.create({ runId, items: worklistItems });

    // Nothing to do — finalize immediately and release the lock.
    if (worklistItems.length === 0) {
      await ChargeJobRun.updateOne(
        { _id: runId },
        { $set: { status: "completed", finishedAt: new Date() } }
      );
      await releaseLock();
      return { runId: String(runId), total: 0, done: true };
    }

    return { runId: String(runId), total: worklistItems.length, done: false };
  } catch (err) {
    await releaseLock();
    throw err;
  }
}

/**
 * ABORT a running job (admin stopped the client loop / closed the modal). Recompute
 * real totals from logs, mark the run `aborted`, and release the lock so a re-run can
 * start immediately. Already-charged invoices are skipped on the next run (6h guard).
 */
export async function abortChargePastDueJob(params: { runId: string; adminId: string }): Promise<ChargeChunkResult> {
  const runObjId = new mongoose.Types.ObjectId(params.runId);
  const run = await ChargeJobRun.findById(runObjId).select({ status: 1, totals: 1 }).lean();
  const eligibleCount = run?.totals?.eligibleCount ?? 0;
  const totals = await recomputeTotalsFromLogs(runObjId, eligibleCount);

  if (run?.status === "running") {
    await ChargeJobRun.updateOne(
      { _id: runObjId, status: "running" },
      {
        $set: {
          status: "aborted",
          finishedAt: new Date(),
          totals,
          error: "Stopped by admin before draining the worklist (totals recomputed from logs).",
        },
      }
    );
    await releaseLock();
  }

  return {
    runId: params.runId,
    total: eligibleCount,
    processed: totals.attempted + totals.skipped.total,
    processedThisChunk: 0,
    done: true,
    totals,
  };
}

/** Charge a single worklist item: retrieve fresh invoice, resolve PM, delegate to the primitive. */
async function chargeWorklistItem(
  item: { invoiceId: string; customerId: string; userId: mongoose.Types.ObjectId; amount: number },
  adminId: string,
  runId: mongoose.Types.ObjectId
): Promise<void> {
  let invoice: Stripe.Invoice;
  try {
    invoice = (await stripe.invoices.retrieve(item.invoiceId, { expand: ["customer"] })) as Stripe.Invoice;
  } catch {
    // Invoice no longer retrievable (deleted/void). Log a skip so it counts as done.
    await InvoiceChargeLog.create({
      invoiceId: item.invoiceId,
      customerId: item.customerId,
      userId: item.userId,
      adminId: new mongoose.Types.ObjectId(adminId),
      status: "skipped",
      amount: item.amount,
      attemptedAt: new Date(),
      errorMessage: "Skipped: invoice not retrievable (deleted/void)",
      chargeRunId: runId,
    });
    return;
  }

  const customerDefaultPm = getCustomerDefaultPaymentMethodFromInvoice(invoice);
  const paymentMethodId = resolveInvoicePaymentMethodId(invoice, customerDefaultPm);
  if (!paymentMethodId) {
    await InvoiceChargeLog.create({
      invoiceId: item.invoiceId,
      customerId: item.customerId,
      userId: item.userId,
      adminId: new mongoose.Types.ObjectId(adminId),
      status: "skipped",
      amount: invoice.amount_remaining || item.amount,
      attemptedAt: new Date(),
      errorMessage: "No payment method found on invoice or customer",
      chargeRunId: runId,
    });
    return;
  }

  // The primitive writes its own InvoiceChargeLog row and runs all guards. Wrap it so an
  // UNEXPECTED throw (non-Stripe, e.g. a transient DB error) still produces a row — otherwise
  // the item would stay in `remaining` forever and the client chunk loop could never finish.
  try {
    await payOpenInvoiceAsPastDueAdmin({
      invoice,
      paymentMethodId,
      customerId: item.customerId,
      user: { _id: item.userId, email: null },
      adminId,
      chargeRunId: runId,
      // Run-scoped key: stable within this run (a resumed chunk re-touching the same
      // invoice dedupes to one charge), fresh across runs so the NEXT daily run is a
      // real retry instead of a 24h Stripe replay of this run's decline.
      idempotencyKey: buildBulkChargeIdempotencyKey(item.invoiceId, String(runId)),
    });
  } catch (err) {
    await InvoiceChargeLog.create({
      invoiceId: item.invoiceId,
      customerId: item.customerId,
      userId: item.userId,
      adminId: new mongoose.Types.ObjectId(adminId),
      status: "failed",
      amount: invoice.amount_remaining || item.amount,
      attemptedAt: new Date(),
      errorMessage: `Unexpected error during charge: ${err instanceof Error ? err.message : String(err)}`,
      chargeRunId: runId,
    });
  }
}

/**
 * Process ONE chunk of a running charge job. Charges the next `chunkSize`
 * worklist invoices without a log row for the run, renews the lock, recomputes
 * live totals, and finalizes + releases the lock when the worklist is drained.
 */
export async function processChargePastDueChunk(params: {
  runId: string;
  adminId: string;
  chunkSize?: number;
}): Promise<ChargeChunkResult> {
  const { runId, adminId } = params;
  const chunkSize = Math.min(Math.max(params.chunkSize ?? DEFAULT_CHUNK_SIZE, 1), MAX_CHUNK_SIZE);
  const runObjId = new mongoose.Types.ObjectId(runId);

  const run = await ChargeJobRun.findById(runObjId).select({ status: 1, totals: 1 }).lean();
  if (!run) throw new Error(`ChargeJobRun ${runId} not found`);

  const worklistDoc = await ChargeJobWorklist.findOne({ runId: runObjId }).lean();
  const items = worklistDoc?.items ?? [];
  const eligibleCount = run.totals?.eligibleCount ?? items.length;

  // Helper to compute progress + finalize when drained.
  const loggedIds = new Set(
    (await InvoiceChargeLog.distinct("invoiceId", { chargeRunId: runObjId })) as string[]
  );
  const remaining = items.filter((it) => !loggedIds.has(it.invoiceId));

  // Already finished (or nothing left) → finalize once and release the lock.
  if (run.status !== "running" || remaining.length === 0) {
    const totals = await recomputeTotalsFromLogs(runObjId, eligibleCount);
    if (run.status === "running") {
      await ChargeJobRun.updateOne(
        { _id: runObjId, status: "running" },
        { $set: { status: "completed", finishedAt: new Date(), totals } }
      );
      await releaseLock();
    }
    return {
      runId,
      total: items.length,
      processed: loggedIds.size,
      processedThisChunk: 0,
      done: true,
      totals,
    };
  }

  // Keep the lock alive for this chunk's work.
  await renewLock(adminId);

  const batch = remaining.slice(0, chunkSize);
  for (let i = 0; i < batch.length; i += SUB_BATCH_SIZE) {
    const sub = batch.slice(i, i + SUB_BATCH_SIZE);
    await Promise.allSettled(sub.map((it) => chargeWorklistItem(it, adminId, runObjId)));
    if (i + SUB_BATCH_SIZE < batch.length) {
      await new Promise((r) => setTimeout(r, SUB_BATCH_DELAY_MS));
    }
  }

  // Recompute live totals from logs and check whether the worklist is now drained.
  const totals = await recomputeTotalsFromLogs(runObjId, eligibleCount);
  const processed = totals.attempted + totals.skipped.total;
  const done = processed >= items.length;

  if (done) {
    await ChargeJobRun.updateOne(
      { _id: runObjId, status: "running" },
      { $set: { status: "completed", finishedAt: new Date(), totals } }
    );
    await releaseLock();
  } else {
    await ChargeJobRun.updateOne({ _id: runObjId, status: "running" }, { $set: { totals } });
  }

  return {
    runId,
    total: items.length,
    processed,
    processedThisChunk: batch.length,
    done,
    totals,
  };
}
