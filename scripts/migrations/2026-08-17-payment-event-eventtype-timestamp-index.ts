/**
 * One-shot: create the `{ eventType: 1, timestamp: -1 }` index on `paymentevents`.
 *
 * WHY THIS EXISTS
 * ---------------
 * Every net-revenue / metrics aggregation in the app opens with
 * `$match: { eventType: "BenefitsGranted", timestamp: { $gte, $lte } }`
 * (src/utils/payment/payment-event-net-queries.ts, consumed by UserMetricsService,
 * MembershipAnalyticsService, the revenue-breakdown route, and the Norm metrics mirror).
 *
 * Before this index, NONE of the eleven indexes on the collection led with `eventType` — verified
 * against production on 2026-08-17. So those queries used the single-field `timestamp` index for
 * the range and then discarded non-matching event types in memory: cost scaled with the total
 * size of the collection rather than with the number of matches.
 *
 * WHY IT IS A MIGRATION AND NOT JUST A schema.index() DECLARATION
 * --------------------------------------------------------------
 * `src/lib/mongodb.ts` sets no `autoIndex` override, so Mongoose's default (`autoIndex: true`)
 * applies and the declaration alone would make PRODUCTION build the index at runtime, on the
 * first request that touches the model — inside a serverless function whose maxDuration is
 * already the thing under investigation. Building it deliberately, ahead of the deploy, keeps
 * that cost out of the request path.
 *
 * The matching declaration IS also added to src/models/PaymentEvent.ts so fresh environments
 * (new dev DBs, preview branches with their own cluster) get it without running this.
 *
 * IDEMPOTENT: if an equivalent index already exists, this reports and exits 0 without touching it.
 *
 * Default is DRY-RUN. Pass --apply to write.
 *
 *   npm run migrate:payment-event-eventtype-index:dry        # local, dry
 *   npm run migrate:payment-event-eventtype-index            # local, apply
 *   npm run migrate:payment-event-eventtype-index:prod:dry   # production, dry
 *   npm run migrate:payment-event-eventtype-index:prod       # production, apply
 */
import dotenv from "dotenv";
import path from "node:path";

/**
 * Which env file to load. Defaults to `.env.local`; `--production` targets `.env.production`.
 * MUST be loaded before importing anything that reads MONGODB_URI.
 */
const ENV_FILE = process.argv.includes("--production") ? ".env.production" : ".env.local";
dotenv.config({ path: path.resolve(process.cwd(), ENV_FILE) });

import mongoose from "mongoose";
import connectDB from "../../src/lib/mongodb";

const APPLY = process.argv.includes("--apply");
const IS_PRODUCTION = process.argv.includes("--production");

const COLLECTION = "paymentevents";
const INDEX_KEY = { eventType: 1, timestamp: -1 } as const;
const INDEX_NAME = "eventType_1_timestamp_-1";

function sameKey(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  // Order matters for a compound index — compare positionally, not as a set.
  return ak.every((k, i) => bk[i] === k && String(a[k]) === String(b[k]));
}

async function run() {
  console.log(
    `\nPaymentEvent eventType index — target=${IS_PRODUCTION ? "PRODUCTION" : "local"} (${APPLY ? "APPLY" : "DRY-RUN"})\n`
  );

  await connectDB();
  const db = mongoose.connection.db;
  if (!db) throw new Error("No database handle after connectDB()");

  const coll = db.collection(COLLECTION);

  const total = await coll.estimatedDocumentCount();
  console.log(`Documents in ${COLLECTION}: ${total.toLocaleString()}`);

  const existing = await coll.indexes();
  console.log(`\nExisting indexes (${existing.length}):`);
  for (const idx of existing) {
    console.log(`  ${idx.name?.padEnd(38) ?? "?"} ${JSON.stringify(idx.key)}`);
  }

  const alreadyPresent = existing.find((i) => sameKey(i.key as Record<string, unknown>, INDEX_KEY));
  if (alreadyPresent) {
    console.log(
      `\n✅ Already present as "${alreadyPresent.name}" — nothing to do. ` +
        `(If you expected a change, this migration has already been applied.)\n`
    );
    await mongoose.disconnect();
    return;
  }

  const leadsWithEventType = existing.some((i) => Object.keys(i.key)[0] === "eventType");
  console.log(
    `\nAny index currently leading with eventType? ${leadsWithEventType ? "yes" : "NO — this is the gap"}`
  );

  if (!APPLY) {
    console.log(
      `\nDRY-RUN — would create ${JSON.stringify(INDEX_KEY)} as "${INDEX_NAME}" (background: true).\n` +
        `Re-run with --apply to create it.\n`
    );
    await mongoose.disconnect();
    return;
  }

  console.log(`\nCreating ${JSON.stringify(INDEX_KEY)} …`);
  const startedAt = Date.now();
  // background: true keeps the collection readable/writable while the index builds. On MongoDB
  // 4.2+ the option is a no-op (all builds are effectively background) but it is harmless and
  // documents the intent for older clusters.
  const name = await coll.createIndex(INDEX_KEY as unknown as Record<string, 1 | -1>, {
    name: INDEX_NAME,
    background: true,
  });
  console.log(`✅ Created "${name}" in ${((Date.now() - startedAt) / 1000).toFixed(2)}s`);

  const after = await coll.indexes();
  console.log(`\nIndexes now (${after.length}):`);
  for (const idx of after) {
    console.log(`  ${idx.name?.padEnd(38) ?? "?"} ${JSON.stringify(idx.key)}`);
  }
  console.log("");

  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error("❌ Migration failed:", err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
