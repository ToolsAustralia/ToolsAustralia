/**
 * Throttled, dry-run-first Klaviyo profile resync script.
 *
 * PURPOSE
 * -------
 * Re-syncs user profiles to Klaviyo after the June 2026 "fetch failed" outage
 * that left some profiles stale. Runs LOCALLY (a long-lived tsx process — no
 * Vercel freeze/thaw, so the undici keep-alive race doesn't apply) using the
 * already-fixed Klaviyo client. Safe to run before the Vercel deploy.
 *
 * ⚠️  DRY-RUN is the default. Pass --apply to perform real Klaviyo writes.
 *     --apply writes to the PRODUCTION Klaviyo account (key comes from .env.local).
 *
 * ⚠️  Run OFF-PEAK. Klaviyo's Profiles rate limit is per-account and shared
 *     with live registration upserts. The internally-throttled sync holds
 *     Get-Profiles at ~5–10 req/s (well under the ~700/min steady limit), but
 *     a whole-DB sweep still takes time — run it overnight when traffic is low.
 *
 * THROTTLE NOTE
 * -------------
 * syncMultipleUserProfilesToKlaviyo() is already throttled (8 concurrent /
 * 700ms pause between batches of 8). This script wraps it in chunks of 80 to
 * emit a progress line after each chunk — do NOT re-implement the throttle here.
 * Per-user errors are swallowed internally; they appear as console.error lines
 * in the tsx output. The final summary counts "processed" (attempted), not
 * "succeeded"; watch the output for any per-user ❌ lines.
 *
 * USAGE
 * -----
 *   # Dry-run (default) — shows a sample of 10 emails, no Klaviyo writes:
 *   npx tsx scripts/sync-klaviyo-profiles.ts
 *   npx tsx scripts/sync-klaviyo-profiles.ts --prod --members-only --limit 50
 *
 *   # Live run (real Klaviyo writes):
 *   npx tsx scripts/sync-klaviyo-profiles.ts --apply
 *   npx tsx scripts/sync-klaviyo-profiles.ts --prod --apply --members-only
 *
 * FLAGS
 * -----
 *   --prod          Connect to PROD_MONGODB_URI (Production db) via connectOpsDb.
 *   --apply         Actually write to Klaviyo. Without this flag: DRY-RUN.
 *   --members-only  Only sync users who have a subscription document.
 *   --limit N       Cap the result set to N users (for testing / smoke check).
 */

import { config } from "dotenv";
import path from "path";
import { connectOpsDb } from "./connect-ops-db";

// Load .env.local before connectOpsDb reads PROD_MONGODB_URI / MONGODB_URI.
config({ path: path.resolve(process.cwd(), ".env.local") });

// ─── Flag parsing ─────────────────────────────────────────────────────────────
const argv = process.argv;
const APPLY = argv.includes("--apply");
const MEMBERS_ONLY = argv.includes("--members-only");
const PROD = argv.includes("--prod");

const limitIdx = argv.indexOf("--limit");
const LIMIT: number | null = limitIdx !== -1 ? parseInt(argv[limitIdx + 1], 10) : null;

// Chunk size passed to syncMultipleUserProfilesToKlaviyo (which internally
// processes 8 at a time with 700ms pauses). 80 = 10 internal batches of 8;
// each chunk call takes roughly 10 × (8 × avg_latency + 700ms).
const CHUNK_SIZE = 80;

