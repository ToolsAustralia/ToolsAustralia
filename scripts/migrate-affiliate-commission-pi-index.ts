#!/usr/bin/env npx tsx

/**
 * Drops the legacy `sparse: true` unique indexes on affiliatecommissions and lets
 * Mongoose recreate them as PARTIAL unique indexes from the schema.
 *
 * Why: a COMPOUND sparse index still indexes a doc when ANY key is present (and
 * affiliateId always is), so rows missing the optional id were indexed with that id
 * as `null` and collided — meaning a referred user could only ever have ONE such row:
 *   - PI index   (stripePaymentIntentId): blocked >1 membership-recurring  (fixed 2026-01)
 *   - INVOICE idx (stripeInvoiceId):       blocked >1 one-time/upsell/mini-draw (fixed 2026-06)
 * The partial filter (`{$exists:true,$type:"string"}`) indexes only rows that actually
 * carry that id, so the other commission types dedupe on their own id instead.
 *
 * Usage:
 *   npm run migrate:affiliate-commission-pi-index[:dry]            (local)
 *   npm run migrate:affiliate-commission-pi-index[:dry] -- --prod  (production)
 *
 * Env: MONGODB_URI (and PROD_MONGODB_URI for --prod) in .env.local
 */

import { config } from "dotenv";
import path from "path";
import { connectOpsDb } from "./connect-ops-db";

config({ path: path.resolve(process.cwd(), ".env.local") });

const DRY = process.argv.includes("--dry-run");

const LEGACY_INDEX_NAMES = [
  "affiliateId_1_referredUserId_1_stripePaymentIntentId_1_commissionType_1",
  "affiliateId_1_referredUserId_1_stripeInvoiceId_1_commissionType_1",
];

async function main() {
  await connectOpsDb(`Affiliate commission index migration${DRY ? " — DRY-RUN" : ""}`);
  const AffiliateCommission = (await import("../src/models/AffiliateCommission")).default;
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
