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
 *
 * Safety:
 * - Dry-run available and recommended first against a fresh DB.
 * - Idempotent: `syncUserProfileToKlaviyo` upserts by email, no duplicates.
 * - Per-user try/catch so one bad row doesn't abort the run.
 * - SIGINT handler closes the Mongo connection cleanly.
 * - Respects `KLAVIYO_ENABLED=false` via the klaviyo client's internal gate
 *   (the upsert short-circuits without writing).
 *
 * Acceptance: ≥99% of active members have all 5 new properties visible in
 * Klaviyo within 24h of script completion.
 *
 * Env: .env.local must have MONGODB_URI and KLAVIYO_PRIVATE_API_KEY.
 *
 * @module scripts/backfill-klaviyo-membership-properties
 */

import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env.local") });

const DRY_RUN = process.argv.includes("--dry-run");
const INCLUDE_INACTIVE = process.argv.includes("--include-inactive");
const LIMIT_ARG = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG.split("=")[1], 10) : Infinity;
const BATCH_SIZE_ARG = process.argv.find((a) => a.startsWith("--batch-size="));
const BATCH_SIZE = BATCH_SIZE_ARG ? parseInt(BATCH_SIZE_ARG.split("=")[1], 10) : 100;
const THROTTLE_MS_ARG = process.argv.find((a) => a.startsWith("--throttle-ms="));
const THROTTLE_MS = THROTTLE_MS_ARG ? parseInt(THROTTLE_MS_ARG.split("=")[1], 10) : 100;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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

  await connectDB();

  console.log("\nBackfill Klaviyo canonical membership profile properties");
  console.log("========================================================");
  console.log(`  Mode:        ${DRY_RUN ? "DRY RUN (no Klaviyo writes)" : "LIVE"}`);
  console.log(`  Scope:       ${INCLUDE_INACTIVE ? "all users" : "isActive: true only"}`);
  console.log(`  Limit:       ${LIMIT === Infinity ? "no limit" : `${LIMIT} users`}`);
  console.log(`  Batch size:  ${BATCH_SIZE}`);
  console.log(`  Throttle:    ${THROTTLE_MS}ms between Klaviyo upserts`);
  console.log(`  KLAVIYO_ENABLED: ${process.env.KLAVIYO_ENABLED ?? "<unset> (treated as enabled)"}\n`);

  const startMs = Date.now();
  let processed = 0;
  let succeeded = 0;
  let errored = 0;

  // SIGINT cleanup — set flag, finish current user, then disconnect
  let aborted = false;
  const sigintHandler = () => {
    console.log("\n⚠️ SIGINT received — finishing current user then exiting cleanly...");
    aborted = true;
  };
  process.on("SIGINT", sigintHandler);

  const filter = INCLUDE_INACTIVE ? {} : { isActive: true };
  const query = User.find(filter);
  if (LIMIT !== Infinity) query.limit(LIMIT);
  const cursor = query.cursor({ batchSize: BATCH_SIZE });

  try {
    for await (const user of cursor) {
      if (aborted) break;
      processed++;

      try {
        if (DRY_RUN) {
          // Prove the helpers work — compute the values without writing to Klaviyo
          const status = deriveMembershipStatus(user);
          const durationMonths = computeActiveDurationMonths(user.subscription?.startDate);
          const giveaways = await countDistinctDrawsEntered(user._id);
          const breakdown = calculateEntryBreakdown(user);
          const entriesPurchased =
            breakdown.memberEntries + breakdown.oneTimeEntries + breakdown.upsellEntries + breakdown.miniDrawEntries;

          // Log first 10 as a sample so the user can spot-check before going live
          if (processed <= 10) {
            console.log(
              `[dry-run sample] ${user.email}: ` +
                `status="${status}", ` +
                `entries_purchased=${entriesPurchased}, ` +
                `giveaways_entered=${giveaways}, ` +
                `duration_months=${durationMonths ?? "null"}`
            );
          }
          succeeded++;
        } else {
          await syncUserProfileToKlaviyo(user);
          succeeded++;
          await sleep(THROTTLE_MS);
        }
      } catch (err) {
        errored++;
        console.error(`Error processing user ${user.email} (${user._id}):`, err);
      }

      // Progress log every 1000 users
      if (processed % 1000 === 0) {
        const elapsed = Date.now() - startMs;
        const rate = Math.round(processed / Math.max(elapsed / 1000, 1));
        console.log(
          `Progress: ${processed} users · ${succeeded} ok · ${errored} errored · ${rate}/sec · elapsed ${formatDuration(elapsed)}`
        );
      }
    }
  } finally {
    process.removeListener("SIGINT", sigintHandler);
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

  const mongoose = (await import("mongoose")).default;
  await mongoose.disconnect();

  process.exit(errored > 0 ? 2 : 0);
}

main().catch((err) => {
  console.error("Backfill aborted with unhandled error:", err);
  process.exit(1);
});
