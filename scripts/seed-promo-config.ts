/**
 * seed-promo-config — load a `dump-promo-config` JSON export into the database that
 * `MONGODB_URI` points at.
 *
 * DRY-RUN BY DEFAULT. Pass `--apply` to write.
 *
 * SAFETY RAILS (this writes to a SHARED remote Atlas cluster, not a local DB):
 *  1. `--prod` is REFUSED outright, and the run aborts if the resolved connection string
 *     matches `PROD_MONGODB_URI`'s host. Seeding production from a dump is never the
 *     intent, and the two clusters differ by a few characters.
 *  2. Before the first write it backs up every existing document in the target
 *     collections to `/temp` (gitignored). That file is the undo.
 *  3. Upsert-by-`_id` only. Documents already in the target that are not in the dump are
 *     left alone — nothing is deleted.
 *
 * Usage:
 *   npm run seed:promo-config:dry              # default; reports what would change
 *   npm run seed:promo-config -- --apply       # writes
 *   ... -- --file=temp/promo-config.<...>.json # pick a dump (default: newest in /temp)
 *
 * Exit codes: 0 ok · 1 fatal (connect/read/guard) · 2 completed with per-document errors.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { config } from "dotenv";

// Load .env.local BEFORE connect-ops-db reads the URIs — tsx does not do this for us.
config({ path: path.resolve(process.cwd(), ".env.local") });

import { connectOpsDb } from "./connect-ops-db";

const TARGETS = ["Promo", "ScheduledPromo"] as const;
type TargetName = (typeof TARGETS)[number];

const APPLY = process.argv.includes("--apply");

/**
 * Only seed promos whose active window OVERLAPS this range — the current cycle, not the
 * full 229-document history. Overlap (not containment) is the right test: a promo that
 * starts before the 28th and runs into the window is still live during it.
 */
const argValue = (flag: string) => process.argv.find((a) => a.startsWith(`${flag}=`))?.slice(flag.length + 1);
const FROM = new Date(argValue("--from") ?? "2026-07-28T00:00:00.000Z");
const TO = new Date(argValue("--to") ?? "2026-08-27T23:59:59.999Z");

function inWindow(doc: Record<string, unknown>): boolean {
  const start = doc.startDate ? new Date(doc.startDate as string) : null;
  const end = doc.endDate ? new Date(doc.endDate as string) : null;
  if (!start || !end || Number.isNaN(+start) || Number.isNaN(+end)) return false;
  return start <= TO && end >= FROM;
}

function hostOf(uri: string | undefined): string {
  if (!uri) return "";
  return (uri.replace(/\/\/[^@]*@/, "//").match(/\/\/([^/?]+)/) || [])[1]?.split(",")[0] ?? "";
}

async function newestDump(): Promise<string> {
  const dir = path.join(process.cwd(), "temp");
  const files = (await fs.readdir(dir)).filter((f) => f.startsWith("promo-config.") && f.endsWith(".json"));
  if (files.length === 0) throw new Error("no promo-config.*.json in /temp — run `npm run dump:promo-config:prod` first");
  return path.join(dir, files.sort().pop()!);
}

