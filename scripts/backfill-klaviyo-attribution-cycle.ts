#!/usr/bin/env npx tsx
/**
 * Reconcile the stored `convertingPlatform` of a draw cycle's `BenefitsGranted` PaymentEvents
 * against the CURRENT live owned-channel (Klaviyo) attribution logic — windowed and BIDIRECTIONAL.
 *
 * Why this exists: the cookie-only edge resolver can't see a Klaviyo touch that was captured at
 * SIGNUP and persisted on the user, so those conversions leaked to `direct`. The live fix
 * (`reconcilePersistedAttribution`) recovers them — but only when the Klaviyo touch is RECENT
 * enough to plausibly have driven the purchase (the 5-day owned-channel window). This script
 * applies the SAME function to already-saved rows so historical data matches live behaviour.
 *
 * Both directions, scoped to rows whose persisted UTM (`data.utmSource`+`data.utmMedium`) is Klaviyo:
 *   - UP-CREDIT   `direct`/other → `klaviyo_*`  when the signup/checkout Klaviyo touch is WITHIN the
 *                 5-day window (touch time = `data.attributionSource === "session" ? event time
 *                 : user.createdAt`).
 *   - DOWN-CORRECT `klaviyo_*` → `direct`        when the Klaviyo touch is STALE (outside the window) —
 *                 e.g. a user who joined via Klaviyo months ago and bought again with no recent click.
 *   - KEEP rows whose attribution was a real paid CLICK (`attributionConfidence === "click"`):
 *                 a paid ad legitimately won at the edge (paid-priority), so we never touch it.
 *
 * The window value comes from the single source of truth (`platformPriority.windowDaysFor`, 5d for
 * Klaviyo) via the shared `reconcilePersistedAttribution`, so this script can never drift from live.
 *
 * Usage:
 *   npx tsx scripts/backfill-klaviyo-attribution-cycle.ts --prod --dry-run --start=2026-06-28 --end=2026-07-28
 *   npx tsx scripts/backfill-klaviyo-attribution-cycle.ts --prod            --start=2026-06-28 --end=2026-07-28
 *   npm run backfill:klaviyo-cycle:dry -- --prod
 *   npm run backfill:klaviyo-cycle      -- --prod
 *
 * Options:
 *   --dry-run            compute + log + CSV, write nothing (run this first).
 *   --prod               target production (.env.production MONGODB_URI). Omit = local .env.local.
 *   --start=YYYY-MM-DD   cycle start (AEST, inclusive). Default 2026-06-28.
 *   --end=YYYY-MM-DD     cycle end   (AEST, exclusive). Default 2026-07-28.
 *   --no-csv             skip the CSV audit file.
 *
 * Safety: idempotent (re-running reproduces the same end state); read-mostly; the CSV records every
 *   old→new so a reversal is trivial. Live runs require --prod and print a PRODUCTION warning.
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
const NO_CSV = process.argv.includes("--no-csv");
const arg = (k: string) => process.argv.find((a) => a.startsWith(`${k}=`))?.split("=")[1];
const START_STR = arg("--start") ?? "2026-06-28";
const END_STR = arg("--end") ?? "2026-07-28";
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
  const { reconcilePersistedAttribution, resolveSignupTouchAtMs } = await import("../src/services/attribution/reconcilePersistedAttribution");
  const connectDB = (await import("../src/lib/mongodb")).default;
  const PaymentEvent = (await import("../src/models/PaymentEvent")).default;
  const User = (await import("../src/models/User")).default;
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
  console.log(`   window: ${START_STR} → ${END_STR} (AEST)  |  ${DRY_RUN ? "DRY-RUN (no writes)" : "LIVE WRITES"}  |  windowed + bidirectional`);
  if (PROD && !DRY_RUN) console.log("   ⚠️  Writing to PRODUCTION. Ctrl-C now if unintended.");

  const rows = await PaymentEvent.find(
    { eventType: "BenefitsGranted", timestamp: { $gte: startUTC, $lt: endUTC } },
    { paymentIntentId: 1, userId: 1, convertingPlatform: 1, attributionConfidence: 1, packageType: 1, data: 1, timestamp: 1 }
  )
    .lean()
    .exec();

  console.log(`\nScanning ${rows.length} BenefitsGranted events…\n`);

  // Candidate rows: persisted UTM normalises to Klaviyo. Batch-fetch signup time for the window.
  const candidates = (rows as Array<Record<string, unknown>>).filter((r) => {
    const d = (r.data ?? {}) as { utmSource?: string; utmMedium?: string };
    const last = normalizeUtmToPlatform(d.utmSource, d.utmMedium);
    return last != null && KLAVIYO.has(last);
  });
  const userIds = [...new Set(candidates.map((r) => String(r.userId)))];
  const users = await User.find(
    { _id: { $in: userIds } },
    { createdAt: 1, "signupAttribution.visitedAt": 1 }
  ).lean().exec();
  // Anchor = captured ad/link-visit time (visitedAt), createdAt as legacy fallback —
  // resolveSignupTouchAtMs, the same anchor the live webhook uses (2026-07-19: account
  // age buried returning members whose signupAttribution was refreshed in place).
  const touchAtMap = new Map(
    (users as Array<{ _id: unknown; createdAt?: Date; signupAttribution?: { visitedAt?: Date } }>).map((u) => [
      String(u._id),
      resolveSignupTouchAtMs(u.signupAttribution?.visitedAt, u.createdAt),
    ])
  );

  type Bucket = { count: number; revenue: number };
  const add = (b: Bucket, price: number) => { b.count += 1; b.revenue += price; };
  const empty = (): Bucket => ({ count: 0, revenue: 0 });

  const upCredited = empty();        // direct/other → klaviyo_* (fresh touch)
  const downCorrected = empty();     // klaviyo_* → direct (stale touch)
  const keptKlaviyo = empty();       // already klaviyo_* AND within window → unchanged
  const keptPaidClick = empty();     // attributionConfidence === "click" → paid won, skip
  const toWrite: Array<{ _id: unknown; from: string; to: string; pid?: string; ageDays: number | null }> = [];

  for (const r of candidates) {
    const data = (r.data ?? {}) as { utmSource?: string; utmMedium?: string; price?: number; attributionSource?: string };
    const price = typeof data.price === "number" ? data.price : 0;
    const current = (r.convertingPlatform as string | null) ?? "direct";
    const conf = (r.attributionConfidence as string | null) ?? "utm_only";

    // A real paid click won at the edge (paid-priority). Never override it.
    if (conf === "click") { add(keptPaidClick, price); continue; }

    const eventMs = new Date(r.timestamp as Date).getTime();
    const touchAt = data.attributionSource === "session" ? eventMs : (touchAtMap.get(String(r.userId)) ?? null);
    const ageDays = touchAt == null ? null : (eventMs - touchAt) / 86_400_000;

    // Same function the live path uses. edgePlatform="direct" models "no positive click";
    // the window then decides klaviyo (fresh) vs direct (stale).
    const desired = reconcilePersistedAttribution({
      edgePlatform: "direct",
      edgeConfidence: "utm_only",
      persistedUtmSource: data.utmSource,
      persistedUtmMedium: data.utmMedium,
      persistedTouchAt: touchAt,
      now: eventMs,
    }).platform;

    if (desired === current) {
      if (KLAVIYO.has(current)) add(keptKlaviyo, price); // already correct, within window
      continue;
    }

    if (KLAVIYO.has(desired)) add(upCredited, price);    // direct → klaviyo
    else add(downCorrected, price);                      // klaviyo → direct
    toWrite.push({ _id: r._id, from: `${current}/${conf}`, to: desired, pid: r.paymentIntentId as string | undefined, ageDays });
  }

  // CSV audit
  if (!NO_CSV) {
    const header = "paymentIntentId,from,to,ageDays,dryRun\n";
    const body = toWrite
      .map((w) => [w.pid, w.from, w.to, w.ageDays == null ? "" : w.ageDays.toFixed(2), DRY_RUN].map(csvEscape).join(","))
      .join("\n");
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
  const line = (label: string, b: Bucket) => `  ${label.padEnd(36)} ${String(b.count).padStart(5)}   ${money(b.revenue).padStart(12)}`;
  console.log(`\n========== Klaviyo attribution reconcile — ${START_STR}→${END_STR} ==========`);
  console.log(line("UP-credit  → klaviyo (fresh ≤5d)", upCredited));
  console.log(line("DOWN-correct → direct (stale >5d)", downCorrected));
  console.log(line("Kept klaviyo (already, fresh)", keptKlaviyo));
  console.log(line("Kept paid click (skipped)", keptPaidClick));
  console.log("  " + "-".repeat(55));
  const trueKlaviyo: Bucket = { count: upCredited.count + keptKlaviyo.count, revenue: upCredited.revenue + keptKlaviyo.revenue };
  console.log(line("TRUE Klaviyo (windowed) ✅", trueKlaviyo));
  console.log("=".repeat(72));
  console.log(DRY_RUN ? "\nDRY-RUN — nothing written. Re-run without --dry-run to apply." : `\nDONE — wrote ${written}, errors ${errors}.`);

  await mongoose.disconnect();
  process.exit(errors > 0 ? 2 : 0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(3);
});
