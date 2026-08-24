/**
 * Stripe-anchored reconciler: renewals we were PAID for that granted nothing.
 *
 * WHY THIS EXISTS (incident 2026-08-23 / RC-2). Every other check in this repo
 * starts from a `BenefitsGranted` PaymentEvent:
 *   - `reconcileActiveMajorDrawEntries` (src/utils/draws/reconcile-major-draw-entries.ts)
 *   - `scripts/fix-major-draw-renewal-entries.ts`
 *   - `scripts/verify-major-draw-entries.ts`
 * They can only heal a grant row that EXISTS. A renewal that died before writing
 * one has no PaymentEvent at all, so it is not a candidate and is not counted.
 * On 2026-08-23 that was eleven members, $300.00 collected, zero entries, and
 * nothing anywhere could see it.
 *
 * This runs the join in the opposite direction — from the paid cycle to the grant
 * — so a renewal that vanished before the grant is exactly what it surfaces.
 *
 * MONGO-ONLY, DELIBERATELY. `MembershipRenewalCycle` is written from Stripe's own
 * invoice payload (`upsertRenewalCycleFromPaidInvoice`), so the paid set is
 * already local. Calling Stripe per row would reintroduce the API fan-out that
 * caused the incident (RC-3: 182 req/s against a 100 req/s account cap). A
 * controller-run reconciliation on 2026-08-23 proved the anchor is sound for that
 * window: Stripe reported 688 paid `subscription_cycle` invoices, Mongo held 693
 * cycle rows, and ZERO Stripe-paid invoices lacked a cycle row.
 *
 * WINDOW FIELD — `updatedAt`, NOT `createdAt`. These rows are UPSERTED, not
 * inserted. `upsertRenewalCycleFromFailedInvoice` creates the row with
 * `status: "failed"` at FAILURE time (from `invoice.payment_failed`,
 * handlers/index.ts:2989); a later successful retry — Stripe dunning, or
 * /api/cron/charge-past-due — flips it to "succeeded" via `findOneAndUpdate`,
 * which leaves `createdAt` pinned to the original failure date. So a renewal
 * that declined on the 24th, was recovered on the 29th, and whose grant then
 * failed would sit five days outside every window this cron ever runs:
 * permanently invisible, and precisely the past-due-recovery population this
 * spec exists to protect. Mongoose's `timestamps: true` bumps `updatedAt` on
 * BOTH the fresh insert and the failed→succeeded flip, so it is the one field
 * that covers both directions (`succeededAt` alone would miss the opposite
 * case — a webhook Stripe delivers days late).
 *
 * KNOWN LIMIT. The cycle row is written by the SAME handler that can fail —
 * `handleInvoicePaymentSucceeded` writes it at
 * `src/services/stripe-webhook-handlers/index.ts:3685`, AFTER its first Stripe
 * call at `:3507`. A failure between those two points leaves no cycle row, and
 * this reconciler cannot see it. `scripts/backfill-missing-renewal-grants.ts`
 * (Phase 0) carries an optional Stripe-side pass that closes that hole for
 * ad-hoc audits; the daily cron accepts the gap in exchange for staying off
 * Stripe's rate limiter. See docs/billing-stripe/gotchas.md.
 */

import type mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import MembershipRenewalCycle from "@/models/MembershipRenewalCycle";
import PaymentEvent from "@/models/PaymentEvent";
import StripeWebhookQueue from "@/models/StripeWebhookQueue";
import { benefitsGrantedEventId } from "@/types/payment-ledger";

/** A renewal Stripe charged and we never credited. */
export interface UngrantedRenewal {
  stripeInvoiceId: string;
  userId: string;
  amountPaidCents: number;
  chargedAt: Date;
}

/** A webhook the queue gave up on. Four of the six paths that reach here cannot self-heal. */
export interface DeadWebhookEvent {
  eventId: string;
  type: string;
  attempts: number;
  lastError: string | null;
  diedAt: Date | null;
}

export interface RenewalGrantReconciliation {
  since: string;
  until: string;
  ungranted: UngrantedRenewal[];
  ungrantedCount: number;
  ungrantedCents: number;
  dead: DeadWebhookEvent[];
  /** Total dead rows, which may exceed `dead.length` when the listing cap bites. */
  deadCount: number;
}

/**
 * How far back a scheduled run looks. Two days, so a single missed or failed run
 * still leaves the previous day's renewals covered by the next one.
 */
export const DEFAULT_LOOKBACK_HOURS = 48;

/**
 * How long a row must have been UNTOUCHED before its missing grant counts as a gap.
 *
 * The webhook queue's full retry ladder is 0 + 1m + 5m + 15m + 1h + 6h = 7h21m
 * from first attempt to last (`BACKOFF_SCHEDULE_MS` in
 * src/services/stripe-webhook-queue/backoff.ts). A renewal younger than that may
 * be legitimately mid-retry, and reporting it would make this alert cry wolf —
 * which is how a real alert gets ignored. 8h clears the ladder with margin.
 *
 * Measured from `updatedAt`, so it is self-adjusting: every retry that re-runs
 * the cycle upsert re-bumps the row and restarts the 8h clock.
 */
export const SETTLE_MARGIN_MS = 8 * 60 * 60 * 1000;

/** Cap on the dead rows listed in one response. The COUNT is never capped. */
const DEAD_LIST_LIMIT = 50;

/**
 * `PaymentEvent._id` for a renewal grant is deterministic:
 * `BenefitsGranted-invoice_<stripeInvoiceId>` — built from `invoice_${invoice.id}`
 * at handlers/index.ts:3536-3537 and from the same `paymentIntentId` at
 * payment-processing.ts:327. That determinism is what makes this an index-backed
 * anti-join rather than a scan.
 */
