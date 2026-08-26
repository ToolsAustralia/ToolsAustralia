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
 * Above this many users still waiting AFTER a run, report a problem. A healthy backlog is
 * ~0; a number that grows run-over-run means the sweep is not keeping up. Tune after a week
 * of real readings rather than pretending this was guessed correctly first time.
 */
export const BACKLOG_ALERT_THRESHOLD = 25;

export interface ReconciliationResult {
  mode: "incremental" | "full";
  watermarkBefore: string;
  watermarkAfter: string;
  candidates: number;
  processed: number;
  failed: number;
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
 * Where the watermark lands after a run.
 *
 * Advances ONLY on a fully clean run. Any failure holds position so the next run re-covers
 * the window — that is what turns a transient Klaviyo outage into a delay instead of a silent
 * permanent gap. Never moves backwards.
 */
export function nextWatermark(
  current: Date,
  batchMaxUpdatedAt: Date | null,
  failed: number
): Date {
  if (failed > 0) return current;
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
  let failed = 0;
  let batchMaxUpdatedAt: Date | null = null;
  let timeBudgetExhausted = false;

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
        await syncUserProfileToKlaviyo(user, undefined, undefined, undefined, ledger);

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
      if (outcome.status === "fulfilled") {
        processed++;
        const updatedAt = batch[j].updatedAt;
        if (updatedAt && (!batchMaxUpdatedAt || updatedAt > batchMaxUpdatedAt)) {
          batchMaxUpdatedAt = updatedAt;
        }
      } else {
        failed++;
        console.error(
          `[reconcile-klaviyo-profiles] sync failed for user ${batch[j]._id}:`,
          outcome.reason
        );
      }
    }

    if (i + CONCURRENT_SYNC_LIMIT < users.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  const watermarkAfter = nextWatermark(watermarkBefore, batchMaxUpdatedAt, failed);

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
  state.lastRunFailed = failed;
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
    failed,
    backlogCount,
    entryLedgerDivergentCount,
    timeBudgetExhausted,
    durationMs: Date.now() - startedAt,
  };
}
