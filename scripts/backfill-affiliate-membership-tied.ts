#!/usr/bin/env npx tsx

/**
 * Backfill User.affiliateReferral.membershipTied for users who already have a
 * membership-first AffiliateCommission but the flag was never set (legacy / failed save).
 *
 * This does NOT create missing membership-recurring rows from Stripe — run
 * `npm run backfill:affiliate-recurring-commissions` for that.
 *
 * Usage:
 *   npx tsx scripts/backfill-affiliate-membership-tied.ts [--live]
 *
 * Default: dry-run (count only). Pass --live to apply updates.
 *
 * Env: MONGODB_URI in .env.local
 */

import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env.local") });

const LIVE = process.argv.includes("--live");

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set. Add it to .env.local");
    process.exit(1);
  }

  const connectDB = (await import("../src/lib/mongodb")).default;
  const AffiliateCommission = (await import("../src/models/AffiliateCommission")).default;
  const User = (await import("../src/models/User")).default;

  await connectDB();

  const userIds = await AffiliateCommission.distinct("referredUserId", {
    commissionType: "membership-first",
  });

  const filter = {
    _id: { $in: userIds },
    "affiliateReferral.membershipTied": { $ne: true },
  };

  const toFix = await User.countDocuments(filter);
  console.log(`Users with membership-first commission but membershipTied !== true: ${toFix}`);

  if (!LIVE) {
    console.log("Dry run (omit --live). No updates. Use --live to set membershipTied=true.");
    process.exit(0);
  }

  const result = await User.updateMany(filter, { $set: { "affiliateReferral.membershipTied": true } });
  console.log(`Updated ${result.modifiedCount} user(s).`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
