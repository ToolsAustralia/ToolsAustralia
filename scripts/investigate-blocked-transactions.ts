#!/usr/bin/env npx tsx

/**
 * Read-only diagnostic comparing Stripe blocked charges against the
 * `BlockedTransaction` Mongo collection. Prints per-row coverage so we can
 * pinpoint where capture is failing.
 *
 * Usage:
 *   npx tsx scripts/investigate-blocked-transactions.ts [--from=ISO] [--to=ISO] [--limit=N]
 *
 * Options:
 *   --from=ISO   Start of window, ISO 8601 (default: 7 days ago).
 *   --to=ISO     End of window, ISO 8601 (default: now).
 *   --limit=N    Max charges to scan (default: 500).
 *
 * Exit codes:
 *   0 — every blocked charge present in Mongo.
 *   2 — at least one blocked charge missing.
 *
 * @module scripts/investigate-blocked-transactions
 */

import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env.local") });

const FROM_ARG = process.argv.find((a) => a.startsWith("--from="));
const TO_ARG = process.argv.find((a) => a.startsWith("--to="));
const LIMIT_ARG = process.argv.find((a) => a.startsWith("--limit="));

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const FROM = FROM_ARG ? new Date(FROM_ARG.split("=")[1] || "") : new Date(Date.now() - SEVEN_DAYS_MS);
const TO = TO_ARG ? new Date(TO_ARG.split("=")[1] || "") : new Date();
const LIMIT = LIMIT_ARG ? Math.max(1, parseInt(LIMIT_ARG.split("=")[1] || "500", 10)) : 500;

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set. Set it in .env.local and try again.");
    process.exit(1);
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error("STRIPE_SECRET_KEY is not set. Set it in .env.local and try again.");
    process.exit(1);
  }
  if (Number.isNaN(FROM.getTime()) || Number.isNaN(TO.getTime())) {
    console.error("Invalid --from or --to date.");
    process.exit(1);
  }

  const connectDB = (await import("../src/lib/mongodb")).default;
  const { stripe } = await import("../src/lib/stripe");
  const BlockedTransaction = (await import("../src/models/BlockedTransaction")).default;

  await connectDB();

  console.log("\nInvestigate blocked transactions — read-only");
  console.log(`  Window: ${FROM.toISOString()} → ${TO.toISOString()}`);
  console.log(`  Limit:  ${LIMIT} charges\n`);

  const fromUnix = Math.floor(FROM.getTime() / 1000);
  const toUnix = Math.floor(TO.getTime() / 1000);
  const query = `status:"failed" AND created>${fromUnix} AND created<${toUnix}`;

  let scanned = 0;
  let qualifying = 0;
  let present = 0;
  let missing = 0;
  const missingRows: Array<{
    chargeId: string;
    piId: string;
    email: string | null;
    outcomeType: string | null;
    networkStatus: string | null;
    createdAt: string;
  }> = [];

  for await (const charge of stripe.charges.search({ query, limit: 100 })) {
    scanned += 1;
    if (scanned > LIMIT) break;
    if (charge.outcome?.type !== "blocked") continue;

    qualifying += 1;
    const piId =
      typeof charge.payment_intent === "string"
        ? charge.payment_intent
        : charge.payment_intent?.id ?? null;
    if (!piId) {
      missing += 1;
      missingRows.push({
        chargeId: charge.id,
        piId: "(no PI)",
        email: charge.billing_details?.email ?? null,
        outcomeType: charge.outcome?.type ?? null,
        networkStatus: charge.outcome?.network_status ?? null,
        createdAt: new Date(charge.created * 1000).toISOString(),
      });
      continue;
    }

    const exists = await BlockedTransaction.exists({ _id: piId });
    if (exists) {
      present += 1;
    } else {
      missing += 1;
      missingRows.push({
        chargeId: charge.id,
        piId,
        email: charge.billing_details?.email ?? null,
        outcomeType: charge.outcome?.type ?? null,
        networkStatus: charge.outcome?.network_status ?? null,
        createdAt: new Date(charge.created * 1000).toISOString(),
      });
    }
  }

  console.log("Summary:");
  console.log(`  Charges scanned:       ${scanned}`);
  console.log(`  Qualifying (blocked):  ${qualifying}`);
  console.log(`  Present in Mongo:      ${present}`);
  console.log(`  Missing in Mongo:      ${missing}`);

  if (missingRows.length > 0) {
    console.log("\nMissing rows:");
    for (const r of missingRows) {
      console.log(
        `  ${r.createdAt}  ${r.chargeId}  pi=${r.piId}  email=${r.email ?? "—"}  outcome=${r.outcomeType}/${r.networkStatus}`
      );
    }
  }

  await (await import("mongoose")).default.disconnect();
  process.exit(missing > 0 ? 2 : 0);
}

main().catch((err) => {
  console.error("Investigation aborted:", err);
  process.exit(1);
});
