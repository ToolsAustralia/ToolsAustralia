/**
 * Klaviyo Bulk Import profile resync — the FAST path for the post-outage backfill.
 *
 * Re-syncs user profile DATA to Klaviyo via the async Bulk Import endpoint
 * (POST /profile-bulk-import-jobs/): one job upserts up to 10,000 profiles
 * (chunked here to ~2,000/job for payload safety), vs the per-profile script
 * (scripts/sync-klaviyo-profiles.ts) which hits the Profiles API twice per user
 * at ~5-10 req/s. For a whole-DB sweep (tens of thousands of members) this is
 * the right tool. Runs LOCALLY as a long-lived tsx process (no Vercel
 * freeze/thaw, so the undici keep-alive race doesn't apply) against the
 * already-fixed Klaviyo client.
 *
 * ⚠️  DATA-ONLY upsert. Never changes list membership/consent (no list
 *     relationship) — only profile attributes/properties. Safe for users who
 *     unsubscribed.
 * ⚠️  DRY-RUN is the default. Pass --apply to create real Klaviyo jobs against
 *     the PRODUCTION Klaviyo account (key from .env.local).
 *
 * STREAMING: streams users with a Mongo cursor and flushes in pages of FLUSH_AT
 * profiles (build -> chunk -> POST job(s) -> poll to completion -> report ->
 * clear). Memory stays bounded regardless of DB size. Target draw + cutoff are
 * computed ONCE and passed to every userToKlaviyoProfile call.
 *
 * USAGE
 *   npx tsx scripts/sync-klaviyo-profiles-bulk.ts --prod                       # dry-run
 *   npx tsx scripts/sync-klaviyo-profiles-bulk.ts --prod --members-only --limit 100
 *   npx tsx scripts/sync-klaviyo-profiles-bulk.ts --prod --apply               # live
 *
 * FLAGS
 *   --prod          Connect to PROD_MONGODB_URI (Production db) via connectOpsDb.
 *   --apply         Actually create Klaviyo jobs. Without it: DRY-RUN.
 *   --members-only  Only users who have a subscription document.
 *   --limit N       Cap the result set to N users.
 */

import { config } from "dotenv";
import path from "path";
import { connectOpsDb } from "./connect-ops-db";
import type { IUser } from "../src/models/User";
import type { KlaviyoProfile } from "../src/types/klaviyo";

config({ path: path.resolve(process.cwd(), ".env.local") });

const argv = process.argv;
const APPLY = argv.includes("--apply");
const MEMBERS_ONLY = argv.includes("--members-only");
const PROD = argv.includes("--prod");
const limitIdx = argv.indexOf("--limit");
const LIMIT: number | null = limitIdx !== -1 ? parseInt(argv[limitIdx + 1], 10) : null;

// Flush after this many built profiles (~one bulk-import job; a byte-heavy page
// may split into 2 jobs via the chunker). Bounds memory to one page.
const FLUSH_AT = 2000;
// Poll cadence per async job. complete|error usually arrives within seconds.
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 60; // ~3 min ceiling per job

type Klaviyo = (typeof import("../src/lib/klaviyo"))["klaviyo"];

