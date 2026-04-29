/**
 * One-shot cleanup of pre-existing backfill rows in the analytics collections.
 *
 * Removes rows written by the now-deleted scripts/backfill-membership-analytics.ts:
 *   - MembershipStatusHistory rows with source matching /^backfill_/ OR metadata.backfill === true
 *   - MembershipRenewalCycle rows with confidence === "backfill"
 *
 * Webhook-written rows (real, captured at the time of the actual transition) are kept.
 *
 * Usage:
 *   npx tsx scripts/cleanup-membership-backfill-rows.ts             # dry-run (default, safe)
 *   npx tsx scripts/cleanup-membership-backfill-rows.ts --live      # actually delete
 */

import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import MembershipStatusHistory from "@/models/MembershipStatusHistory";
import MembershipRenewalCycle from "@/models/MembershipRenewalCycle";

async function main() {
  const isLive = process.argv.includes("--live");
  const dryRun = !isLive;
  console.log(dryRun ? "DRY RUN — no deletes" : "LIVE — deleting backfill rows");

  await connectDB();

  const historyFilter = {
    $or: [
      { source: { $regex: /^backfill_/ } },
      { "metadata.backfill": true },
    ],
  };
  const renewalFilter = { confidence: "backfill" };

  const historyCount = await MembershipStatusHistory.countDocuments(historyFilter);
  const renewalCount = await MembershipRenewalCycle.countDocuments(renewalFilter);

  console.log(`MembershipStatusHistory rows matching backfill filter: ${historyCount}`);
  console.log(`MembershipRenewalCycle rows matching backfill filter:  ${renewalCount}`);

  if (!dryRun) {
    const histDelete = await MembershipStatusHistory.deleteMany(historyFilter);
    const renDelete = await MembershipRenewalCycle.deleteMany(renewalFilter);
    console.log(`Deleted: ${histDelete.deletedCount} history rows, ${renDelete.deletedCount} renewal rows`);
  } else {
    console.log("(dry run — no rows deleted)");
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
