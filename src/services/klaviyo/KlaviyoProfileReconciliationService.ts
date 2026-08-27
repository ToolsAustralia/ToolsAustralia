import connectDB from "@/lib/mongodb";
import User, { type IUser } from "@/models/User";
import KlaviyoSyncState, { KLAVIYO_SWEEP_STATE_ID } from "@/models/KlaviyoSyncState";
import { syncUserProfileToKlaviyo } from "@/utils/integrations/klaviyo/klaviyo-profile-sync";
import {
  aggregateNetGrantsByUser,
  emptyGrantLedger,
} from "@/utils/payment/payment-event-net-queries";

/**
 * Klaviyo profile reconciliation sweep.
 *
 * WHY A SWEEP AND NOT CALL-SITE FIXES
 * -----------------------------------
 * `ensureUserProfileSynced` returns `void` and delegates to a fire-and-forget `.catch()`, so
 * the `await` at ~24 call sites is a no-op and the real HTTP request is left detached — on
 * Vercel the function can freeze once the webhook returns 200. Patching each site is
 * whack-a-mole and cannot cover the paths nobody remembered (`customer.subscription.deleted`,
 * admin PATCHes without `basicInfo`, referral / milestone / redeemable grants), nor paths not
 * yet written.
 *
 * Instead we key on `user.updatedAt`, which Mongoose maintains on EVERY mutation including a
 * raw `$inc`. Verified 2026-08-26: a customer granted entries at 22:59:17 had
 * `updatedAt = 22:59:18.916`. The database knew 1.9s later; only Klaviyo did not.
 *
 * NEVER CALL THIS FROM A PAYMENT PATH. The Klaviyo client uses a 30s timeout and Stripe
 * retries webhooks that do not return a fast 2xx — a blocking Klaviyo call on a money path
 * risks duplicate payment processing, which is strictly worse than a stale property.
 *
 * Cadence: every 5 minutes. Klaviyo's own integration guidance is "at least every 30 minutes
 * (e.g. on a cron)", and the binding rule is that sync frequency must fall inside the
 * shortest flow time delay. Production mutates ~6 users per 5 minutes, so a run costs ~12
 * Klaviyo API calls against a ~700/min steady budget.
 */

/**
 * Throttle: matches `syncMultipleUserProfilesToKlaviyo` (8 concurrent / 700ms pause).
 * Klaviyo's Get-Profiles bucket is the binding limit at ~700/min steady, and every profile
 * sync hits it once.
 */
const CONCURRENT_SYNC_LIMIT = 8;
const BATCH_DELAY_MS = 700;

/**
 * Per-invocation safety cap. Production mutates ~6 users per 5 minutes, so this is never
 * reached incrementally; it bounds a `full` page to one serverless function's budget.
 */
const DEFAULT_LIMIT = 500;

/**
 * Wall-clock budget for one run, well inside the route's `maxDuration = 60`.
 *
 * MEASURED, not guessed: a 500-user page took 66,624ms — the throttle alone is
 * `ceil(500/8) x 700ms = 44s` before any sync work. Vercel kills a function that overruns
 * `maxDuration`, and because the watermark is persisted at the END of a run, a killed run
 * would lose every sync it performed AND leave the watermark unmoved — re-selecting the same
 * page forever, never converging. That is a worse failure than the one this service fixes.
 *
 * So the loop stops at the budget and persists what it actually completed. Partial progress
 * is safe: the watermark advances only to the newest user successfully synced, so the next
 * run resumes exactly where this one stopped. The incremental case (~6 users, ~1s) never
 * comes near this.
 */
const MAX_RUN_MS = 45_000;

/**
 * Thrown per-user so `Promise.allSettled` can carry retryability out of the batch.
 * A plain Error would lose the distinction and every failure would hold the watermark.
 */
class SyncFailure extends Error {
  constructor(public readonly retryable: boolean, message: string) {
    super(message);
    this.name = "SyncFailure";
  }
}

