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
 * Each worklist item is routed pay-vs-recover (`decideBulkChargeAction`): live
 * invoices go through `payOpenInvoiceAsPastDueAdmin`, while stranded ones —
 * retries exhausted and every PaymentIntent canceled, which `invoices.pay`
 * rejects with "This invoice can no longer be paid" — go through
 * `recoverStrandedPastDueInvoice` (void original → finalize held draft → pay),
 * mirroring the per-user chargeOrRecover composition. See
 * docs/CHARGE_PAST_DUE_CUSTOMERS.md § "Stranded invoices in the bulk run".
 *
 * That up-front decision cannot be complete on its own: an exhausted invoice can
 * still carry a stale `invoice_payment` reading `status: "open"`, which routes it to
 * pay — and then `invoices.pay` cancels that PaymentIntent itself and rejects with
 * `payment_intent_unexpected_state` without ever reaching the issuer. So the pay
 * branch ALSO re-routes post-hoc: the primitive hands such an invoice back
 * unlogged (`deferUnpayableToCaller`) and the item goes through
 * `recoverWorklistItem` in the same run. Either way exactly one run-tagged row is
 * written per worklist item.
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
import { findLatestBlockByFingerprint } from "@/services/allowlist/blockedTransactionRepo";
import { shouldCooldownForExcessiveRetry } from "./chargeOrRecoverPolicy";
import {
  reconcileAllowlistFromBlocked,
  type ReconcileSummary,
} from "@/services/allowlist/reconcileAllowlistFromBlocked";
import {
  SKIP_REASON_STRANDED_NEEDS_RECOVERY,
  getCustomerDefaultPaymentMethodFromInvoice,
  payOpenInvoiceAsPastDueAdmin,
  resolveInvoicePaymentMethodId,
} from "@/server/admin/chargePastDueShared";
import {
  decideBulkChargeAction,
  summarizeBulkRecoveryOutcome,
} from "@/server/admin/chargeOrRecoverPolicy";
import { recoverStrandedPastDueInvoice } from "@/server/admin/recoverStrandedPastDue";
import { resolveInvoiceSubId } from "@/server/admin/chargePastDueSelectionPolicy";
import {
  acquireRecoveryClaim,
  releaseRecoveryClaim,
} from "@/utils/payment/recovery/recovery-claim";
import { buildBulkChargeIdempotencyKey } from "@/server/admin/past-due-charge-idempotency";
import {
  ORPHAN_RUN_THRESHOLD_MS,
  aggregateRunTotals,
  type ChargeLogRowForAggregation,
} from "@/server/admin/charge-past-due-totals";
import { classifySkipReasonFromMessage } from "@/utils/admin/chargeSkipReasons";
import { RECOVERY_DECLINE_CODES } from "@/utils/admin/chargeDeclineReasons";

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
  /** Phase 0 sweep summary. Absent if the run was empty or the sweep threw. */
  allowlist?: ReconcileSummary;
}

export interface ChargeChunkResult {
  runId: string;
  total: number;
  processed: number;
  processedThisChunk: number;
  done: boolean;
  totals: ChargeJobRunTotals;
}

/**
 * Best-effort map a skip log's errorMessage back to a skip-bucket reason. Delegates to
 * the shared pure classifier so the run bucketer, the totals aggregator, and the admin
 * drawer all agree (recognizes no_held_draft + awaiting_retry).
 */
const classifySkipReason = classifySkipReasonFromMessage;

/**
 * Recompute authoritative totals for a run from its persisted InvoiceChargeLog rows.
 *
 * Rows are restricted to WORKLIST invoice ids — exactly one outcome row per item.
 * The recovery flow's run-tagged pay row lives on the NEW (recovered) invoice id and
 * must not double-count the member's outcome/revenue. Falls back to unrestricted when
 * the worklist doc is gone (legacy runs past the 7-day worklist TTL — those predate
 * the recover branch, so all their rows are worklist-keyed anyway).
 */