async function main() {
  // ─── Guard: Klaviyo must be enabled ──────────────────────────────────────
  if (process.env.KLAVIYO_ENABLED === "false") {
    console.log("KLAVIYO_ENABLED=false — cannot sync profiles. Enable Klaviyo in .env.local and retry.");
    process.exit(0);
  }

  const mongoose = await connectOpsDb("sync-klaviyo-profiles");

  try {
    const User = (await import("../src/models/User")).default;
    const { syncMultipleUserProfilesToKlaviyo } = await import(
      "../src/utils/integrations/klaviyo/klaviyo-profile-sync"
    );

    // ─── Build Mongo filter ─────────────────────────────────────────────────
    const filter: Record<string, unknown> = {
      email: { $exists: true, $nin: [null, ""] },
    };
    if (MEMBERS_ONLY) {
      filter["subscription"] = { $exists: true, $ne: null };
    }

    const scope = MEMBERS_ONLY ? "members-only" : "all-with-email";
    const target = PROD ? "PROD" : "local";
    const mode = APPLY ? "APPLY" : "DRY-RUN";

    // ─── Up-front count ─────────────────────────────────────────────────────
    let query = User.find(filter).lean();
    if (LIMIT !== null && !isNaN(LIMIT) && LIMIT > 0) {
      query = query.limit(LIMIT);
    }

    // For the count we need to know total before fetching docs.
    // With a LIMIT we show the capped count; without, count the full set.
    const totalInDb = await User.countDocuments(filter);
    const total = LIMIT !== null && !isNaN(LIMIT) && LIMIT > 0 ? Math.min(LIMIT, totalInDb) : totalInDb;

    console.log(
      `\n${total} users to sync (scope: ${scope}) · mode: ${mode} · target: ${target}` +
        (LIMIT !== null ? ` · limit: ${LIMIT}` : "")
    );

    if (total === 0) {
      console.log("Nothing to sync — filter matched 0 users.");
      await mongoose.connection.close();
      return;
    }

    // ─── Dry-run (default) ──────────────────────────────────────────────────
    if (!APPLY) {
      type LeanUser = { email?: string };
      const sample = (await User.find(filter)
        .select("email")
        .limit(10)
        .lean()) as LeanUser[];

      console.log("\nSample (up to 10 emails that would be synced):");
      sample.forEach((u, i) => console.log(`  ${i + 1}. ${u.email ?? "(no email)"}`));
      if (total > 10) {
        console.log(`  … and ${total - 10} more.`);
      }
      console.log(`\n[DRY] no Klaviyo writes made — re-run with --apply to sync.`);
      await mongoose.connection.close();
      return;
    }

    // ─── APPLY: fetch all users, process in chunks ──────────────────────────
    const users = (await query) as unknown as import("../src/models/User").IUser[];

    if (users.length === 0) {
      console.log("Query returned 0 users — nothing to sync.");
      await mongoose.connection.close();
      return;
    }

    // Adaptive progress cadence (~20 lines regardless of set size).
    const logEvery = Math.max(1, Math.floor(Math.ceil(users.length / CHUNK_SIZE) / 20));

    let processedUsers = 0;
    let chunksDone = 0;
    const startedAt = Date.now();

    for (let i = 0; i < users.length; i += CHUNK_SIZE) {
      const chunk = users.slice(i, i + CHUNK_SIZE);
      await syncMultipleUserProfilesToKlaviyo(chunk);
      processedUsers += chunk.length;
      chunksDone++;

      if (chunksDone % logEvery === 0 || processedUsers >= users.length) {
        const rate = processedUsers / Math.max(1, (Date.now() - startedAt) / 1000);
        const etaSec = Math.round((users.length - processedUsers) / Math.max(0.001, rate));
        console.log(
          `… ${processedUsers}/${users.length} (${Math.round((processedUsers / users.length) * 100)}%) · ${rate.toFixed(1)}/s · ETA ${etaSec}s`
        );
      }
    }

    // ─── Final summary ──────────────────────────────────────────────────────
    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log("\n──────── SUMMARY ────────");
    console.log(`synced (attempted) ${processedUsers}/${users.length} profiles to Klaviyo`);
    console.log(`scope     : ${scope}`);
    console.log(`target    : ${target}`);
    console.log(`elapsed   : ${elapsed}s`);
    console.log(
      `per-user failures: check above output for ❌ lines — syncUserProfileToKlaviyo swallows errors inline`
    );
    console.log("─────────────────────────\n");
  } finally {
    await mongoose.connection.close();
  }
}

// Force a clean exit — the Klaviyo/Stripe client + mongoose keep handles open that
// would otherwise leave the process hanging after the work is done.
main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal error in sync-klaviyo-profiles:", err);
    process.exit(1);
  });