/**
 * Above this many users still waiting AFTER a run, report a problem. A healthy backlog is
 * ~0; a number that grows run-over-run means the sweep is not keeping up. Tune after a week
 * of real readings rather than pretending this was guessed correctly first time.
 */
export const BACKLOG_ALERT_THRESHOLD = 25;

/**
 * Above this share of permanently-failing users in one batch, treat the cause as SYSTEMIC
 * (revoked key, wrong revision, account suspended) rather than bad rows — and hold the
 * watermark instead of marching past the whole population syncing nobody.
 *
 * 0.5 is deliberately loose: real data problems are a handful of profiles among hundreds,
 * while a config failure is ~100%.
 */
export const SYSTEMIC_FAILURE_RATIO = 0.5;

/** Most permanently-failed users named in one run's log line. */
export const PERMANENT_FAILURE_LOG_CAP = 10;

export interface ReconciliationResult {
  mode: "incremental" | "full";
  watermarkBefore: string;
  watermarkAfter: string;
  candidates: number;
  processed: number;
  /** Failures that may succeed later — these HOLD the watermark. */
  retryableFailures: number;
  /** Failures that will never succeed unchanged — the cursor steps past these. */
  permanentFailures: number;
  /**
   * Who they were. Stepping past a permanent failure without naming it would recreate the
   * silent-skip bug this whole service exists to remove: they vanish from the backlog count
   * (the cursor moved past them) and `klaviyoSyncedAt` stays unset with nothing pointing at
   * them. Capped so one systemic outage cannot flood the log.
   */
  permanentlyFailedSample: Array<{ id: string; email?: string; error: string }>;
  /** Users whose `updatedAt` is still beyond the watermark once this run finished. */
  backlogCount: number;
  /**
   * Users in this batch holding FEWER `accumulatedEntries` than their paid grants total.
   * Reported, never repaired — see the spec's "Out of scope" section.
   */
  entryLedgerDivergentCount: number;
  /**
   * True when the run stopped on its wall-clock budget rather than finishing its page.
   * Normal for a backfill page; a signal worth watching if it happens on an incremental run.
   */
  timeBudgetExhausted: boolean;
  durationMs: number;
}

/**
 * Where the watermark lands after a run. Never moves backwards.
 *
 * Three cases, and the distinction between the first two is the whole point:
 *
 *  - RETRYABLE failure (429, 5xx, timeout, socket) → HOLD. The next run re-covers the window,
 *    turning an outage into a delay instead of a silent permanent gap.
 *  - PERMANENT failure (hard 4xx) → ADVANCE past it. Holding for something that can never
 *    succeed is not resilience, it is a deadlock — see the 2026-08-27 incident note below.
 *  - Systemic permanent failure (most of the batch) → HOLD, because that is configuration,
 *    not data, and marching the cursor through the population would sync nobody.
 */
export function nextWatermark(
  current: Date,
  batchMaxUpdatedAt: Date | null,
  outcome: { retryableFailures: number; permanentFailures: number; processed: number }
): Date {
  // A retryable failure anywhere in the batch holds position so the next run re-covers the
  // window. This is the self-healing property: an outage becomes a delay, not a silent gap.
  if (outcome.retryableFailures > 0) return current;

  // A PERMANENT failure must NOT hold, or one bad profile pins the cursor forever. On
  // 2026-08-27 exactly that happened: a single profile returning a hard 400 (SMS-ineligible
  // phone number) froze the watermark for over an hour while the backlog sat at ~29,500.
  //
  // But blanket-advancing is its own trap: a revoked API key makes EVERY user fail
  // permanently, and marching the cursor through 57,000 users syncing none of them would be
  // far worse than stalling. So a high permanent-failure RATE is treated as systemic —
  // config, not data — and holds.
  const attempted = outcome.processed + outcome.permanentFailures;
  if (attempted > 0 && outcome.permanentFailures / attempted > SYSTEMIC_FAILURE_RATIO) {
    return current;
  }

  if (!batchMaxUpdatedAt) return current;
  return batchMaxUpdatedAt.getTime() > current.getTime() ? batchMaxUpdatedAt : current;
}

