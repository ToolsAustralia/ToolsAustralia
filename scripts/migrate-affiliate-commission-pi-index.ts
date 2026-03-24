#!/usr/bin/env npx tsx

/**
 * Drops the legacy unique index on (affiliateId, referredUserId, stripePaymentIntentId, commissionType)
 * that used sparse: true. Multiple membership-recurring documents omit stripePaymentIntentId; MongoDB
 * treated them as duplicate keys (null), so only ONE recurring commission per referred user could exist.
 *
 * After drop, Mongoose recreates the partial unique index from AffiliateCommission schema (only applies
 * when stripePaymentIntentId is a string).
 *
 * Usage:
 *   npx tsx scripts/migrate-affiliate-commission-pi-index.ts [--dry-run]
 *
 * Env: MONGODB_URI in .env.local
 */

import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env.local") });

const DRY = process.argv.includes("--dry-run");

const LEGACY_INDEX_NAMES = [
  "affiliateId_1_referredUserId_1_stripePaymentIntentId_1_commissionType_1",
];

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set");
    process.exit(1);
  }

  const connectDB = (await import("../src/lib/mongodb")).default;
  const AffiliateCommission = (await import("../src/models/AffiliateCommission")).default;

  await connectDB();
  const coll = AffiliateCommission.collection;

  const indexes = await coll.indexes();
  console.log("Current indexes on affiliatecommissions:", indexes.map((i) => i.name).join(", "));

  for (const name of LEGACY_INDEX_NAMES) {
    const exists = indexes.some((i) => i.name === name);
    if (!exists) {
      console.log(`Skip drop: index "${name}" not found`);
      continue;
    }
    if (DRY) {
      console.log(`[DRY-RUN] Would drop index: ${name}`);
    } else {
      await coll.dropIndex(name);
      console.log(`Dropped index: ${name}`);
    }
  }

  if (DRY) {
    console.log("[DRY-RUN] Would syncIndexes() to create partial PI unique index");
    return;
  }

  await AffiliateCommission.syncIndexes();
  console.log("syncIndexes() completed. Verify with db.affiliatecommissions.getIndexes()");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
