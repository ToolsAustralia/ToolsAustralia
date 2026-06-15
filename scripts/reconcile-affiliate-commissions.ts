#!/usr/bin/env npx tsx
/**
 * Affiliate commission reconciliation — CLI wrapper around the shared core
 * (`src/utils/affiliate/reconcile-commissions.ts`). The daily cron
 * (`/api/cron/reconcile-affiliate-commissions`) uses the same core, so the logic
 * lives in exactly one place.
 *
 * READ-ONLY by default. Reviewed-backfill workflow:
 *   npm run reconcile:affiliate-commissions:dry          # audit + CSV, no writes
 *   npm run reconcile:affiliate-commissions              # create missing (dev)
 *   npm run reconcile:affiliate-commissions:prod:dry     # audit prod
 *   npm run reconcile:affiliate-commissions:prod         # create missing on prod
 *
 * Flags: --apply (write), --prod (target PROD_MONGODB_URI/Production), --since-days=N
 * (bound the scan to a trailing window; default = full sweep).
 *
 * Env: MONGODB_URI (and PROD_MONGODB_URI for --prod) in .env.local.
 */

import { config } from "dotenv";
import path from "node:path";
import fs from "node:fs";
import { connectOpsDb } from "./connect-ops-db";

config({ path: path.resolve(process.cwd(), ".env.local") });

const APPLY = process.argv.includes("--apply");
const SINCE_ARG = process.argv.find((a) => a.startsWith("--since-days="));
const SINCE_DAYS = SINCE_ARG ? Math.max(1, parseInt(SINCE_ARG.split("=")[1] || "0", 10)) : null;

async function main(): Promise<void> {
  await connectOpsDb(`Reconcile affiliate commissions — ${APPLY ? "APPLY (live)" : "DRY-RUN"}`);

  const { reconcileAffiliateCommissions } = await import("../src/utils/affiliate/reconcile-commissions");

  const since = SINCE_DAYS ? new Date(Date.now() - SINCE_DAYS * 24 * 60 * 60 * 1000) : null;
  const result = await reconcileAffiliateCommissions({ since, apply: APPLY });

  // CSV audit of the missing rows.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.resolve(process.cwd(), "temp", "readonly");
  fs.mkdirSync(dir, { recursive: true });
  const csvPath = path.join(dir, `affiliate-reconcile-${stamp}.csv`);
  const header = "userId,affiliateId,commissionType,packageType,isRenewal,purchaseAmountCents,paymentIntentId,date\n";
  const rows = result.missing
    .map((m) => `${m.userId},${m.affiliateId},${m.commissionType},${m.packageType},${m.isRenewal},${m.purchaseAmountCents},${m.paymentIntentId},${m.date}`)
    .join("\n");
  fs.writeFileSync(csvPath, header + rows + "\n");

  const byType = result.missing.reduce<Record<string, number>>((acc, m) => {
    acc[m.commissionType] = (acc[m.commissionType] ?? 0) + 1;
    return acc;
  }, {});
  const grossCents = result.missing.reduce((s, m) => s + m.purchaseAmountCents, 0);

  console.log("\n📊 Reconciliation summary");
  console.log(`   window      : ${since ? `since ${since.toISOString().slice(0, 10)}` : "all-time (full sweep)"}`);
  console.log(`   eligible BenefitsGranted scanned: ${result.eligibleBenefits} (referred: ${result.referredBenefits})`);
  console.log(`   missing commissions: ${result.missing.length}  ${APPLY ? `(created ${result.created})` : "(would create)"}`);
  console.log(`   by type     : ${JSON.stringify(byType)}`);
  console.log(`   gross behind the gap: $${(grossCents / 100).toFixed(2)} (commission ≈ 30%)`);
  console.log(`   over-paid (active commission on a refunded payment — DETECT only): ${result.overPaid.length}`);
  for (const c of result.overPaid.slice(0, 25)) {
    console.log(`     ⚠️ ${c.commissionId} ${c.commissionType} status=${c.status} $${(c.commissionAmountCents / 100).toFixed(2)} pi=${c.stripePaymentIntentId ?? "-"} inv=${c.stripeInvoiceId ?? "-"}`);
  }
  console.log(`   audit CSV   : ${csvPath}`);
  if (!APPLY) console.log("\n[dry-run] Review the CSV, then re-run with the live npm script to create the missing commissions.");

  process.exit(!APPLY && result.missing.length > 0 ? 2 : 0);
}

main().catch((err) => {
  console.error("❌ reconcile-affiliate-commissions failed:", err);
  process.exit(1);
});