export async function runKlaviyoProfileReconciliation(
  options: { mode?: "incremental" | "full"; limit?: number; afterUpdatedAt?: Date } = {}
): Promise<ReconciliationResult> {
  const mode = options.mode ?? "incremental";
  const limit = options.limit ?? DEFAULT_LIMIT;
  const startedAt = Date.now();

  await connectDB();

  const state =
    (await KlaviyoSyncState.findById(KLAVIYO_SWEEP_STATE_ID)) ??
    (await KlaviyoSyncState.create({ _id: KLAVIYO_SWEEP_STATE_ID, watermark: new Date(0) }));

  // Cursor selection:
  //   incremental          -> the live watermark
  //   full + explicit      -> the caller's cursor (the ops backfill, paging in-process)
  //   full, no explicit    -> the ROTATING full-pass cursor
  //
  // The rotating cursor exists because a scheduled full pass that always restarted from epoch
  // would re-sync the same first page forever and never reach the rest of the population —
  // verified: two consecutive runs both began at 1970-01-01 and covered the same 50 users.
  // It is kept separate from `watermark` so a repair pass can never rewind the live cursor.
  const scheduledFullPass = mode === "full" && options.afterUpdatedAt === undefined;
  const watermarkBefore =
    mode === "incremental"
      ? state.watermark
      : options.afterUpdatedAt ?? state.fullPassCursor ?? new Date(0);

  const users = (await User.find({ updatedAt: { $gt: watermarkBefore } })
    .sort({ updatedAt: 1 })
    .limit(limit)) as IUser[];

  let processed = 0;
  let retryableFailures = 0;
  let permanentFailures = 0;
  /** Newest updatedAt the cursor may safely move to: synced users AND permanently-failed ones. */
  let batchMaxUpdatedAt: Date | null = null;
  let timeBudgetExhausted = false;
  const permanentlyFailed: Array<{ id: string; email?: string; error: string }> = [];

  // ONE aggregation for the whole batch rather than one per user — the same caching
  // convention `userToKlaviyoProfile` already uses for `targetDraw` / `cutoffDate`.
  const ledgers = await aggregateNetGrantsByUser(users.map((u) => u._id));

  for (let i = 0; i < users.length; i += CONCURRENT_SYNC_LIMIT) {
    // Stop before the platform kills us. Everything synced so far is persisted below and the
    // watermark advances to cover exactly it, so the next run resumes from here.
    if (Date.now() - startedAt > MAX_RUN_MS) {
      timeBudgetExhausted = true;
      break;
    }

    const batch = users.slice(i, i + CONCURRENT_SYNC_LIMIT);

    const results = await Promise.allSettled(
      batch.map(async (user) => {
        const ledger = ledgers.get(user._id.toString()) ?? emptyGrantLedger();

        // `syncUserProfileToKlaviyo` swallows its own errors and reports the outcome in its
        // return value — NOT checking it would make every failure look like a success and skip
        // the user forever. `retryable` decides whether the watermark holds for them.
        const sync = await syncUserProfileToKlaviyo(user, undefined, undefined, undefined, ledger);
        if (!sync.ok) {
          throw new SyncFailure(sync.retryable, sync.error ?? "Klaviyo upsert did not land");
        }

        // `{ timestamps: false }` is LOAD-BEARING: without it this write bumps `updatedAt`,
        // re-dirtying the user so the sweep re-selects them forever. Verified on Mongoose
        // 8.18.1 — the default DOES bump it.
        await User.updateOne(
          { _id: user._id },
          { $set: { klaviyoSyncedAt: new Date() } },
          { timestamps: false }
        );
      })
    );

    for (let j = 0; j < results.length; j++) {
      const outcome = results[j];
      const user = batch[j];
      const updatedAt = user.updatedAt;

      /** Let the cursor pass this user — they are either done or will never succeed. */
      const advancePast = () => {
        if (updatedAt && (!batchMaxUpdatedAt || updatedAt > batchMaxUpdatedAt)) {
          batchMaxUpdatedAt = updatedAt;
        }
      };

      if (outcome.status === "fulfilled") {
        processed++;
        advancePast();
        continue;
      }

      const reason = outcome.reason;
      const isPermanent = reason instanceof SyncFailure && !reason.retryable;

      if (isPermanent) {
        permanentFailures++;
        permanentlyFailed.push({
          id: String(user._id),
          email: user.email,
          error: (reason as SyncFailure).message,
        });
        // Step over it. `klaviyoSyncedAt` stays unset, so the profile remains findable as
        // never-synced without pinning the cursor for every other user behind it.
        advancePast();
      } else {
        retryableFailures++;
        console.error(
          `[reconcile-klaviyo-profiles] retryable sync failure for user ${user._id}:`,
          reason
        );
      }
    }

    if (i + CONCURRENT_SYNC_LIMIT < users.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  const watermarkAfter = nextWatermark(watermarkBefore, batchMaxUpdatedAt, {
    retryableFailures,
    permanentFailures,
    processed,
  });

  // Persist the watermark only for incremental runs. A `full` run is a repair pass and must
  // never rewind the live cursor.
  if (mode === "incremental") {
    state.watermark = watermarkAfter;
  }

  // A SCHEDULED full pass advances its own rotating cursor so consecutive runs march through
  // the population instead of repeating page one. When a run finds nothing left, the circuit
  // is complete and the cursor wraps to epoch to begin the next one.
  if (scheduledFullPass) {
    state.fullPassCursor = users.length === 0 ? new Date(0) : watermarkAfter;
  }
  state.lastRunAt = new Date();
  state.lastRunProcessed = processed;
  state.lastRunFailed = retryableFailures + permanentFailures;
  await state.save();

  // Backlog: how many users are still waiting after this run.
  //
  // DO NOT replace this with a field-to-field comparison such as
  //   { $expr: { $gt: [{ $subtract: ["$updatedAt", "$klaviyoSyncedAt"] }, GRACE] } }
  // MongoDB cannot serve that from any index. Explained against production on 2026-08-26 it
  // examined 56,441 documents / 0 index keys / 95ms — a full collection scan, which at a
  // 5-minute cadence is 288 collection scans a day. This form uses the `updatedAt` index the
  // selector above already needs.
  const backlogCount = await User.countDocuments({ updatedAt: { $gt: watermarkAfter } });

  // Verified 2026-08-26: 769 of 11,912 entrants have `accumulatedEntries` disagreeing with the
  // draw ledger, 598 OVERSTATED by (typically) exactly 100 — the cancellation-upsell retention
  // grant. Entries counted on the user record that sit in no draw.
  //
  // This is an entry-accounting bug, not a Klaviyo bug, and repairing it means deciding whether
  // those customers gain draw entries or lose recorded ones. Counted here so it stops being
  // invisible; fixed on its own ticket.
  //
  // Compares against PAID grants only, so a user with legitimate free entries (referral,
  // promo-link, retention, streak) will NOT trip it — only a user holding fewer entries than
  // they paid for will. It is a signal to investigate, not a defect count.
  let entryLedgerDivergentCount = 0;
  for (const user of users) {
    const ledger = ledgers.get(user._id.toString()) ?? emptyGrantLedger();
    const paidTotal =
      ledger.memberEntries + ledger.oneTimeEntries + ledger.upsellEntries + ledger.miniDrawEntries;
    if ((user.accumulatedEntries || 0) < paidTotal) entryLedgerDivergentCount++;
  }

  return {
    mode,
    watermarkBefore: watermarkBefore.toISOString(),
    watermarkAfter: watermarkAfter.toISOString(),
    candidates: users.length,
    processed,
    retryableFailures,
    permanentFailures,
    permanentlyFailedSample: permanentlyFailed.slice(0, PERMANENT_FAILURE_LOG_CAP),
    backlogCount,
    entryLedgerDivergentCount,
    timeBudgetExhausted,
    durationMs: Date.now() - startedAt,
  };
}
