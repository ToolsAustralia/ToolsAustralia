/**
 * dump-promo-config — READ-ONLY export of the promo multiplier config.
 *
 * Exports `Promo` + `ScheduledPromo` to a JSON file under `/temp` (gitignored) so the
 * config can be inspected and later loaded into another environment.
 *
 * THIS SCRIPT NEVER WRITES TO A DATABASE. It opens the connection, reads with `.lean()`,
 * and writes one local file. There is deliberately no seed/import half: the counterpart
 * would be a write, and a write needs its own explicit, dry-run-able script pointed at a
 * target you have confirmed — not a flag on a dump.
 *
 * Usage:
 *   npm run dump:promo-config           # reads MONGODB_URI (the dev Atlas cluster)
 *   npm run dump:promo-config:prod      # reads PROD_MONGODB_URI, db "Production"
 *
 * Note on `--prod`: `connectOpsDb` rewrites `process.env.MONGODB_URI` to the prod string
 * for the whole run, so everything downstream is uniformly prod. It prints `PROD|local ·
 * db="…" @ host` on startup — check that line before trusting the output.
 *
 * Exit codes: 0 ok · 1 connection/read failure · 2 completed but nothing found.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { config } from "dotenv";

// Load .env.local BEFORE connectOpsDb reads PROD_MONGODB_URI / MONGODB_URI — tsx does not
// load it automatically. Same order as the other ops scripts.
config({ path: path.resolve(process.cwd(), ".env.local") });

import { connectOpsDb } from "./connect-ops-db";

/** Collections to export, in the resolver's own precedence order. */
const TARGETS = ["Promo", "ScheduledPromo"] as const;

async function main() {
  const startedAt = Date.now();
  const mongoose = await connectOpsDb("dump-promo-config");

  const db = mongoose.connection.db;
  if (!db) {
    console.error("❌ no database handle after connect");
    process.exit(1);
  }

  // Import the models so their collection names resolve exactly as the app sees them,
  // rather than guessing at pluralisation.
  const { default: Promo } = await import("../src/models/Promo");
  const { default: ScheduledPromo } = await import("../src/models/ScheduledPromo");
  const models = { Promo, ScheduledPromo } as Record<string, { countDocuments: () => Promise<number>; find: () => { lean: () => Promise<unknown[]> } }>;

  // Up-front totals so progress has a denominator (CLAUDE.md ops-script rule).
  const counts: Record<string, number> = {};
  let grandTotal = 0;
  for (const name of TARGETS) {
    counts[name] = await models[name].countDocuments();
    grandTotal += counts[name];
    console.log(`  ${name}: ${counts[name]} document(s)`);
  }
  console.log(`Total to export: ${grandTotal}`);

  const payload: Record<string, unknown> = {
    exportedAt: new Date().toISOString(),
    sourceDb: mongoose.connection.db?.databaseName ?? "(unknown)",
    sourceHost: mongoose.connection.host ?? "(unknown)",
    counts,
    collections: {} as Record<string, unknown[]>,
  };

  let done = 0;
  for (const name of TARGETS) {
    const docs = await models[name].find().lean();
    (payload.collections as Record<string, unknown[]>)[name] = docs;
    done += docs.length;
    console.log(
      `  exported ${name} — ${docs.length} doc(s) · ${done}/${grandTotal} (${grandTotal ? Math.round((done / grandTotal) * 100) : 100}%)`
    );
  }

  const outDir = path.join(process.cwd(), "temp");
  await fs.mkdir(outDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  const outFile = path.join(outDir, `promo-config.${payload.sourceDb}.${stamp}.json`);
  await fs.writeFile(outFile, JSON.stringify(payload, null, 2), "utf8");

  const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
  console.log(`\n✅ wrote ${grandTotal} document(s) to ${path.relative(process.cwd(), outFile)} in ${secs}s`);
  console.log("   (read-only run — no database was modified)");

  await mongoose.disconnect();
  if (grandTotal === 0) {
    console.warn("⚠ no promo documents found — check you pointed at the intended database");
    process.exit(2);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ dump-promo-config failed:", err);
  process.exit(1);
});
