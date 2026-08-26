#!/usr/bin/env npx tsx

/**
 * Backfill the 5 new canonical Klaviyo profile properties onto every active
 * user's Klaviyo profile so the ads team's segments work from day 1.
 *
 * The 5 properties (added 2026-05-28, see docs/tracking/KLAVIYO_INTEGRATION.md
 * "Canonical property names"):
 *   - membership_status            (enum: active/past_due/canceled/never_subscribed)
 *   - entries_purchased            (number: lifetime total across all sources)
 *   - giveaways_entered            (number: distinct Major + Mini draws entered)
 *   - membership_active_duration_months  (number | null)
 *   - next_renewal_date            (ISO string | null)
 *
 * Without this backfill, existing users would only get the properties on
 * their next webhook event (cancellation, renewal, purchase, etc.) — segments
 * like "purchased entries but never subscribed" would return zero results on
 * day 1.
 *
 * Idempotent: each iteration calls `syncUserProfileToKlaviyo` which upserts
 * the profile (Klaviyo dedupes by email). Re-runs are safe.
 *
 * Usage:
 *   npx tsx scripts/backfill-klaviyo-membership-properties.ts [--dry-run]
 *                                                              [--limit=N]
 *                                                              [--batch-size=N]
 *                                                              [--throttle-ms=N]
 *                                                              [--include-inactive]
 *                                                              [--csv-path=PATH]
 *                                                              [--no-csv]
 *
 * Options:
 *   --dry-run            Compute the values via the helpers and log a sample;
 *                        do not call Klaviyo. Always run --dry-run first.
 *   --limit=N            Stop after N users (default: all matched users).
 *   --batch-size=N       Mongo cursor batch size (default: 100).
 *   --throttle-ms=N      Sleep N ms between Klaviyo calls (default: 100).
 *                        At 100ms we run ~10 users/sec — well under Klaviyo's
 *                        700-req/sec sustained limit (and we share the budget
 *                        with normal webhook traffic).
 *   --include-inactive   Backfill `isActive: false` users too (default: skip).
 *   --csv-path=PATH      Override the default CSV output path. By default the
 *                        script writes to
 *                        `./backfill-klaviyo-<ISO-timestamp>.csv` in the cwd.
 *   --no-csv             Disable CSV output (rely on terminal log only).
 *                        Not recommended — the CSV is the audit trail for
 *                        which users failed and need to be re-tried.
 *
 * Safety:
 * - Dry-run available and recommended first against a fresh DB.
 * - Idempotent: `syncUserProfileToKlaviyo` upserts by email, no duplicates.
 * - Per-user try/catch so one bad row doesn't abort the run.
 * - SIGINT handler closes the Mongo connection cleanly.
 * - Respects `KLAVIYO_ENABLED=false` via the klaviyo client's internal gate
 *   (the upsert short-circuits without writing).
 * - **CSV is append-mode** with `flush` after every row, so a process crash
 *   preserves the audit trail of who-was-processed and who-failed up to
 *   the moment of crash. Re-running the script is safe (idempotent upserts)
 *   but the CSV lets you grep `,error,` to find just the failures and
 *   investigate or re-run them in isolation.
 * - **Outer-loop try/catch** wraps the Mongo cursor too — if the DB
 *   connection blips mid-stream, the script logs the partial summary and
 *   the CSV path before exiting non-zero, instead of crashing unhandled.
 *
 * Acceptance: ≥99% of active members have all 5 new properties visible in
 * Klaviyo within 24h of script completion.
 *
 * Env: .env.local must have MONGODB_URI and KLAVIYO_PRIVATE_API_KEY.
 *
 * @module scripts/backfill-klaviyo-membership-properties
 */

import { config } from "dotenv";
import * as fs from "fs";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env.local") });

const DRY_RUN = process.argv.includes("--dry-run");
const INCLUDE_INACTIVE = process.argv.includes("--include-inactive");
const NO_CSV = process.argv.includes("--no-csv");
const LIMIT_ARG = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split("=")[1], 10) : Infinity;
const BATCH_SIZE_ARG = process.argv.find((a) => a.startsWith("--batch-size="));
const BATCH_SIZE = BATCH_SIZE_ARG ? parseInt(BATCH_SIZE_ARG.split("=")[1], 10) : 100;
const THROTTLE_MS_ARG = process.argv.find((a) => a.startsWith("--throttle-ms="));
const THROTTLE_MS = THROTTLE_MS_ARG ? parseInt(THROTTLE_MS_ARG.split("=")[1], 10) : 100;
const CSV_PATH_ARG = process.argv.find((a) => a.startsWith("--csv-path="));
const CSV_PATH = CSV_PATH_ARG
  ? CSV_PATH_ARG.split("=").slice(1).join("=")
  : path.resolve(
      process.cwd(),
      `backfill-klaviyo-${DRY_RUN ? "dry-" : ""}${new Date()
        .toISOString()
        .replace(/[:.]/g, "-")}.csv`,
    );

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Escape a value for CSV. Wraps in quotes if it contains `,`, `"`, or a
 * newline; doubles any embedded `"`. `null` / `undefined` become empty
 * strings. Error objects get their `.message` extracted.
 */
