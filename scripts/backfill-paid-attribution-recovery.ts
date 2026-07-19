#!/usr/bin/env npx tsx
/**
 * Reclassify historical `BenefitsGranted` PaymentEvents bucketed `convertingPlatform: "direct"`
 * that qualify under the LIVE signup-anchored strict-window PAID recovery rule (2026-07-19,
 * `reconcilePersistedAttribution`) — the cookie-gap leak: a purchase within the platform's 7-day
 * click window of a paid-UTM SIGNUP whose `_ta_attr` cookie was missing at PI-creation time
 * (in-app-browser signup → external-browser checkout, Safari ITP) was stamped `direct` even
 * though the persisted signup UTM identified the paid platform.
 *
 * UP-CREDIT ONLY, exactly mirroring live:
 *   - `direct` → `meta`/`tiktok`/`snapchat`/`google` when the persisted UTM normalises to a
 *     tier-1 paid platform AND the touch is signup-anchored (`data.attributionSource === "signup"`,
 *     dated by the captured AD-VISIT time `signupAttribution.visitedAt`, falling back to
 *     `user.createdAt` for legacy records — `resolveSignupTouchAtMs`) AND the purchase falls
 *     within the platform's click window (7d) of that anchor — decided by the SAME
 *     `reconcilePersistedAttribution` the webhook runs, evaluated at the ORIGINAL purchase
 *     time (`event.timestamp`), so this script can never drift from live.
 *   - Session-carried UTMs never flip (undatable — the client payload strips the cookie's
 *     `capturedAt`; renewals re-carry frozen metadata). Missing `attributionSource` is treated
 *     as session (conservative: unknown origin → no flip).
 *   - NO down-correction: rows already credited to a paid platform are never touched (the
 *     no-edge-metadata UTM fallback that produced them is deliberately unchanged in live).
 *   - Rows with `attributionConfidence === "click"` are never touched (a real paid click won).
 *
 * Usage:
 *   npx tsx scripts/backfill-paid-attribution-recovery.ts --prod --dry-run
 *   npx tsx scripts/backfill-paid-attribution-recovery.ts --prod
 *   npm run backfill:paid-attribution:dry -- --prod
 *   npm run backfill:paid-attribution     -- --prod
 *
 * Options:
 *   --dry-run            compute + log + CSV, write nothing (run this first).
 *   --prod               target production (.env.production MONGODB_URI). Omit = local .env.local.
 *   --start=YYYY-MM-DD   window start (AEST, inclusive). Default 2026-06-01 (live resolver era).
 *   --end=YYYY-MM-DD     window end   (AEST, exclusive). Default: tomorrow.
 *   --no-csv             skip the CSV audit file.
 *   --csv-path=<path>    override the CSV audit file location.
 *
 * Safety: idempotent (a flipped row no longer matches the `convertingPlatform: "direct"` scope);
 *   up-credit only; the CSV records every old→new so a reversal is trivial. Live runs require
 *   --prod to hit production and print a PRODUCTION warning.
 * Env: .env.local (local) or .env.production (with --prod) must contain MONGODB_URI.
 *
 * Exit: 0 clean · 2 per-row write errors · 3 fatal.
 * @module scripts/backfill-paid-attribution-recovery
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
const START_STR = arg("--start") ?? "2026-06-01";
const END_STR =
  arg("--end") ??
  (() => {
    const t = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  })();
const CSV_PATH =
  arg("--csv-path") ??
  path.resolve(
    process.cwd(),
    `backfill-paid-attribution-${DRY_RUN ? "dry-" : ""}${new Date().toISOString().replace(/[:.]/g, "-")}.csv`
  );

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
/** data.price is stored in DOLLARS (invoice.amount_paid / 100); revenueAggregator sums it as-is. */
function money(dollars: number): string {
  return `$${dollars.toFixed(2)}`;
}

