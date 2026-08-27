/**
 * One-shot backfill: re-sync every Klaviyo profile with corrected properties.
 *
 * Runs the SAME service the cron runs, in `full` mode, in bounded pages — there is no
 * separate backfill logic to keep true. `full` mode does not touch the incremental watermark,
 * so this can run at any time without rewinding the live sweep.
 *
 * WHAT IT REPAIRS (measured against production 2026-08-26):
 *  - `member_entries` / `entries_purchased` were reconstructed from the package catalogue and
 *    wrong for 4,904 of 4,904 active members (understated x5-x14).
 *  - `lifetime_value` / `total_spent` collapsed when a membership lapsed.
 *  - `subscription_has_pending_upgrade` was `true` on all 56,360 profiles.
 *  - Five `upsell_*` properties were permanently 0 and are now cleared.
 *  - Profiles that never received a sync at all (the delivery bug) get their real entries.
 *
 * SAFETY
 *  - `--dry-run` is the DEFAULT. Pass `--live` to actually write.
 *  - Writing to production Klaviyo from a developer machine additionally requires
 *    KLAVIYO_ALLOW_DEV_PROFILE_WRITES=true. This script does NOT set it for you — that is
 *    the point of the guard.
 *  - `--prod` targets PROD_MONGODB_URI via connectOpsDb.
 *
 * Usage:
 *   npm run backfill:klaviyo-accuracy:dry -- --prod
 *   KLAVIYO_ALLOW_DEV_PROFILE_WRITES=true npm run backfill:klaviyo-accuracy -- --prod --live
 *
 * Exit codes: 0 = clean, 1 = fatal, 2 = completed with per-user failures.
 */
import fs from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import { connectOpsDb } from "./connect-ops-db";

// Must load BEFORE connectOpsDb reads MONGODB_URI / PROD_MONGODB_URI.
config({ path: path.resolve(process.cwd(), ".env.local") });

const LIVE = process.argv.includes("--live");
const PAGE_SIZE = 500;
const AUDIT_PATH = path.join(process.cwd(), "backfill-klaviyo-accuracy-audit.csv");

async function main() {
  await connectOpsDb("backfill-klaviyo-accuracy");

  const { default: User } = await import("../src/models/User");
  const { runKlaviyoProfileReconciliation } = await import(
    "../src/services/klaviyo/KlaviyoProfileReconciliationService"
  );

  const total = await User.countDocuments({});

  console.log("\n=== Klaviyo profile accuracy backfill ===");
  console.log(`mode      : ${LIVE ? "LIVE (writes to Klaviyo)" : "DRY RUN (no writes)"}`);
  console.log(`profiles  : ${total}`);
  console.log(`page size : ${PAGE_SIZE}\n`);

  if (!LIVE) {
    console.log("DRY RUN — would re-sync all profiles above in `full` mode.");
    console.log("Pass --live to write. Nothing was sent to Klaviyo.");
    process.exit(0);
  }

  if (
    process.env.KLAVIYO_MODE !== "production" &&
    process.env.KLAVIYO_ALLOW_DEV_PROFILE_WRITES !== "true"
  ) {
    console.error(
      "REFUSING: KLAVIYO_MODE is not 'production' and KLAVIYO_ALLOW_DEV_PROFILE_WRITES is not 'true'.\n" +
        "Dev and production share one Klaviyo account. Set the flag explicitly for this run if\n" +
        "you intend to write to the real Klaviyo account."
    );
    process.exit(1);
  }

  if (!fs.existsSync(AUDIT_PATH)) {
    fs.appendFileSync(
      AUDIT_PATH,
      "timestamp,page,candidates,processed,failed,budgetExhausted,cursorAfter,durationMs\n"
    );
  }

  const startedAt = Date.now();
  // ~20 progress lines regardless of run size, so even a short run visibly moves.
  const logEvery = Math.max(1, Math.floor(total / PAGE_SIZE / 20));

  let processedTotal = 0;
  let failedTotal = 0;
  let page = 0;
  // `full` mode ignores the stored watermark, so the paging cursor lives here.
  let cursor: Date | undefined = undefined;

  for (;;) {
    const before = cursor;

    const r = await runKlaviyoProfileReconciliation({
      mode: "full",
      limit: PAGE_SIZE,
      afterUpdatedAt: cursor,
    });

    if (r.candidates === 0) break;

    cursor = new Date(r.watermarkAfter);
    page++;
    processedTotal += r.processed;
    failedTotal += r.retryableFailures + r.permanentFailures;

    fs.appendFileSync(
      AUDIT_PATH,
      `${new Date().toISOString()},${page},${r.candidates},${r.processed},${r.retryableFailures + r.permanentFailures},` +
        `${r.timeBudgetExhausted},${r.watermarkAfter},${r.durationMs}\n`
    );

    // `nextWatermark` deliberately HOLDS position when any user in the page failed, so the
    // live sweep re-covers the window. In a paging loop that would spin forever — stop and
    // let the operator investigate rather than hammer Klaviyo.
    if (cursor.getTime() === (before?.getTime() ?? 0)) {
      console.error(
        `\nPage ${page}: cursor did not advance (${r.retryableFailures + r.permanentFailures} failure(s)) — stopping.\n` +
          `Completed pages are already synced; re-run after investigating.`
      );
      break;
    }

    if (page % logEvery === 0 || r.candidates < PAGE_SIZE) {
      const elapsedSec = (Date.now() - startedAt) / 1000;
      const rate = processedTotal / Math.max(elapsedSec, 1);
      const remaining = Math.max(0, total - processedTotal);
      const etaMin = rate > 0 ? Math.round(remaining / rate / 60) : 0;
      console.log(
        `${processedTotal}/${total} (${((processedTotal / total) * 100).toFixed(1)}%) · ` +
          `${rate.toFixed(1)}/sec · ETA ~${etaMin}m · failed ${failedTotal}`
      );
    }
  }

  console.log("\n=== Summary ===");
  console.log(`pages     : ${page}`);
  console.log(`processed : ${processedTotal}`);
  console.log(`failed    : ${failedTotal}`);
  console.log(`duration  : ${Math.round((Date.now() - startedAt) / 1000)}s`);
  console.log(`audit log : ${AUDIT_PATH}`);
  console.log("\nNext: npm run verify:klaviyo-accuracy -- --prod");

  process.exit(failedTotal > 0 ? 2 : 0);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