async function pollJobToCompletion(
  klaviyo: Klaviyo,
  jobId: string
): Promise<{ status: string; timedOut: boolean }> {
  let lastStatus = "unknown";
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
    const res = await klaviyo.getBulkImportJobStatus(jobId);
    lastStatus = res.status ?? (res.success ? "unknown" : `error:${res.error ?? "?"}`);
    if (res.status === "complete" || res.status === "error") {
      return { status: res.status, timedOut: false };
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return { status: lastStatus, timedOut: true };
}

async function main() {
  if (process.env.KLAVIYO_ENABLED === "false") {
    console.log("KLAVIYO_ENABLED=false — cannot sync profiles. Enable Klaviyo in .env.local and retry.");
    process.exit(0);
  }

  const mongoose = await connectOpsDb("sync-klaviyo-profiles-bulk");

  try {
    const User = (await import("../src/models/User")).default;
    const { userToKlaviyoProfile } = await import("../src/utils/integrations/klaviyo/klaviyo-helpers");
    const { getTargetDrawForCalculation } = await import("../src/utils/integrations/klaviyo/klaviyo-draw-calculator");
    const { chunkProfilesForBulkImport } = await import("../src/utils/integrations/klaviyo/bulk-import");
    const { klaviyo } = await import("../src/lib/klaviyo");

    const filter: Record<string, unknown> = { email: { $exists: true, $nin: [null, ""] } };
    if (MEMBERS_ONLY) filter["subscription"] = { $exists: true, $ne: null };

    const scope = MEMBERS_ONLY ? "members-only" : "all-with-email";
    const target = PROD ? "PROD" : "local";
    const mode = APPLY ? "APPLY" : "DRY-RUN";

    const totalInDb = await User.countDocuments(filter);
    const total = LIMIT !== null && !isNaN(LIMIT) && LIMIT > 0 ? Math.min(LIMIT, totalInDb) : totalInDb;

    console.log(
      `\n${total} users to bulk-import (scope: ${scope}) · mode: ${mode} · target: ${target}` +
        (LIMIT !== null ? ` · limit: ${LIMIT}` : "")
    );
    if (total === 0) {
      console.log("Nothing to sync — filter matched 0 users.");
      return;
    }

    const drawInfo = await getTargetDrawForCalculation();
    if (drawInfo) {
      console.log(`📅 Draw context: "${drawInfo.targetDraw.name}" · cutoff ${drawInfo.cutoffDate.toISOString()}`);
    } else {
      console.warn("⚠️  No target draw found — draw-specific properties default inside userToKlaviyoProfile.");
    }

    // ─── DRY-RUN (read-only) ────────────────────────────────────────────────
    if (!APPLY) {
      const sampleDocs = await User.find(filter).limit(5).lean();
      const sampleProfiles: KlaviyoProfile[] = [];
      for (const doc of sampleDocs) {
        sampleProfiles.push(
          await userToKlaviyoProfile(doc as unknown as IUser, undefined, drawInfo?.targetDraw, drawInfo?.cutoffDate)
        );
      }
      const { chunks, skippedNoEmail, oversized } = chunkProfilesForBulkImport(sampleProfiles);
      console.log("\nSample (up to 5 built profiles that would be imported):");
      sampleProfiles.forEach((p, i) =>
        console.log(`  ${i + 1}. ${p.email ?? "(no email)"} · ${Object.keys(p.properties ?? {}).length} properties`)
      );
      const projectedJobs = Math.ceil(total / FLUSH_AT);
      console.log(`\n[DRY] sample chunked into ${chunks.length} job(s) (skippedNoEmail=${skippedNoEmail}, oversized=${oversized}).`);
      console.log(`[DRY] full run would stream ${total} users in pages of ${FLUSH_AT} → ~${projectedJobs} bulk-import job(s).`);
      console.log(`[DRY] no Klaviyo writes made — re-run with --apply to create jobs.`);
      return;
    }

    // ─── APPLY: stream → POST jobs → poll after ─────────────────────────────
    // We POST jobs DURING streaming but DON'T poll until the cursor is drained.
    // Polling holds no DB cursor open, so a slow job can never let the Mongo
    // cursor idle past its server-side timeout (~10 min) and break the sweep.
    // Bulk-import jobs run async server-side, so firing them eagerly is fine —
    // the client backs off on 429 if we ever brush the job-creation rate limit.
    let queryChain = User.find(filter).lean();
    if (LIMIT !== null && !isNaN(LIMIT) && LIMIT > 0) queryChain = queryChain.limit(LIMIT);
    const cursor = queryChain.cursor();

    let buffer: KlaviyoProfile[] = [];
    let built = 0;
    const jobIds: string[] = [];
    let jobsCreated = 0, jobsComplete = 0, jobsFailed = 0, jobsTimedOut = 0;
    let totalSkippedNoEmail = 0, totalOversized = 0, totalImportErrors = 0;
    const startedAt = Date.now();

    // POST one bulk-import job per size-safe chunk; record the job id to poll later.
    const flush = async () => {
      if (buffer.length === 0) return;
      const { chunks, skippedNoEmail, oversized } = chunkProfilesForBulkImport(buffer);
      totalSkippedNoEmail += skippedNoEmail;
      totalOversized += oversized;
      for (const chunk of chunks) {
        const res = await klaviyo.bulkImportProfiles(chunk);
        if (!res.success || !res.jobId) {
          jobsFailed++;
          console.error(`❌ job create failed (${chunk.length} profiles): ${res.error ?? "unknown"}`);
          continue;
        }
        jobsCreated++;
        jobIds.push(res.jobId);
      }
      buffer = [];
    };

    for await (const doc of cursor) {
      buffer.push(
        await userToKlaviyoProfile(doc as unknown as IUser, undefined, drawInfo?.targetDraw, drawInfo?.cutoffDate)
      );
      built++;
      if (buffer.length >= FLUSH_AT) {
        await flush();
        const rate = built / Math.max(1, (Date.now() - startedAt) / 1000);
        const etaSec = Math.round((total - built) / Math.max(0.001, rate));
        console.log(`… ${built}/${total} (${Math.round((built / total) * 100)}%) built · ${jobsCreated} jobs posted · ${rate.toFixed(1)}/s · ETA ${etaSec}s`);
      }
    }
    await flush();

    // ─── Poll all created jobs to completion (cursor is drained — no DB held) ─
    if (jobIds.length > 0) {
      console.log(`\nAll ${jobsCreated} job(s) posted. Polling for completion…`);
      const pollLogEvery = Math.max(1, Math.floor(jobIds.length / 20));
      for (let j = 0; j < jobIds.length; j++) {
        const jobId = jobIds[j];
        const { status, timedOut } = await pollJobToCompletion(klaviyo, jobId);
        if (timedOut) {
          jobsTimedOut++;
          console.error(`⏱️  job ${jobId} not complete within ~${(POLL_INTERVAL_MS * POLL_MAX_ATTEMPTS) / 1000}s (last: ${status})`);
        } else if (status === "complete") {
          jobsComplete++;
          const errRes = await klaviyo.getBulkImportErrors(jobId);
          if (errRes.success && errRes.errors.length > 0) {
            totalImportErrors += errRes.errors.length;
            console.error(`⚠️  job ${jobId} completed with ${errRes.errors.length} import error(s). First: ${JSON.stringify(errRes.errors[0]).slice(0, 300)}`);
          }
        } else {
          jobsFailed++;
          console.error(`❌ job ${jobId} ended with status "${status}".`);
        }
        if ((j + 1) % pollLogEvery === 0 || j + 1 === jobIds.length) {
          console.log(`… polled ${j + 1}/${jobIds.length} jobs (complete=${jobsComplete}, timedOut=${jobsTimedOut}, failed=${jobsFailed})`);
        }
      }
    }

    const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log("\n──────── SUMMARY ────────");
    console.log(`profiles built     : ${built}/${total}`);
    console.log(`jobs created       : ${jobsCreated}`);
    console.log(`  complete         : ${jobsComplete}`);
    console.log(`  failed           : ${jobsFailed}`);
    console.log(`  timed out        : ${jobsTimedOut}`);
    console.log(`skipped (no email) : ${totalSkippedNoEmail}`);
    console.log(`oversized (dropped): ${totalOversized}`);
    console.log(`import errors      : ${totalImportErrors}`);
    console.log(`scope              : ${scope}`);
    console.log(`target             : ${target}`);
    console.log(`elapsed            : ${elapsed}s`);
    console.log("─────────────────────────\n");
  } finally {
    await mongoose.connection.close();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal error in sync-klaviyo-profiles-bulk:", err);
    process.exit(1);
  });