const GRANT_ID_PREFIX = benefitsGrantedEventId("invoice_");

interface UngrantedAggregateRow {
  stripeInvoiceId: string;
  userId: mongoose.Types.ObjectId;
  amountPaidCents: number;
  chargedAt: Date;
}

/**
 * Paid `subscription_cycle` invoices in `[since, until)` with no matching
 * `BenefitsGranted` PaymentEvent.
 *
 * Exported on its own (not just via the orchestrator) so an ops script can point
 * it at an arbitrary window — verifying a backfill, or auditing a past incident —
 * without re-deriving the join and risking a second, subtly different definition
 * of "ungranted".
 */
export async function findUngrantedRenewals(since: Date, until: Date): Promise<UngrantedRenewal[]> {
  await connectDB();

  const rows = await MembershipRenewalCycle.aggregate<UngrantedAggregateRow>([
    {
      $match: {
        // `updatedAt`, NOT `createdAt` — see the WINDOW FIELD note above. A
        // dunning-recovered renewal's createdAt is pinned to its FAILURE date.
        updatedAt: { $gte: since, $lt: until },
        // Money we kept. "failed" is not; "refunded" we gave back. "recovered"
        // has no writer today but is in the schema enum and in every other
        // paid-cycle query in the repo (MembershipAnalyticsService.ts:372,
        // refund-ledger-reversal.ts:378, backfill-membership-streaks.ts:99,
        // find-renewal-rate.ts) — matching them costs nothing and means a future
        // writer cannot silently drop rows out of this net.
        status: { $in: ["succeeded", "recovered"] },
        billingReason: "subscription_cycle",
      },
    },
    { $addFields: { grantEventId: { $concat: [GRANT_ID_PREFIX, "$stripeInvoiceId"] } } },
    {
      $lookup: {
        from: PaymentEvent.collection.name,
        localField: "grantEventId",
        // `_id` — so the lookup is a point read per candidate, not a scan.
        foreignField: "_id",
        as: "grant",
      },
    },
    { $match: { grant: { $size: 0 } } },
    {
      $project: {
        _id: 0,
        stripeInvoiceId: 1,
        userId: 1,
        // Backfilled rows can lack amountPaidCents; amountDueCents is the honest
        // stand-in for a cycle Stripe marked paid.
        amountPaidCents: { $ifNull: ["$amountPaidCents", "$amountDueCents"] },
        // `succeededAt` is always set by upsertRenewalCycleFromPaidInvoice
        // (paidAtDateFromStripeInvoice never returns null); createdAt is a
        // defensive fallback for hand-written / backfilled rows only.
        chargedAt: { $ifNull: ["$succeededAt", "$createdAt"] },
      },
    },
    { $sort: { chargedAt: 1 } },
  ]);

  return rows.map((r) => ({
    stripeInvoiceId: r.stripeInvoiceId,
    userId: String(r.userId),
    amountPaidCents: r.amountPaidCents ?? 0,
    chargedAt: r.chargedAt,
  }));
}

/**
 * Webhook rows the queue gave up on.
 *
 * NOT windowed, on purpose. Before 2026-08-24 a handler that failed silently was
 * ACKed as a success, so `dead` was effectively unreachable; Task 2 made six
 * previously-silent failure paths reach it (missing packageId, unknown package,
 * customer mismatch, non-manageable subscription status, user not found, no
 * customer) and four of those CANNOT self-heal — they need a human. Ageing such a
 * row out of the alert after 48h would recreate the same blind spot in a new
 * place, so the alert persists until the row is resolved (replayed or deleted) or
 * the 30-day TTL drops it.
 */
export async function findDeadWebhookEvents(
  limit: number = DEAD_LIST_LIMIT
): Promise<DeadWebhookEvent[]> {
  await connectDB();

  const rows = await StripeWebhookQueue.find({ status: "dead" })
    .select("eventId type attempts lastError processedAt updatedAt")
    // `updatedAt`, not `processedAt`: the orphan sweeper in
    // /api/cron/process-stripe-webhook-queue marks a row dead without setting
    // processedAt, so processedAt is not reliably present on every dead row.
    .sort({ updatedAt: -1 })
    .limit(limit)
    .lean<
      Array<{
        eventId: string;
        type: string;
        attempts?: number;
        lastError?: string | null;
        processedAt?: Date | null;
        updatedAt?: Date | null;
      }>
    >();

  return rows.map((r) => ({
    eventId: r.eventId,
    type: r.type,
    attempts: r.attempts ?? 0,
    lastError: r.lastError ?? null,
    diedAt: r.processedAt ?? r.updatedAt ?? null,
  }));
}

/**
 * One pass: ungranted renewals in the window plus every dead webhook row.
 *
 * `since`/`until` are overridable so the same code path can be pointed at a past
 * incident window; the cron passes neither and gets the settled default.
 */
export async function runRenewalGrantReconciliation(opts?: {
  since?: Date;
  until?: Date;
}): Promise<RenewalGrantReconciliation> {
  await connectDB();

  const until = opts?.until ?? new Date(Date.now() - SETTLE_MARGIN_MS);
  const since = opts?.since ?? new Date(until.getTime() - DEFAULT_LOOKBACK_HOURS * 60 * 60 * 1000);

  const [ungranted, dead, deadCount] = await Promise.all([
    findUngrantedRenewals(since, until),
    findDeadWebhookEvents(),
    StripeWebhookQueue.countDocuments({ status: "dead" }),
  ]);

  return {
    since: since.toISOString(),
    until: until.toISOString(),
    ungranted,
    ungrantedCount: ungranted.length,
    ungrantedCents: ungranted.reduce((sum, r) => sum + (r.amountPaidCents ?? 0), 0),
    dead,
    deadCount,
  };
}