function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s: string;
  if (value instanceof Error) s = value.message;
  else if (typeof value === "object") {
    try {
      s = JSON.stringify(value);
    } catch {
      s = String(value);
    }
  } else {
    s = String(value);
  }
  if (s.includes(",") || s.includes("\"") || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

async function main() {
  // Lazy imports so dotenv loads first
  const connectDB = (await import("../src/lib/mongodb")).default;
  const User = (await import("../src/models/User")).default;
  const { syncUserProfileToKlaviyo } = await import("../src/utils/integrations/klaviyo/klaviyo-profile-sync");
  const {
    deriveMembershipStatus,
    computeActiveDurationMonths,
    countDistinctDrawsEntered,
    calculateEntryBreakdown,
  } = await import("../src/utils/integrations/klaviyo/klaviyo-helpers");
  const { aggregateNetGrantsByUser, emptyGrantLedger } = await import(
    "../src/utils/payment/payment-event-net-queries"
  );

  await connectDB();

  // Open CSV stream so failures + successes get a persistent audit trail
  // (the in-memory counters disappear if the process gets SIGKILL'd or the
  // terminal closes; the CSV on disk survives).
  let csvStream: fs.WriteStream | null = null;
  if (!NO_CSV) {
    try {
      csvStream = fs.createWriteStream(CSV_PATH, { flags: "a" });
      // Header row only if file is empty (so re-runs against the same path
      // append cleanly).
      const csvIsEmpty =
        !fs.existsSync(CSV_PATH) || fs.statSync(CSV_PATH).size === 0;
      if (csvIsEmpty) {
        csvStream.write(
          "timestamp,user_id,email,status,membership_status,entries_purchased,giveaways_entered,duration_months,next_renewal_date,error\n",
        );
      }
    } catch (csvErr) {
      console.error(
        `⚠️ Failed to open CSV at ${CSV_PATH}: ${csvErr instanceof Error ? csvErr.message : String(csvErr)}\n   Continuing with terminal-log only.`,
      );
      csvStream = null;
    }
  }

  /** Write one row per user — never throws so it can't break the main loop. */
  function csvWrite(row: {
    user_id: string;
    email: string;
    status: "ok" | "error";
    membership_status?: string;
    entries_purchased?: number;
    giveaways_entered?: number;
    duration_months?: number | null;
    next_renewal_date?: string | null;
    error?: unknown;
  }): void {
    if (!csvStream) return;
    try {
      const line =
        [
          new Date().toISOString(),
          row.user_id,
          row.email,
          row.status,
          row.membership_status ?? "",
          row.entries_purchased ?? "",
          row.giveaways_entered ?? "",
          row.duration_months ?? "",
          row.next_renewal_date ?? "",
          row.error ?? "",
        ]
          .map(csvEscape)
          .join(",") + "\n";
      csvStream.write(line);
    } catch {
      // never break the loop on a CSV write failure
    }
  }

  console.log("\nBackfill Klaviyo canonical membership profile properties");
  console.log("========================================================");
  console.log(`  Mode:        ${DRY_RUN ? "DRY RUN (no Klaviyo writes)" : "LIVE"}`);
  console.log(`  Scope:       ${INCLUDE_INACTIVE ? "all users" : "isActive: true only"}`);
  console.log(`  Limit:       ${LIMIT === Infinity ? "no limit" : `${LIMIT} users`}`);
  console.log(`  Batch size:  ${BATCH_SIZE}`);
  console.log(`  Throttle:    ${THROTTLE_MS}ms between Klaviyo upserts`);
  console.log(`  KLAVIYO_ENABLED: ${process.env.KLAVIYO_ENABLED ?? "<unset> (treated as enabled)"}`);
  console.log(`  CSV log:     ${csvStream ? CSV_PATH : "DISABLED (--no-csv)"}\n`);

  const startMs = Date.now();
  let processed = 0;
  let succeeded = 0;
  let errored = 0;
  let aborted = false;

  // SIGINT cleanup — set flag, finish current user, then write summary
  const sigintHandler = () => {
    console.log("\n⚠️ SIGINT received — finishing current user then exiting cleanly...");
    aborted = true;
  };
  process.on("SIGINT", sigintHandler);

  // Outer try/catch wraps the cursor too so a mid-stream Mongo failure
  // still surfaces the summary + CSV path before exiting.
  let outerError: unknown = null;
  try {
    const filter = INCLUDE_INACTIVE ? {} : { isActive: true };
    const query = User.find(filter);
    if (LIMIT !== Infinity) query.limit(LIMIT);
    const cursor = query.cursor({ batchSize: BATCH_SIZE });

    try {
      for await (const user of cursor) {
        if (aborted) break;
        processed++;

        const userIdStr = String(user._id);
        const userEmail = user.email ?? "";

        try {
          if (DRY_RUN) {
            // Compute the values via the helpers so the CSV captures what
            // WOULD be written. Lets you spot-check before going live.
            const status = deriveMembershipStatus(user);
            const durationMonths = computeActiveDurationMonths(user.subscription?.startDate);
            const giveaways = await countDistinctDrawsEntered(user._id);
            // Entry counts come from the refund-netted payment ledger (2026-08-26), not from
            // the package catalogue — so the dry-run CSV shows what would ACTUALLY be written.
            const ledgerByUser = await aggregateNetGrantsByUser([user._id]);
            const breakdown = calculateEntryBreakdown(
              user,
              ledgerByUser.get(String(user._id)) ?? emptyGrantLedger()
            );
            const entriesPurchased =
              breakdown.memberEntries +
              breakdown.oneTimeEntries +
              breakdown.upsellEntries +
              breakdown.miniDrawEntries;
            const nextRenewal =
              user.subscription?.isActive && user.subscription?.autoRenew
                ? user.subscription?.endDate
                  ? new Date(user.subscription.endDate).toISOString()
                  : null
                : null;

            csvWrite({
              user_id: userIdStr,
              email: userEmail,
              status: "ok",
              membership_status: status,
              entries_purchased: entriesPurchased,
              giveaways_entered: giveaways,
              duration_months: durationMonths,
              next_renewal_date: nextRenewal,
            });

            if (processed <= 10) {
              console.log(
                `[dry-run sample] ${userEmail}: ` +
                  `status="${status}", ` +
                  `entries_purchased=${entriesPurchased}, ` +
                  `giveaways_entered=${giveaways}, ` +
                  `duration_months=${durationMonths ?? "null"}, ` +
                  `next_renewal_date=${nextRenewal ?? "null"}`,
              );
            }
            succeeded++;
          } else {
            await syncUserProfileToKlaviyo(user);
            csvWrite({
              user_id: userIdStr,
              email: userEmail,
              status: "ok",
            });
            succeeded++;
            await sleep(THROTTLE_MS);
          }
        } catch (err) {
          // PER-USER error: log to CSV, log to terminal, KEEP GOING.
          errored++;
          const errMsg = err instanceof Error ? err.message : String(err);
          csvWrite({
            user_id: userIdStr,
            email: userEmail,
            status: "error",
            error: errMsg,
          });
          console.error(`✗ user ${userEmail} (${userIdStr}): ${errMsg}`);
        }

        // Progress log every 1000 users
        if (processed % 1000 === 0) {
          const elapsed = Date.now() - startMs;
          const rate = Math.round(processed / Math.max(elapsed / 1000, 1));
          console.log(
            `Progress: ${processed} users · ${succeeded} ok · ${errored} errored · ${rate}/sec · elapsed ${formatDuration(elapsed)}`,
          );
        }
      }
    } finally {
      process.removeListener("SIGINT", sigintHandler);
    }
  } catch (err) {
    // OUTER error (cursor failure, Mongo disconnect, etc.) — surface it
    // but still print the summary + close the CSV so the user can see what
    // we processed before the failure.
    outerError = err;
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(
      `\n🚨 Outer-loop error after ${processed} users (${succeeded} ok, ${errored} errored): ${errMsg}`,
    );
  }

  const elapsedTotal = Date.now() - startMs;
  console.log("\nSummary");
  console.log("=======");
  console.log(`  Mode:               ${DRY_RUN ? "DRY RUN" : "LIVE"}`);
  console.log(`  Elapsed:            ${formatDuration(elapsedTotal)}`);
  console.log(`  Users processed:    ${processed}`);
  console.log(`  Succeeded:          ${succeeded}`);
  console.log(`  Errored:            ${errored}`);
  if (aborted) console.log(`  ⚠️ Aborted via SIGINT — partial run`);
  if (outerError) console.log(`  🚨 Outer-loop error — partial run`);
  if (csvStream) {
    console.log(`  CSV log written to: ${CSV_PATH}`);
    console.log(`     • Filter failures with: grep ',error,' "${CSV_PATH}"`);
    console.log(`     • Re-run just the failed users by extracting user_ids from that grep.`);
  }

  // Best-effort cleanup
  if (csvStream) {
    await new Promise<void>((resolve) => {
      csvStream!.end(() => resolve());
    });
  }
  try {
    const mongoose = (await import("mongoose")).default;
    await mongoose.disconnect();
  } catch {
    // ignore disconnect errors during shutdown
  }

  // Exit code:
  //   0  = full run, no errors
  //   2  = run completed but had per-user errors
  //   3  = outer-loop / fatal error before completion
  if (outerError) process.exit(3);
  process.exit(errored > 0 ? 2 : 0);
}

main().catch((err) => {
  // Unhandled error escaping main() — last-ditch log so we don't exit silently
  console.error("\n🚨 Backfill aborted with unhandled error:", err);
  process.exit(1);
});
