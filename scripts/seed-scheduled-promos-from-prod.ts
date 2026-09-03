/**
 * Copy the ScheduledPromo phases (the "Schedule promos — month grid" data) from PRODUCTION into
 * the local dev database, so the entries-multiplier badge renders locally with real values
 * instead of never appearing because dev has no schedule.
 *
 * WHY THIS EXISTS. The multiplier is not configuration — there is no env var for it. It resolves
 * at request time from the DB in this order (see ScheduledPromo's own header):
 *   Scheduled phase (if now is in range) → Toggle promo → Alternating → null
 * A dev DB with none of those resolves to `null`, `useResolvedMultiplier` returns null, and every
 * surface that shows a multiplier badge (package cards, hero CTA, floating countdown) silently
 * renders nothing. That looks like a broken badge but is actually an empty schedule.
 *
 * READS PROD, WRITES LOCAL — never the other way round. It opens two explicit connections rather
 * than using `connectOpsDb`, which switches the WHOLE process to one database and so cannot be
 * both source and destination in a single run. There is no code path here that writes to prod.
 *
 * Idempotent: a phase is matched on (type, startDate, endDate) and updated in place, so re-running
 * refreshes multipliers rather than stacking duplicate phases.
 *
 * Run:  npm run seed:scheduled-promos-from-prod:dry     (default — reports, writes nothing)
 *       npm run seed:scheduled-promos-from-prod         (applies)
 *       ... -- --months=3                                (window size, default 2)
 */

import path from "node:path";
import { config } from "dotenv";
import mongoose from "mongoose";
import { injectDbName } from "./connect-ops-db";

// `.env.local` explicitly — `dotenv/config` only reads `.env`, which this repo does not use, so
// the default would leave both MONGODB_URI and PROD_MONGODB_URI undefined.
config({ path: path.resolve(process.cwd(), ".env.local") });

const APPLY = process.argv.includes("--apply");
const monthsArg = process.argv.find((a) => a.startsWith("--months="))?.split("=")[1];
const MONTHS = Math.max(1, Number(monthsArg) || 2);

interface ScheduledPromoDoc {
  _id: mongoose.Types.ObjectId;
  type: string;
  multiplier: number;
  startDate: Date;
  endDate: Date;
  isActive?: boolean;
  name?: string;
  description?: string;
  deletedAt?: Date | null;
  createdBy?: mongoose.Types.ObjectId;
}

function hostOf(uri: string): string {
  return uri.replace(/^[^/]*\/\//, "").replace(/^[^@]*@/, "").split(/[/?]/)[0];
}

async function main(): Promise<void> {
  const prodUri = process.env.PROD_MONGODB_URI;
  const localUri = process.env.MONGODB_URI;
  if (!prodUri) {
    console.error("❌ PROD_MONGODB_URI is missing in .env.local — cannot read the production schedule.");
    process.exit(1);
  }
  if (!localUri) {
    console.error("❌ MONGODB_URI is missing in .env.local — no local database to seed.");
    process.exit(1);
  }

  // Prod Atlas string carries no /<dbName>, so a bare connect lands on an empty `test` DB.
  const prodResolved = injectDbName(prodUri, process.env.PROD_DB_NAME || "Production");

  console.log(`Scheduled-promo seed — ${APPLY ? "APPLY" : "DRY RUN"}`);
  console.log(`  source (read-only) : PROD  @ ${hostOf(prodResolved)}`);
  console.log(`  destination        : local @ ${hostOf(localUri)}`);

  const now = new Date();
  const windowStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const windowEnd = new Date(now.getFullYear(), now.getMonth() + MONTHS, 0, 23, 59, 59, 999);
  console.log(`  window             : ${windowStart.toISOString().slice(0, 10)} → ${windowEnd.toISOString().slice(0, 10)}\n`);

  const prodConn = await mongoose.createConnection(prodResolved).asPromise();
  const localConn = await mongoose.createConnection(localUri).asPromise();

  try {
    const phases = (await prodConn
      .collection("scheduledpromos")
      .find({
        deletedAt: { $in: [null, undefined] },
        startDate: { $lte: windowEnd },
        endDate: { $gte: windowStart },
      })
      .sort({ startDate: 1 })
      .toArray()) as unknown as ScheduledPromoDoc[];

    if (phases.length === 0) {
      console.log("No scheduled phases in prod for this window — nothing to seed.");
      console.log("The badge will stay hidden locally until a phase exists, which is correct behaviour.");
      return;
    }

    const byType = new Map<string, number>();
    for (const p of phases) byType.set(p.type, (byType.get(p.type) ?? 0) + 1);
    console.log(`Found ${phases.length} phase(s) in prod:`);
    for (const [type, n] of [...byType].sort()) console.log(`  ${type.padEnd(22)} ${n}`);
    const mults = [...new Set(phases.map((p) => p.multiplier))].sort((a, b) => a - b);
    console.log(`  multipliers present: ${mults.map((m) => `${m}x`).join(", ")}\n`);

    if (!APPLY) {
      for (const p of phases.slice(0, 10)) {
        console.log(
          `  ${p.startDate.toISOString().slice(0, 10)} → ${p.endDate.toISOString().slice(0, 10)}  ` +
            `${p.type.padEnd(22)} ${String(p.multiplier).padStart(3)}x${p.isActive === false ? "  (inactive)" : ""}`
        );
      }
      if (phases.length > 10) console.log(`  … and ${phases.length - 10} more`);
      console.log("\nDRY RUN — nothing written. Re-run with --apply (npm run seed:scheduled-promos-from-prod).");
      return;
    }

    let inserted = 0;
    let updated = 0;
    let done = 0;
    const every = Math.max(1, Math.floor(phases.length / 20)); // ~20 progress lines regardless of size
    const started = Date.now();

    for (const p of phases) {
      const filter = { type: p.type, startDate: p.startDate, endDate: p.endDate };
      const res = await localConn.collection("scheduledpromos").updateOne(
        filter,
        {
          $set: {
            multiplier: p.multiplier,
            isActive: p.isActive ?? true,
            name: p.name ?? null,
            description: p.description ?? null,
            deletedAt: null,
            updatedAt: new Date(),
          },
          $setOnInsert: {
            ...filter,
            // Prod's author id will not resolve to a local user; harmless, and keeps the shape valid.
            createdBy: p.createdBy ?? new mongoose.Types.ObjectId(),
            createdAt: new Date(),
          },
        },
        { upsert: true }
      );
      if (res.upsertedCount > 0) inserted++;
      else if (res.modifiedCount > 0) updated++;

      done++;
      if (done % every === 0 || done === phases.length) {
        const elapsed = (Date.now() - started) / 1000;
        const rate = done / Math.max(elapsed, 0.001);
        console.log(
          `  ${String(done).padStart(4)}/${phases.length} (${((100 * done) / phases.length).toFixed(0)}%) · ${rate.toFixed(1)}/s`
        );
      }
    }

    console.log(`\nDone. ${inserted} inserted, ${updated} updated, ${phases.length - inserted - updated} unchanged.`);
    console.log("Reload the homepage — the multiplier badge shows whenever today falls inside a phase.");
  } finally {
    await prodConn.close();
    await localConn.close();
  }
}

main().catch((err) => {
  console.error("✗ scheduled-promo seed failed:", err?.message ?? err);
  process.exit(2);
});
