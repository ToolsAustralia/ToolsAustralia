#!/usr/bin/env npx tsx
/**
 * Re-credit Klaviyo conversions that the live resolver (shipped ~2026-06-01) mis-attributed to
 * `direct` (and a few to a first-touch paid source) during a draw cycle. The live resolver read the
 * FIRST-touch `_ta_attr` cookie; Klaviyo is a returning-user channel, so its conversions leaked.
 * The forward fix (owned-channel last-touch) is code-only and does NOT rewrite already-saved rows —
 * this backfill corrects the historical `convertingPlatform` for one cycle so the dashboard reflects
 * how much actually converted via Klaviyo.
 *
 * What it does: for `BenefitsGranted` PaymentEvents in the window whose LAST-touch UTM
 * (`data.utmSource` + `data.utmMedium`) normalizes to an owned channel (klaviyo_email / klaviyo_sms)
 * but whose stored `convertingPlatform` is NOT already that channel, set `convertingPlatform` to the
 * normalized Klaviyo channel and `attributionConfidence = "utm_only"` (a live last-touch credit).
 *
 * Attribution model (matches the deployed fix — see docs/tracking/architecture.md):
 *   - DEFAULT (paid-priority): rows whose existing attribution was a real paid CLICK
 *     (`attributionConfidence === "click"`) are KEPT — a paid ad legitimately acquired that user.
 *   - `--include-paid-overlap` (strict last-touch): also re-credit those click rows to Klaviyo.
 * The dry-run reports BOTH totals regardless, so you can choose before the live run.
 *
 * Usage:
 *   npx tsx scripts/backfill-klaviyo-attribution-cycle.ts --prod --dry-run      # report only (prod)
 *   npx tsx scripts/backfill-klaviyo-attribution-cycle.ts --prod               # WRITE (prod)
 *   npm run backfill:klaviyo-cycle:dry -- --prod
 *   npm run backfill:klaviyo-cycle      -- --prod
 *
 * Options:
 *   --dry-run               compute + log + CSV, write nothing (run this first).
 *   --prod                  target production (.env.production MONGODB_URI). Omit = local .env.local.
 *   --include-paid-overlap  strict last-touch: also re-credit rows whose confidence is "click".
 *   --start=YYYY-MM-DD      cycle start (AEST, inclusive). Default 2026-05-28.
 *   --end=YYYY-MM-DD        cycle end   (AEST, exclusive). Default 2026-06-28.
 *   --no-csv                skip the CSV audit file.
 *
 * Safety: idempotent (skips rows already credited to the same Klaviyo channel); read-mostly; the CSV
 *   records every old→new so a reversal is trivial. Live runs require --prod and confirmation.
 * Env: .env.local (local) or .env.production (with --prod) must contain MONGODB_URI.
 *
 * Exit: 0 clean · 2 per-row write errors · 3 fatal.
 * @module scripts/backfill-klaviyo-attribution-cycle
 */
import { config } from "dotenv";
import * as fs from "fs";
import path from "path";

const PROD = process.argv.includes("--prod");
config({ path: path.resolve(process.cwd(), ".env.local") });
if (PROD) config({ path: path.resolve(process.cwd(), ".env.production"), override: true });

const DRY_RUN = process.argv.includes("--dry-run");
const INCLUDE_PAID_OVERLAP = process.argv.includes("--include-paid-overlap");
const NO_CSV = process.argv.includes("--no-csv");
const arg = (k: string) => process.argv.find((a) => a.startsWith(`${k}=`))?.split("=")[1];
const START_STR = arg("--start") ?? "2026-05-28";
const END_STR = arg("--end") ?? "2026-06-28";
const CSV_PATH =
  arg("--csv-path") ??
  path.resolve(process.cwd(), `backfill-klaviyo-cycle-${DRY_RUN ? "dry-" : ""}${new Date().toISOString().replace(/[:.]/g, "-")}.csv`);

const KLAVIYO = new Set(["klaviyo_email", "klaviyo_sms"]);

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
/** data.price is stored in DOLLARS (set as invoice.amount_paid / 100); revenueAggregator sums it as-is. */
function money(dollars: number): string {
  return `$${dollars.toFixed(2)}`;
}

