/**
 * READ-ONLY audit — Basil `current_period_end` downgrade corruption.
 *
 * The downgrade route (`/api/stripe/downgrade-subscription`) stores
 * `subscription.previousSubscription.endDate` as the "keep old benefits until"
 * date. Under the Stripe Basil API it was reading the now-undefined ROOT
 * `current_period_end` and falling back to `startDate + 30 days` — so the
 * preservation window was mis-dated. This script QUANTIFIES the blast radius.
 * It NEVER writes. Pair with a repair pass only after reviewing the output.
 *
 *   npx tsx scripts/audit-downgrade-period-end.ts            # local DB
 *   npx tsx scripts/audit-downgrade-period-end.ts --prod     # PROD (read-only)
 *
 * Classifications per affected user (those with a `previousSubscription`):
 *   - FALLBACK_SIGNATURE : endDate is exactly ~30 days after startDate (the buggy fallback shape)
 *   - HARMFUL_EXPIRED    : endDate is BEFORE downgradeDate → benefits wrongly expired at downgrade time
 *   - ACTIVE             : endDate is in the future → still inside the (possibly wrong) preservation window
 *
 * Output: console summary + CSV at temp/readonly/downgrade-period-end-audit-<ts>.csv
 */

import { config } from "dotenv";
import fs from "fs";
import path from "path";
import { connectOpsDb } from "./connect-ops-db";

// Load .env.local before connectOpsDb reads PROD_MONGODB_URI / MONGODB_URI in main().
// (connectOpsDb only touches env when called, which happens after this runs.)
config({ path: path.resolve(process.cwd(), ".env.local") });

const DAY_MS = 24 * 60 * 60 * 1000;
const daysBetween = (a: Date, b: Date) => Math.round((a.getTime() - b.getTime()) / DAY_MS);

interface PreviousSubscription {
  packageName?: string;
  startDate?: Date;
  endDate?: Date;
  downgradeDate?: Date;
}
interface AuditUserDoc {
  _id: unknown;
  email?: string;
  subscription?: {
    startDate?: Date;
    packageId?: string;
    previousSubscription?: PreviousSubscription;
  };
}

async function main() {
  const mongoose = await connectOpsDb("audit-downgrade-period-end");
  const User = (await import("../src/models/User")).default;

  // Up-front total (gives progress a denominator).
  const filter = { "subscription.previousSubscription": { $exists: true, $ne: null } };
  const total = await User.countDocuments(filter);
  console.log(`\n📊 Users with a previousSubscription (downgraded): ${total}\n`);

  if (total === 0) {
    console.log("✅ No downgrade records found — nothing to audit.");
    await mongoose.connection.close();
    return;
  }

  const cursor = User.find(filter)
    .select("email subscription.startDate subscription.packageId subscription.previousSubscription")
    .lean<AuditUserDoc[]>()
    .cursor();

  const rows: string[] = [
    "userId,email,packageName,startDate,endDate,downgradeDate,daysStartToEnd,daysEndVsDowngrade,classification",
  ];
  let processed = 0;
  let fallbackSignature = 0;
  let harmfulExpired = 0;
  let active = 0;
  let missingDates = 0;
  let earliestDowngrade: Date | null = null;
  let latestDowngrade: Date | null = null;
  const now = new Date();
  const logEvery = Math.max(1, Math.floor(total / 20)); // ~20 progress lines regardless of size
  const startedAt = Date.now();

  for await (const doc of cursor) {
    processed++;
    const prev = doc.subscription?.previousSubscription;
    const start = prev?.startDate ? new Date(prev.startDate) : undefined;
    const end = prev?.endDate ? new Date(prev.endDate) : undefined;
    const downgrade = prev?.downgradeDate ? new Date(prev.downgradeDate) : undefined;

    let classification = "OK_OR_LEGACY";
    if (!start || !end) {
      missingDates++;
      classification = "MISSING_DATES";
    } else {
      const daysStartToEnd = daysBetween(end, start);
      const daysEndVsDowngrade = downgrade ? daysBetween(end, downgrade) : null;

      if (downgrade) {
        if (!earliestDowngrade || downgrade < earliestDowngrade) earliestDowngrade = downgrade;
        if (!latestDowngrade || downgrade > latestDowngrade) latestDowngrade = downgrade;
      }

      // Exactly ~30 calendar days = the buggy `startDate + 30d` fallback shape.
      const isFallbackShape = daysStartToEnd >= 29 && daysStartToEnd <= 31;
      const isExpiredAtDowngrade = daysEndVsDowngrade !== null && daysEndVsDowngrade < 0;
      const isActive = end > now;

      if (isExpiredAtDowngrade) {
        harmfulExpired++;
        classification = "HARMFUL_EXPIRED";
      } else if (isFallbackShape) {
        fallbackSignature++;
        classification = "FALLBACK_SIGNATURE";
      }
      if (isActive) active++;

      rows.push(
        [
          String(doc._id),
          doc.email ?? "",
          (prev?.packageName ?? "").replace(/,/g, " "),
          start.toISOString(),
          end.toISOString(),
          downgrade ? downgrade.toISOString() : "",
          daysStartToEnd,
          daysEndVsDowngrade ?? "",
          classification,
        ].join(",")
      );
    }

    if (processed % logEvery === 0 || processed === total) {
      const rate = processed / Math.max(1, (Date.now() - startedAt) / 1000);
      const etaSec = Math.round((total - processed) / Math.max(0.001, rate));
      console.log(
        `… ${processed}/${total} (${Math.round((processed / total) * 100)}%) · ${rate.toFixed(1)}/s · ETA ${etaSec}s`
      );
    }
  }

  // CSV audit log (append-safe, in the gitignored temp/readonly dir).
  const outDir = path.join(process.cwd(), "temp", "readonly");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = path.join(outDir, `downgrade-period-end-audit-${stamp}.csv`);
  fs.writeFileSync(outPath, rows.join("\n"), "utf8");

  console.log("\n──────── SUMMARY ────────");
  console.log(`Total downgrade records      : ${total}`);
  console.log(`FALLBACK_SIGNATURE (~30d)    : ${fallbackSignature}`);
  console.log(`HARMFUL_EXPIRED (end<downgr) : ${harmfulExpired}  ← benefits wrongly expired`);
  console.log(`ACTIVE (endDate in future)   : ${active}  ← repairable now via Stripe re-fetch`);
  console.log(`MISSING_DATES                : ${missingDates}`);
  if (earliestDowngrade && latestDowngrade) {
    console.log(`Downgrade date range         : ${earliestDowngrade.toISOString()} → ${latestDowngrade.toISOString()}`);
  }
  console.log(`CSV                          : ${outPath}`);
  console.log("─────────────────────────\n");

  await mongoose.connection.close();

  // 3-tier exit: 0 clean, 1 harmful cases found (needs repair decision), 0 otherwise.
  if (harmfulExpired > 0) {
    console.log("⚠️  Harmful cases found — review CSV and decide on a repair pass.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("❌ Audit failed:", err);
  process.exit(2);
});
