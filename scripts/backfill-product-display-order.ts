/**
 * Backfill `Product.displayOrder` so the catalogue has an EXPLICIT manual order.
 *
 * Why this is needed even though the field has a default: a Mongoose `default`
 * only fires on insert. Every product that existed before the field was added
 * has no `displayOrder` at all, and MongoDB sorts a missing field BEFORE any
 * number on an ascending sort. So the storefront would work by accident —
 * existing rows first (tie-broken by createdAt, i.e. today's order), new rows
 * last — right up until someone reasoned about it and got it wrong. It also
 * means the `displayOrder` index cannot help those rows.
 *
 * This assigns 1..N in the order customers see TODAY (createdAt descending), so
 * the storefront looks identical the moment it runs, and the order becomes data
 * an admin can drag rather than a side effect of sort semantics.
 *
 * Safe by default: reports only. Pass --apply to write.
 *
 *   npm run backfill:product-display-order            # dry run, LOCAL database
 *   npm run backfill:product-display-order:apply      # writes, LOCAL database
 *   npm run backfill:product-display-order:prod:dry   # dry run, PRODUCTION
 *   npm run backfill:product-display-order:prod       # writes, PRODUCTION
 *
 * Local and production are separate databases. Running this locally does NOTHING
 * for the live shop — the prod variants exist precisely so that is a deliberate
 * choice rather than a surprise.
 */
import dotenv from "dotenv";
import path from "node:path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import mongoose from "mongoose";
import { connectOpsDb } from "./connect-ops-db";
import Product from "../src/models/Product";

const APPLY = process.argv.includes("--apply");

async function main() {
  console.log(`\nBackfill Product.displayOrder — ${APPLY ? "APPLY (writes)" : "DRY RUN (no writes)"}`);

  // connectOpsDb, not connectDB: it is what implements --prod (rewriting MONGODB_URI
  // from PROD_MONGODB_URI) and prints a PROD|local banner, so a run against
  // production cannot be mistaken for a local one.
  await connectOpsDb("backfill-product-display-order");
  console.log(`  database: ${mongoose.connection.name}\n`);

  // Today's customer-facing order, so running this changes nothing visible.
  const products = await Product.find({})
    .select("_id name displayOrder createdAt")
    .sort({ createdAt: -1 })
    .lean<{ _id: mongoose.Types.ObjectId; name: string; displayOrder?: number }[]>();

  const total = products.length;
  console.log(`  ${total} product(s) to position\n`);
  if (total === 0) {
    console.log("Nothing to do.");
    await mongoose.disconnect();
    process.exit(0);
  }

  // ~20 progress lines regardless of size, so even a small run visibly moves.
  const every = Math.max(1, Math.floor(total / 20));
  const started = Date.now();
  let written = 0;
  let unchanged = 0;

  const operations: Parameters<typeof Product.bulkWrite>[0] = [];

  products.forEach((p, i) => {
    const position = i + 1;
    if (p.displayOrder === position) {
      unchanged++;
    } else {
      written++;
      operations.push({
        updateOne: {
          filter: { _id: p._id },
          update: { $set: { displayOrder: position } },
        },
      });
    }

    if ((i + 1) % every === 0 || i + 1 === total) {
      const done = i + 1;
      const elapsed = (Date.now() - started) / 1000 || 0.001;
      const rate = done / elapsed;
      const eta = Math.max(0, Math.round((total - done) / rate));
      console.log(
        `  ${done}/${total} (${Math.round((done / total) * 100)}%) · ${rate.toFixed(1)}/sec · ETA ${eta}s`
      );
    }
  });

  if (APPLY && operations.length > 0) {
    const res = await Product.bulkWrite(operations);
    console.log(`\n  bulkWrite: matched ${res.matchedCount}, modified ${res.modifiedCount}`);
  }

  console.log(`\nSummary`);
  console.log(`  positioned      : ${written}`);
  console.log(`  already correct : ${unchanged}`);
  console.log(`  mode            : ${APPLY ? "APPLIED" : "dry run — re-run with --apply to write"}`);

  await mongoose.disconnect();
  // 0 = clean, 2 = ran but had nothing to write (still a success, distinguishable).
  process.exit(written === 0 ? 2 : 0);
}

main().catch(async (err) => {
  console.error("\nFAILED:", err instanceof Error ? err.message : String(err));
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