async function recomputeTotalsFromLogs(
  runId: mongoose.Types.ObjectId,
  eligibleCount: number
): Promise<ChargeJobRunTotals> {
  const [worklistDoc, rows] = await Promise.all([
    ChargeJobWorklist.findOne({ runId }).select({ "items.invoiceId": 1 }).lean(),
    InvoiceChargeLog.find({ chargeRunId: runId })
      .select({ invoiceId: 1, status: 1, amount: 1, errorMessage: 1 })
      .lean(),
  ]);
  const worklistIds = worklistDoc
    ? new Set((worklistDoc.items ?? []).map((i) => i.invoiceId))
    : null;
  const scoped = worklistIds ? rows.filter((r) => worklistIds.has(r.invoiceId)) : rows;
  const aggRows: ChargeLogRowForAggregation[] = scoped.map((r) => ({
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

    // PHASE 0 — allowlist eligible blocked cards for THIS run's customers before
    // any chunk charges them. Best-effort: a sweep failure must never abort the
    // run (allowlisting is an optimization, collection is the job). Runs inside
    // the lock; bounded by the run's blocked-and-not-yet-allowlisted subset.
    let allowlist: ReconcileSummary | undefined;
    try {
      const stripeCustomerIds = Array.from(
        new Set(worklistItems.map((i) => i.customerId).filter(Boolean))
      );
      allowlist = await reconcileAllowlistFromBlocked(
        { kind: "customers", stripeCustomerIds },
        { performedByUserId: new mongoose.Types.ObjectId(adminId) }
      );
    } catch (sweepErr) {
      console.error(
        `[chargePastDue] Phase 0 allowlist sweep failed for run ${String(runId)}:`,
        sweepErr instanceof Error ? sweepErr.message : sweepErr
      );
    }

    return { runId: String(runId), total: worklistItems.length, done: false, allowlist };
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

/**
 * Route ONE worklist item through the stranded-recovery flow and write the single
 * run-tagged summary row for it.
 *
 * Reached two ways: `decideBulkChargeAction` said "recover" up front, OR the pay
 * attempt came back `stranded_needs_recovery` (Stripe refused the invoice as not
 * directly payable with no retry pending — see `payOpenInvoiceAsPastDueAdmin`'s
 * `deferUnpayableToCaller`). Both write exactly one row, so the chunk loop's
 * `remaining` computation and the run totals stay correct either way.
 */
async function recoverWorklistItem(
  item: { invoiceId: string; customerId: string; userId: mongoose.Types.ObjectId; amount: number },
  invoice: Stripe.Invoice,
  adminId: string,
  runId: mongoose.Types.ObjectId
): Promise<void> {
  // Exactly ONE run-tagged row per item, keyed on the ORIGINAL worklist invoice
  // id — the chunk loop's `remaining` computation and the (worklist-scoped) run
  // totals key on it. The recovery's step-audit rows are untagged and its pay
  // row on the NEW invoice id is run-tagged but outside the worklist, so
  // neither double-counts the member.
  const logRecoverySummary = async (summary: {
    status: "success" | "failed" | "skipped";
    errorMessage: string;
    amount: number;
    newInvoiceId?: string;
    errorCode?: string;
  }): Promise<void> => {
    await InvoiceChargeLog.create({
      invoiceId: item.invoiceId,
      customerId: item.customerId,
      userId: item.userId,
      adminId: new mongoose.Types.ObjectId(adminId),
      status: summary.status,
      amount: summary.amount,
      attemptedAt: new Date(),
      errorMessage: summary.errorMessage,
      // Synthetic code for outcomes Stripe gives us no decline code for, so the admin
      // decline views bucket them instead of showing `unknown`. Only ever set where no
      // coded twin row exists — see src/utils/admin/chargeDeclineReasons.ts.
      ...(summary.errorCode ? { errorCode: summary.errorCode } : {}),
      result: {
        recovery: {
          bulk: true,
          originalInvoiceId: item.invoiceId,
          ...(summary.newInvoiceId ? { newInvoiceId: summary.newInvoiceId } : {}),
        },
      },
      chargeRunId: runId,
    });
  };

  // Per-subscription RecoveryClaim — serializes against the member Pay-Now /
  // renew / Force-Charge recovery flows AND against a concurrent chunk touching
  // the same member, so two entries can never finalize+pay two DIFFERENT held
  // drafts for one subscription (the double-charge the claim exists to prevent;
  // same precedent as forceChargePastDue). Claim held → skip, retried next run.
  const subscriptionId = resolveInvoiceSubId(
    invoice as Stripe.Invoice & {
      subscription?: string | Stripe.Subscription | null;
      parent?: { subscription_details?: { subscription?: string | null } | null } | null;
    }
  );
  if (!subscriptionId) {
    await logRecoverySummary({
      status: "skipped",
      amount: invoice.amount_remaining || item.amount,
      errorMessage: "Skipped: recovery has no resolvable subscription id on the invoice",
    });
    return;
  }
  const claimed = await acquireRecoveryClaim(subscriptionId, `bulk-charge:${String(runId)}`);
  if (!claimed) {
    await logRecoverySummary({
      status: "skipped",
      amount: invoice.amount_remaining || item.amount,
      errorMessage:
        "Skipped: another recovery for this subscription is in progress (recovery claim held)",
    });
    return;
  }
  try {
    // bypassRecentRecoveryLock: FALSE — deliberately unlike the admin-click
    // paths. The 6h hasRecentRecoveryAttempt guard on the ORIGINAL invoice
    // stays active, so a crash-resumed chunk or a same-day re-run cannot start
    // a SECOND recovery that would pick a sibling held draft with fresh
    // idempotency keys (the double-charge path). The recovery's internal pay
    // no longer self-blocks without the bypass because the pay primitive's 6h
    // check excludes recovery step-audit rows. The deferred (post-pay) entry
    // point is safe here too: the deferred pay attempt writes NO row at all,
    // let alone a recovery-tagged one, so it cannot self-block this call.
    const recovery = await recoverStrandedPastDueInvoice({
      userId: String(item.userId),
      originalInvoiceId: item.invoiceId,
      adminId,
      bypassRecentRecoveryLock: false,
      chargeRunId: runId,
      // Enable the no_held_draft re-bill in the BULK run so every stranded member is collected (or
      // gets a notifying decline) instead of being skipped. The bulk already holds this sub's
      // RecoveryClaim (above), so the mint reuses it (skipClaim) rather than self-deadlocking.
      mintCurrentCycleIfNoDraft: true,
      callerHoldsRecoveryClaim: true,
    });
    await logRecoverySummary(
      summarizeBulkRecoveryOutcome(recovery, invoice.amount_remaining || item.amount)
    );
  } catch (err) {
    await logRecoverySummary({
      status: "failed",
      amount: invoice.amount_remaining || item.amount,
      errorMessage: `Unexpected error during recovery: ${err instanceof Error ? err.message : String(err)}`,
      // Machinery fault, not a card outcome — but it IS the member's only row, so give
      // it a named bucket rather than letting it read as an unexplained decline.
      errorCode: RECOVERY_DECLINE_CODES.recoveryError,
    });
  } finally {
    await releaseRecoveryClaim(subscriptionId).catch(() => {});
  }
}

/**
 * Fingerprint of the card this invoice will actually charge, or null.
 *
 * Reads only from the already-expanded objects on the retrieved invoice, so it
 * costs no extra Stripe call. Returns null when the resolved payment method was
 * not among the expanded candidates — callers must treat null as "unknown" and
 * proceed with the charge rather than assuming anything.
 */
function resolveChargedCardFingerprint(
  invoice: Stripe.Invoice,
  paymentMethodId: string
): string | null {
  const candidates: Stripe.PaymentMethod[] = [];

  if (invoice.default_payment_method && typeof invoice.default_payment_method !== "string") {
    candidates.push(invoice.default_payment_method as Stripe.PaymentMethod);
  }

  const customer = invoice.customer;
  if (customer && typeof customer !== "string" && !(customer as Stripe.DeletedCustomer).deleted) {
    const pm = (customer as Stripe.Customer).invoice_settings?.default_payment_method;
    if (pm && typeof pm !== "string") candidates.push(pm as Stripe.PaymentMethod);
  }

  for (const pm of candidates) {
    if (pm?.id === paymentMethodId) return pm.card?.fingerprint ?? null;
  }
  return null;
}

/** Charge a single worklist item: retrieve fresh invoice, resolve PM, delegate to the primitive. */
async function chargeWorklistItem(
  item: { invoiceId: string; customerId: string; userId: mongoose.Types.ObjectId; amount: number },
  adminId: string,
  runId: mongoose.Types.ObjectId
): Promise<void> {
  let invoice: Stripe.Invoice;
  try {
    // `payments` is expanded so decideBulkChargeAction can tell a truly unpayable
    // invoice (every PaymentIntent canceled) from an exhausted-but-payable one.
    invoice = (await stripe.invoices.retrieve(item.invoiceId, {
      // The two payment-method paths are expanded so the charged card's
      // fingerprint is available for the Stripe excessive-retry cooldown check
      // below WITHOUT an extra paymentMethods.retrieve per worklist item.
      expand: [
        "customer",
        "payments",
        "default_payment_method",
        "customer.invoice_settings.default_payment_method",
      ],
    })) as Stripe.Invoice;
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

  // Pay-vs-recover branch (the bulk counterpart of the per-user chargeOrRecover).
  // A stranded invoice — retries exhausted AND no payable invoice_payment left —
  // is guaranteed to be rejected by `stripe.invoices.pay()` ("This invoice can no
  // longer be paid", no charge ever reaches the card), so route it through the
  // stranded-recovery primitive instead: void the original, finalize the held
  // current-cycle draft, pay that. The branch runs BEFORE payment-method
  // resolution because recovery resolves its own PM from the customer.
  const decision = decideBulkChargeAction(invoice);
  if (decision.kind === "recover") {
    await recoverWorklistItem(item, invoice, adminId, runId);
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

  // ---- Stripe excessive-retry cooldown ----------------------------------------
  // Stripe blocks a card with `previously_declined_do_not_retry` based on prior
  // retry velocity, the Radar allow list cannot override it (confirmed by Stripe
  // support), and it decays on its own. Re-charging inside the window collects
  // nothing AND feeds the signal that caused the block, so sit the card out.
  //
  // Scoped to the exact CARD, never the customer: a member who has since added a
  // new card has a different fingerprint and is charged immediately. Radar-type
  // blocks are excluded too — the allow list genuinely fixes those.
  //
  // Fails OPEN: any lookup error falls through to a normal charge attempt. We
  // would rather retry once too often than silently stop collecting.
  try {
    const chargedFingerprint = resolveChargedCardFingerprint(invoice, paymentMethodId);
    if (chargedFingerprint) {
      const cooldown = shouldCooldownForExcessiveRetry({
        latestBlock: await findLatestBlockByFingerprint(chargedFingerprint),
        currentFingerprint: chargedFingerprint,
        now: new Date(),
      });
      if (cooldown.cooldown) {
        const days = cooldown.daysRemaining;
        await InvoiceChargeLog.create({
          invoiceId: item.invoiceId,
          customerId: item.customerId,
          userId: item.userId,
          adminId: new mongoose.Types.ObjectId(adminId),
          status: "skipped",
          amount: invoice.amount_remaining || item.amount,
          attemptedAt: new Date(),
          // Phrase is load-bearing: classifySkipReasonFromMessage buckets on it.
          errorMessage: `Skipped: excessive_retry_cooldown — Stripe is blocking this card after repeated attempts. Retry in ${days} day${days === 1 ? "" : "s"}.`,
          chargeRunId: runId,
        });
        return;
      }
    }
  } catch (err) {
    console.error(
      `[chargePastDue] do-not-retry cooldown check failed for ${item.invoiceId}; charging anyway:`,
      err
    );
  }

  // The primitive writes its own InvoiceChargeLog row and runs all guards. Wrap it so an
  // UNEXPECTED throw (non-Stripe, e.g. a transient DB error) still produces a row — otherwise
  // the item would stay in `remaining` forever and the client chunk loop could never finish.
  try {
    const payResult = await payOpenInvoiceAsPastDueAdmin({
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
      // Let the primitive hand back an unpayable-and-exhausted invoice WITHOUT logging,
      // so we can recover it in this run rather than next run's. `decideBulkChargeAction`
      // can only see the invoice BEFORE the call, and the state that makes it
      // recover-eligible is created by the call itself — so this post-hoc reroute is the
      // only place the two can agree. Population is unchanged (these reached recovery a
      // day later regardless); the member just stops losing that day.
      deferUnpayableToCaller: true,
    });
    if (payResult.skipReason === SKIP_REASON_STRANDED_NEEDS_RECOVERY) {
      // No row was written for the pay attempt, so the recovery summary remains the
      // single run-tagged row for this worklist item. `invoice` is intentionally the
      // pre-call object: recovery re-retrieves what it needs, and only the subscription
      // id + amount are read from here — neither is changed by the failed call.
      await recoverWorklistItem(item, invoice, adminId, runId);
    }
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
      // Count logged WORKLIST items only — `loggedIds` may also contain the recovery
      // pay rows' NEW invoice ids, which are not worklist items.
      processed: items.length - remaining.length,
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
