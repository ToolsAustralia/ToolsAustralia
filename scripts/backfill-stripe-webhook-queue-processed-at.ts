/**
 * Backfill `processedAt` for dead StripeWebhookQueue rows that pre-date the
 * 24h/30d TTL change.
 *
 * Before commit b28795a6, `markFailed` never set `processedAt` on the
 * transition to `status: "dead"`, so pre-existing dead rows have
 * `processedAt: null`. The new partial TTL index
 * (`dead_processedAt_ttl`, 30d) ignores null/missing values, so those rows
 * would never expire. This script anchors them to `updatedAt` (the timestamp
 * of the last status change — i.e. when the row actually went dead) so the
 * 30-day clock starts from a sensible point.
 *
 * Usage:
 *   npx tsx scripts/backfill-stripe-webhook-queue-processed-at.ts [--dry-run]
 *
 * Options:
 *   --dry-run    Count matching rows and print a sample; no writes.
 *
 * Safety:
 * - Filter is narrow: `{ status: "dead", processedAt: null }`. Cannot touch
 *   succeeded/queued/processing rows.
 * - Idempotent: matches only rows where `processedAt` is still null. Re-runs
 *   are no-ops once the backfill is complete.
 *
 * Env: .env.local must have MONGODB_URI.
 *
 * @module scripts/backfill-stripe-webhook-queue-processed-at
 */

import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env.local") });

import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import StripeWebhookQueue from "@/models/StripeWebhookQueue";

const DRY_RUN = process.argv.includes("--dry-run");

function ts(): string {
  return new Date().toISOString().slice(11, 19);
}

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set. Set it in .env.local and try again.");
    process.exit(1);
  }

  console.log(`[${ts()}] ${DRY_RUN ? "DRY RUN" : "LIVE"} — backfill dead-row processedAt`);
  await connectDB();
  console.log(`[${ts()}] MongoDB connected`);

  const filter = { status: "dead" as const, processedAt: null };
  const total = await StripeWebhookQueue.countDocuments(filter);
  console.log(`[${ts()}] candidate rows: ${total}`);

  if (total === 0) {
    console.log(`[${ts()}] nothing to backfill — exiting`);
    await mongoose.disconnect();
    return;
  }

  const sample = await StripeWebhookQueue.find(filter)
    .sort({ updatedAt: 1 })
    .limit(5)
    .select("eventId type updatedAt enqueuedAt")
    .lean();
  for (const row of sample) {
    console.log(
      JSON.stringify({
        action: DRY_RUN ? "would-set" : "set",
        eventId: row.eventId,
        type: row.type,
        processedAt: row.updatedAt,
        enqueuedAt: row.enqueuedAt,
      })
    );
  }

  if (DRY_RUN) {
    console.log(`[${ts()}] dry-run complete — ${total} row(s) would be updated`);
    await mongoose.disconnect();
    return;
  }

  // Use an aggregation-pipeline update so $set can reference $updatedAt.
  const result = await StripeWebhookQueue.updateMany(filter, [
    { $set: { processedAt: "$updatedAt" } },
  ]);
  console.log(
    `[${ts()}] updated ${result.modifiedCount}/${result.matchedCount} dead row(s) with processedAt=updatedAt`
  );

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