async function main() {
  // Rail 1a: never let this script target prod, whatever flags are passed.
  if (process.argv.includes("--prod")) {
    console.error("❌ refusing --prod: this script writes, and seeding production from a dump is not a supported operation.");
    process.exit(1);
  }

  const fileArg = process.argv.find((a) => a.startsWith("--file="))?.slice("--file=".length);
  const dumpPath = fileArg ? path.resolve(process.cwd(), fileArg) : await newestDump();
  const dump = JSON.parse(await fs.readFile(dumpPath, "utf8")) as {
    sourceDb?: string;
    exportedAt?: string;
    collections: Record<string, Record<string, unknown>[]>;
  };
  console.log(`📄 dump: ${path.relative(process.cwd(), dumpPath)}`);
  console.log(`   exported ${dump.exportedAt} from db="${dump.sourceDb}"`);

  const mongoose = await connectOpsDb("seed-promo-config");
  const targetHost = hostOf(process.env.MONGODB_URI);
  const prodHost = hostOf(process.env.PROD_MONGODB_URI);

  // Rail 1b: belt-and-braces — abort if we somehow resolved to the prod cluster.
  if (prodHost && targetHost && targetHost === prodHost) {
    console.error(`❌ target host (${targetHost}) matches PROD_MONGODB_URI — aborting before any write.`);
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log(`🎯 target: db="${mongoose.connection.db?.databaseName}" @ ${targetHost}`);
  console.log(APPLY ? "   MODE: APPLY (writing)\n" : "   MODE: DRY-RUN (no writes; pass --apply to commit)\n");

  const { default: Promo } = await import("../src/models/Promo");
  const { default: ScheduledPromo } = await import("../src/models/ScheduledPromo");
  const models: Record<TargetName, typeof Promo> = { Promo, ScheduledPromo } as never;

  // Rail 2: back up whatever is there now, before touching anything.
  const backup: Record<string, unknown[]> = {};
  let existingTotal = 0;
  for (const name of TARGETS) {
    const docs = await models[name].find().lean();
    backup[name] = docs;
    existingTotal += docs.length;
    console.log(`  existing ${name}: ${docs.length} document(s)`);
  }
  let backupPath = "(none — target was empty)";
  if (existingTotal > 0 && APPLY) {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    backupPath = path.join("temp", `promo-config.BACKUP-${mongoose.connection.db?.databaseName}.${stamp}.json`);
    await fs.writeFile(path.join(process.cwd(), backupPath), JSON.stringify({ backedUpAt: new Date().toISOString(), collections: backup }, null, 2), "utf8");
    console.log(`  💾 backup written to ${backupPath}`);
  }

  // Filter to the requested window before counting, so progress has the right denominator.
  const selected: Record<string, Record<string, unknown>[]> = {};
  let skipped = 0;
  for (const name of TARGETS) {
    const all = dump.collections[name] ?? [];
    selected[name] = all.filter(inWindow);
    skipped += all.length - selected[name].length;
  }
  const grandTotal = TARGETS.reduce((n, t) => n + selected[t].length, 0);

  console.log(`\nWindow: ${FROM.toISOString().slice(0, 10)} → ${TO.toISOString().slice(0, 10)} (overlap)`);
  for (const name of TARGETS) {
    console.log(`  ${name}: ${selected[name].length} in window (of ${(dump.collections[name] ?? []).length})`);
  }
  console.log(`To seed: ${grandTotal} document(s) · ${skipped} outside the window, not touched`);

  if (grandTotal === 0) {
    console.warn("⚠ nothing matched the window — check --from/--to");
    await mongoose.disconnect();
    process.exit(0);
  }

  let processed = 0;
  let inserted = 0;
  let updated = 0;
  let errors = 0;
  // ~20 progress lines regardless of size (CLAUDE.md ops-script rule).
  const step = Math.max(1, Math.ceil(grandTotal / 20));
  const startedAt = Date.now();

  for (const name of TARGETS) {
    for (const doc of selected[name]) {
      processed++;
      try {
        if (APPLY) {
          // Upsert by _id — idempotent, and never deletes anything not in the dump.
          const res = await models[name].replaceOne({ _id: doc._id }, doc, { upsert: true });
          if (res.upsertedCount) inserted++;
          else if (res.modifiedCount) updated++;
        } else {
          const exists = await models[name].exists({ _id: doc._id });
          if (exists) updated++;
          else inserted++;
        }
      } catch (err) {
        errors++;
        console.error(`  ✗ ${name} ${String(doc._id)}: ${(err as Error).message}`);
      }
      if (processed % step === 0 || processed === grandTotal) {
        const secs = (Date.now() - startedAt) / 1000;
        const rate = processed / Math.max(secs, 0.001);
        const eta = (grandTotal - processed) / Math.max(rate, 0.001);
        console.log(
          `  ${processed}/${grandTotal} (${Math.round((processed / grandTotal) * 100)}%) · ${rate.toFixed(1)}/sec · ETA ${eta.toFixed(0)}s`
        );
      }
    }
  }

  console.log(`\n${APPLY ? "✅ seeded" : "🔎 dry-run complete"} — ${APPLY ? "inserted" : "would insert"} ${inserted}, ${APPLY ? "updated" : "would update"} ${updated}, errors ${errors}`);
  if (APPLY) console.log(`   undo: restore from ${backupPath}`);
  else console.log("   re-run with --apply to commit.");

  await mongoose.disconnect();
  process.exit(errors > 0 ? 2 : 0);
}

main().catch((err) => {
  console.error("❌ seed-promo-config failed:", err);
  process.exit(1);
});