async function main() {
  const { createAESTDateAsUTC } = await import("../src/utils/common/timezone");
  const { normalizeUtmToPlatform } = await import("../src/services/attribution/normalizePlatform");
  const connectDB = (await import("../src/lib/mongodb")).default;
  const PaymentEvent = (await import("../src/models/PaymentEvent")).default;
  const mongoose = (await import("mongoose")).default;

  const [sy, sm, sd] = START_STR.split("-").map(Number);
  const [ey, em, ed] = END_STR.split("-").map(Number);
  const startUTC = createAESTDateAsUTC(sy, sm, sd, 0, 0);
  const endUTC = createAESTDateAsUTC(ey, em, ed, 0, 0);

  await connectDB();
  const dbName = mongoose.connection.db?.databaseName ?? "(unknown)";
  const uri = process.env.MONGODB_URI ?? "";
  const host = uri.includes("@") ? uri.slice(uri.indexOf("@") + 1).split("/")[0] : "(host?)";
  console.log(`🔌 backfill-klaviyo-cycle · ${PROD ? "PROD" : "local"} · db="${dbName}" @ ${host}`);
  console.log(`   window: ${START_STR} → ${END_STR} (AEST)  |  ${DRY_RUN ? "DRY-RUN (no writes)" : "LIVE WRITES"}  |  model: ${INCLUDE_PAID_OVERLAP ? "strict last-touch" : "paid-priority"}`);
  if (PROD && !DRY_RUN) console.log("   ⚠️  Writing to PRODUCTION. Ctrl-C now if unintended.");

  const rows = await PaymentEvent.find(
    { eventType: "BenefitsGranted", timestamp: { $gte: startUTC, $lt: endUTC } },
    { paymentIntentId: 1, convertingPlatform: 1, attributionConfidence: 1, packageType: 1, data: 1, timestamp: 1 }
  )
    .lean()
    .exec();

  console.log(`\nScanning ${rows.length} BenefitsGranted events…\n`);

  type Bucket = { count: number; revenue: number };
  const add = (b: Bucket, price: number) => { b.count += 1; b.revenue += price; };
  const empty = (): Bucket => ({ count: 0, revenue: 0 });

  const currentKlaviyo = empty();          // already convertingPlatform=klaviyo_*
  const recreditFromDirect = empty();      // leaked → direct/other
  const recreditFromUtmPaid = empty();     // leaked → meta/google via utm (no real click)
  const paidOverlapKept = empty();         // klaviyo last-touch BUT real paid click → kept (strict-only delta)
  const toWrite: Array<{ _id: unknown; from: string; to: string; pid?: string }> = [];

  for (const r of rows as Array<Record<string, unknown>>) {
    const data = (r.data ?? {}) as { utmSource?: string; utmMedium?: string; price?: number; billingReason?: string };
    const price = typeof data.price === "number" ? data.price : 0;
    const current = (r.convertingPlatform as string | null) ?? "direct";
    const last = normalizeUtmToPlatform(data.utmSource, data.utmMedium);
    if (!last || !KLAVIYO.has(last)) continue; // last-touch wasn't Klaviyo → not ours

    if (KLAVIYO.has(current)) { add(currentKlaviyo, price); continue; } // already correct (idempotent)

    const conf = (r.attributionConfidence as string | null) ?? "utm_only";
    if (conf === "click") {
      add(paidOverlapKept, price);
      if (!INCLUDE_PAID_OVERLAP) continue; // paid-priority: a real paid click keeps the credit
    }

    if (current === "direct" || current === "other") add(recreditFromDirect, price);
    else add(recreditFromUtmPaid, price);
    toWrite.push({ _id: r._id, from: `${current}/${conf}`, to: last, pid: r.paymentIntentId as string | undefined });
  }

  // CSV audit
  if (!NO_CSV) {
    const header = "paymentIntentId,from,to,model,dryRun\n";
    const body = toWrite.map((w) => [w.pid, w.from, w.to, INCLUDE_PAID_OVERLAP ? "strict" : "paid-priority", DRY_RUN].map(csvEscape).join(",")).join("\n");
    fs.writeFileSync(CSV_PATH, header + body + (body ? "\n" : ""));
    console.log(`📄 CSV: ${path.relative(process.cwd(), CSV_PATH)} (${toWrite.length} rows)`);
  }

  // Apply
  let written = 0, errors = 0;
  if (!DRY_RUN && toWrite.length) {
    const logEvery = Math.max(1, Math.floor(toWrite.length / 20));
    for (let i = 0; i < toWrite.length; i++) {
      const w = toWrite[i];
      try {
        await PaymentEvent.updateOne({ _id: w._id }, { $set: { convertingPlatform: w.to, attributionConfidence: "utm_only" } });
        written++;
      } catch (e) {
        errors++;
        console.error(`  ✗ ${w.pid}: ${(e as Error).message}`);
      }
      if ((i + 1) % logEvery === 0 || i === toWrite.length - 1) {
        console.log(`  … wrote ${i + 1}/${toWrite.length}`);
      }
    }
  }

  // Report
  const recreditTotal = empty();
  add2(recreditTotal, recreditFromDirect);
  add2(recreditTotal, recreditFromUtmPaid);
  function add2(t: Bucket, b: Bucket) { t.count += b.count; t.revenue += b.revenue; }

  const line = (label: string, b: Bucket) => `  ${label.padEnd(34)} ${String(b.count).padStart(5)}   ${money(b.revenue).padStart(12)}`;
  console.log(`\n================ Klaviyo attribution — ${START_STR}→${END_STR} ================`);
  console.log(line("Already credited klaviyo_*", currentKlaviyo));
  console.log(line("Re-credit ← direct/other", recreditFromDirect));
  console.log(line("Re-credit ← paid-via-UTM (no click)", recreditFromUtmPaid));
  console.log("  " + "-".repeat(53));
  console.log(line("Re-credited this run", { count: written || toWrite.length, revenue: recreditTotal.revenue }));
  console.log("  " + "=".repeat(53));
  const ppTotal: Bucket = { count: currentKlaviyo.count + recreditTotal.count, revenue: currentKlaviyo.revenue + recreditTotal.revenue };
  const strictTotal: Bucket = { count: ppTotal.count + paidOverlapKept.count, revenue: ppTotal.revenue + paidOverlapKept.revenue };
  console.log(line("TRUE Klaviyo (paid-priority) ✅", ppTotal));
  console.log(line("  …had a real paid click (kept)", paidOverlapKept));
  console.log(line("TRUE Klaviyo (strict last-touch)", strictTotal));
  console.log("=".repeat(70));
  console.log(DRY_RUN ? "\nDRY-RUN — nothing written. Re-run without --dry-run to apply." : `\nDONE — wrote ${written}, errors ${errors}.`);

  await mongoose.disconnect();
  process.exit(errors > 0 ? 2 : 0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(3);
});