async function main() {
  const { createAESTDateAsUTC } = await import("../src/utils/common/timezone");
  const { normalizeUtmToPlatform } = await import("../src/services/attribution/normalizePlatform");
  const { reconcilePersistedAttribution, resolveSignupTouchAtMs } = await import(
    "../src/services/attribution/reconcilePersistedAttribution"
  );
  const { PLATFORM_PRIORITY } = await import("../src/services/attribution/platformPriority");
  const connectDB = (await import("../src/lib/mongodb")).default;
  const PaymentEvent = (await import("../src/models/PaymentEvent")).default;
  const User = (await import("../src/models/User")).default;
  const mongoose = (await import("mongoose")).default;

  // Paid platforms = non-owned rows — derived from the single source of truth, not a
  // forked list. (platformPriority replaced `tier: 1|2` with `owned: boolean` on main.)
  const PAID = new Set(PLATFORM_PRIORITY.filter((r) => !r.owned).map((r) => r.platform));

  const [sy, sm, sd] = START_STR.split("-").map(Number);
  const [ey, em, ed] = END_STR.split("-").map(Number);
  const startUTC = createAESTDateAsUTC(sy, sm, sd, 0, 0);
  const endUTC = createAESTDateAsUTC(ey, em, ed, 0, 0);

  await connectDB();
  const dbName = mongoose.connection.db?.databaseName ?? "(unknown)";
  const uri = process.env.MONGODB_URI ?? "";
  const host = uri.includes("@") ? uri.slice(uri.indexOf("@") + 1).split("/")[0] : "(host?)";
  console.log(`🔌 backfill-paid-attribution · ${PROD ? "PROD" : "local"} · db="${dbName}" @ ${host}`);
  console.log(
    `   window: ${START_STR} → ${END_STR} (AEST)  |  ${DRY_RUN ? "DRY-RUN (no writes)" : "LIVE WRITES"}  |  up-credit only, signup-anchored ≤ platform window`
  );
  if (PROD && !DRY_RUN) console.log("   ⚠️  Writing to PRODUCTION. Ctrl-C now if unintended.");

  const rows = await PaymentEvent.find(
    {
      eventType: "BenefitsGranted",
      timestamp: { $gte: startUTC, $lt: endUTC },
      convertingPlatform: "direct",
    },
    { paymentIntentId: 1, userId: 1, convertingPlatform: 1, attributionConfidence: 1, data: 1, timestamp: 1 }
  )
    .lean()
    .exec();

  console.log(`\nScanning ${rows.length} direct-bucketed BenefitsGranted events…\n`);

  // Candidate rows: persisted UTM normalises to a PAID platform. Batch-fetch signup times.
  const candidates = (rows as Array<Record<string, unknown>>).filter((r) => {
    const d = (r.data ?? {}) as { utmSource?: string; utmMedium?: string };
    const p = normalizeUtmToPlatform(d.utmSource, d.utmMedium);
    return p != null && PAID.has(p);
  });
  const userIds = [...new Set(candidates.map((r) => String(r.userId)))];
  const users = await User.find(
    { _id: { $in: userIds } },
    { createdAt: 1, "signupAttribution.visitedAt": 1 }
  ).lean().exec();
  // Anchor = captured ad-visit time (visitedAt), createdAt only as legacy fallback —
  // same resolveSignupTouchAtMs the live webhook uses (account age buried returning
  // members converting off retargeting ads).
  const touchAtMap = new Map(
    (users as Array<{ _id: unknown; createdAt?: Date; signupAttribution?: { visitedAt?: Date } }>).map((u) => [
      String(u._id),
      resolveSignupTouchAtMs(u.signupAttribution?.visitedAt, u.createdAt),
    ])
  );

  type Bucket = { count: number; revenue: number };
  const add = (b: Bucket, price: number) => { b.count += 1; b.revenue += price; };
  const empty = (): Bucket => ({ count: 0, revenue: 0 });

  const flippedByPlatform = new Map<string, Bucket>();
  const keptSessionUndatable = empty();  // session-carried / unknown-origin UTM → stays direct
  const keptOutOfWindow = empty();       // signup-anchored but > platform window → stays direct
  const keptNoAnchor = empty();          // signup-sourced but user/createdAt missing → stays direct
  const keptPaidClick = empty();         // confidence "click" — never touched
  const toWrite: Array<{
    _id: unknown;
    pid?: string;
    to: string;
    ageDays: number | null;
    price: number;
    attributionSource: string;
  }> = [];

  for (const r of candidates) {
    const data = (r.data ?? {}) as {
      utmSource?: string;
      utmMedium?: string;
      price?: number;
      attributionSource?: string;
    };
    const price = typeof data.price === "number" ? data.price : 0;
    const conf = (r.attributionConfidence as string | null) ?? "utm_only";
    if (conf === "click") { add(keptPaidClick, price); continue; }

    const attributionSource = data.attributionSource ?? "(missing)";
    const eventMs = new Date(r.timestamp as Date).getTime();

    // LIVE dating rule: session-carried (or unknown-origin) UTMs are undatable → null →
    // the strict paid recovery never fires. Signup-sourced → ad-visit anchor.
    const touchAt =
      data.attributionSource === "signup" ? (touchAtMap.get(String(r.userId)) ?? null) : null;

    if (data.attributionSource !== "signup") { add(keptSessionUndatable, price); continue; }
    if (touchAt == null) { add(keptNoAnchor, price); continue; }

    const ageDays = (eventMs - touchAt) / 86_400_000;
    // Same function the live webhook runs, evaluated at the ORIGINAL purchase time.
    const desired = reconcilePersistedAttribution({
      edgePlatform: "direct",
      edgeConfidence: "utm_only",
      persistedUtmSource: data.utmSource,
      persistedUtmMedium: data.utmMedium,
      persistedTouchAt: touchAt,
      now: eventMs,
    }).platform;

    if (desired === "direct" || !PAID.has(desired)) {
      add(keptOutOfWindow, price);
      continue;
    }

    if (!flippedByPlatform.has(desired)) flippedByPlatform.set(desired, empty());
    add(flippedByPlatform.get(desired)!, price);
    toWrite.push({
      _id: r._id,
      pid: r.paymentIntentId as string | undefined,
      to: desired,
      ageDays,
      price,
      attributionSource,
    });
  }

  // CSV audit
  if (!NO_CSV) {
    const header = "paymentIntentId,from,to,ageDaysFromAdVisitAnchor,priceDollars,attributionSource,dryRun\n";
    const body = toWrite
      .map((w) =>
        [w.pid, "direct/utm_only", w.to, w.ageDays == null ? "" : w.ageDays.toFixed(2), w.price.toFixed(2), w.attributionSource, DRY_RUN]
          .map(csvEscape)
          .join(",")
      )
      .join("\n");
    fs.writeFileSync(CSV_PATH, header + body + (body ? "\n" : ""));
    console.log(`📄 CSV: ${path.relative(process.cwd(), CSV_PATH)} (${toWrite.length} rows)`);
  }

  // Apply
  let written = 0, errors = 0;
  if (!DRY_RUN && toWrite.length) {
    const logEvery = Math.max(1, Math.floor(toWrite.length / 20));
    const startedAt = Date.now();
    for (let i = 0; i < toWrite.length; i++) {
      const w = toWrite[i];
      try {
        await PaymentEvent.updateOne(
          { _id: w._id, convertingPlatform: "direct" }, // guard: never clobber a concurrent change
          { $set: { convertingPlatform: w.to, attributionConfidence: "utm_only" } }
        );
        written++;
      } catch (e) {
        errors++;
        console.error(`  ✗ ${w.pid}: ${(e as Error).message}`);
      }
      if ((i + 1) % logEvery === 0 || i === toWrite.length - 1) {
        const rate = (i + 1) / ((Date.now() - startedAt) / 1000);
        const eta = Math.round((toWrite.length - i - 1) / Math.max(rate, 0.1));
        console.log(`  … wrote ${i + 1}/${toWrite.length} (${Math.round(((i + 1) / toWrite.length) * 100)}%) · ${rate.toFixed(1)}/s · ETA ${eta}s`);
      }
    }
  }

  // Report
  const line = (label: string, b: Bucket) =>
    `  ${label.padEnd(44)} ${String(b.count).padStart(5)}   ${money(b.revenue).padStart(12)}`;
  console.log(`\n========== Paid-UTM attribution recovery — ${START_STR}→${END_STR} ==========`);
  const totalFlipped = empty();
  for (const [platform, b] of [...flippedByPlatform.entries()].sort((a, z) => z[1].count - a[1].count)) {
    console.log(line(`FLIP direct → ${platform} (signup ≤ window)`, b));
    totalFlipped.count += b.count;
    totalFlipped.revenue += b.revenue;
  }
  if (flippedByPlatform.size === 0) console.log(line("FLIP (none qualified)", empty()));
  console.log("  " + "-".repeat(64));
  console.log(line("TOTAL flipped ✅", totalFlipped));
  console.log(line("Kept direct — session/unknown (undatable)", keptSessionUndatable));
  console.log(line("Kept direct — signup out-of-window (stale)", keptOutOfWindow));
  console.log(line("Kept direct — no visitedAt/createdAt anchor", keptNoAnchor));
  console.log(line("Kept — real paid click (never touched)", keptPaidClick));
  console.log("=".repeat(78));
  console.log(
    DRY_RUN
      ? "\nDRY-RUN — nothing written. Re-run without --dry-run to apply."
      : `\nDONE — wrote ${written}, errors ${errors}.`
  );

  await mongoose.disconnect();
  process.exit(errors > 0 ? 2 : 0);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(3);
});
