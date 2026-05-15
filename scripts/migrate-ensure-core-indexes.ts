/**
 * Migration: ensure core MongoDB indexes exist (moved off the webhook hot path).
 *
 * Previously src/utils/database/ensure-indexes.ts#ensureIndexesOnce() ran ~25-30
 * serialized Atlas admin/DDL commands on every cold webhook lambda. Under a
 * bulk-charge burst this caused the 2026-05-15 504 storm. Index management is a
 * deploy-time concern, not a per-request one — this script is the new home.
 *
 * MUST be run on every deploy that could change indexes, and BEFORE deploying
 * the receiver slimming. It creates paymentIntentId_1_eventType_1_unique on
 * PaymentEvent, which is dedup layer 4 — load-bearing for no-double-grant.
 *
 * Usage:
 *   npx tsx scripts/migrate-ensure-core-indexes.ts [--dry-run]
 *
 * Env: .env.local must have MONGODB_URI.
 *
 * @module scripts/migrate-ensure-core-indexes
 */

import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env.local") });

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error("❌ MONGODB_URI is not set (.env.local).");
    process.exit(1);
  }

  const connectDB = (await import("../src/lib/mongodb")).default;
  await connectDB();

  if (DRY_RUN) {
    console.log(
      "[dry-run] Would ensure core indexes via ensureCriticalIndexes() " +
        "(see src/utils/database/ensure-indexes.ts for the exact index set)."
    );
    process.exit(0);
  }

  const { ensureCriticalIndexes } = await import(
    "../src/utils/database/ensure-indexes"
  );
  await ensureCriticalIndexes();
  console.log("✅ Core indexes ensured.");
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ migrate-ensure-core-indexes failed:", err);
  process.exit(1);
});
