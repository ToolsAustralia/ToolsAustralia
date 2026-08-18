/**
 * Reconcile the admin Receipts ledger against the existing dashboard revenue figures.
 *
 * This is the real acceptance test for `src/services/admin/receipts.ts`. It proves two
 * identities over live data, for a date range:
 *
 *   A. Receipts net (excluding shop orders) == dashboard NET revenue
 *      `aggregateNetRevenueSum` is the dashboard's all-category net figure. It already
 *      includes renewals, so this must match to the cent. Any drift means the query,
 *      the date window, or the refund rule has diverged.
 *
 *   B. Receipts net − dashboard ACQUISITION revenue == renewals
 *      `buildByCategory` (the Advertising card's basis) excludes membership renewals on
 *      purpose. Receipts keeps them. So the gap between the two is exactly the renewals
 *      total — and if it is not, the classifier is wrong.
 *
 * It also checks the six shared categories bucket-for-bucket, because two totals can agree
 * while individual categories are mis-bucketed against each other.
 *
 * READ-ONLY. Runs no writes of any kind — safe against production.
 *
 *   npm run verify:receipts-reconciliation              # local, all-time
 *   npm run verify:receipts-reconciliation:prod         # production, all-time
 *   npm run verify:receipts-reconciliation -- --days=30 # last 30 days
 *
 * Exit codes: 0 = reconciled · 1 = a mismatch (a bug) · 2 = the run itself failed.
 */
import dotenv from "dotenv";
import path from "node:path";

const ENV_FILE = process.argv.includes("--production") ? ".env.production" : ".env.local";
dotenv.config({ path: path.resolve(process.cwd(), ENV_FILE) });

import mongoose from "mongoose";
import connectDB from "../src/lib/mongodb";
import { getReceipts } from "../src/services/admin/receipts";
import { RECEIPT_CATEGORIES, RECEIPT_CATEGORY_LABELS } from "../src/utils/admin/receipts";
import type { ReceiptCategory } from "../src/utils/admin/receipts";
import {
  aggregateNetRevenueSum,
  fetchNetBenefitsGrantedWithMatch,
} from "../src/utils/payment/payment-event-net-queries";
import {
  buildByCategory,
  type AcquisitionCategory,
} from "../src/services/admin/platformRevenueBreakdown";
import { getWebsiteLaunchDateUTC } from "../src/utils/common/timezone";

const IS_PRODUCTION = process.argv.includes("--production");
const daysArg = process.argv.find((a) => a.startsWith("--days="));
const startArg = process.argv.find((a) => a.startsWith("--start="));
const endArg = process.argv.find((a) => a.startsWith("--end="));

/** Cents-level tolerance — float summation of dollar amounts, not a fudge factor. */
const EPSILON = 0.005;

const money = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

function resolveWindow(): { startDate: Date; endDate: Date; label: string } {
  const endDate = endArg ? new Date(`${endArg.split("=")[1]}T23:59:59.999Z`) : new Date();
  if (startArg) {
    return {
      startDate: new Date(`${startArg.split("=")[1]}T00:00:00.000Z`),
      endDate,
      label: `${startArg.split("=")[1]} → ${endArg?.split("=")[1] ?? "now"}`,
    };
  }
  if (daysArg) {
    const days = parseInt(daysArg.split("=")[1], 10) || 30;
    const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);
    return { startDate, endDate, label: `last ${days} days` };
  }
  return { startDate: getWebsiteLaunchDateUTC(), endDate, label: "all time" };
}

async function run() {
  const { startDate, endDate, label } = resolveWindow();

  console.log(`\nReceipts reconciliation — target=${IS_PRODUCTION ? "PRODUCTION" : "local"}`);
  console.log(`Window: ${label}  (${startDate.toISOString()} → ${endDate.toISOString()})`);
  console.log("Read-only: no writes are performed.\n");

  await connectDB();

  // ── Receipts side ──────────────────────────────────────────────────────────────────────
  const t0 = Date.now();
  const all = await getReceipts({ startDate, endDate, page: 1, limit: 1 });
  const allMs = Date.now() - t0;

  const perCategory = new Map<ReceiptCategory, { net: number; gross: number; count: number }>();
  for (const category of RECEIPT_CATEGORIES) {
    const result = await getReceipts({ startDate, endDate, category, page: 1, limit: 1 });
    perCategory.set(category, {
      net: result.totals.net,
      gross: result.totals.gross,
      count: result.totals.count,
    });
  }

  const renewals = perCategory.get("membership-renewal")!;
  const shop = perCategory.get("shop-order")!;
  const receiptsNet = all.totals.net;
  const receiptsNetExShop = receiptsNet - shop.net;

  console.log("── Receipts ───────────────────────────────────────────────────────────────");
  console.log(`Rows                      : ${all.totals.count.toLocaleString()}`);
  console.log(`Gross                     : ${money(all.totals.gross)}`);
  console.log(`Refunded                  : ${money(all.totals.refunded)}`);
  console.log(`Net of refunds            : ${money(receiptsNet)}`);
  console.log(`  first page latency      : ${allMs} ms\n`);

  console.log("By category (net):");
  for (const category of RECEIPT_CATEGORIES) {
    const row = perCategory.get(category)!;
    console.log(
      `  ${RECEIPT_CATEGORY_LABELS[category].padEnd(22)} ${money(row.net).padStart(14)}  (${row.count.toLocaleString()} rows)`
    );
  }
  console.log("");

  // ── Dashboard side ─────────────────────────────────────────────────────────────────────
  const dashboardNet = await aggregateNetRevenueSum(startDate, endDate);

  const events = await fetchNetBenefitsGrantedWithMatch(
    { timestamp: { $gte: startDate, $lte: endDate } },
    { userId: 1, packageType: 1, packageId: 1, packageName: 1, data: 1, timestamp: 1, _id: 1 }
  );
  const byCategory = buildByCategory(events);
  const dashboardAcquisition = byCategory.reduce((sum, b) => sum + b.revenue, 0);

  console.log("── Dashboard ──────────────────────────────────────────────────────────────");
  console.log(`Net revenue (all)         : ${money(dashboardNet)}   [aggregateNetRevenueSum]`);
  console.log(`Acquisition revenue       : ${money(dashboardAcquisition)}   [buildByCategory, renewals excluded]\n`);

  // ── Identity A: totals match on the same basis ─────────────────────────────────────────
  const deltaA = receiptsNetExShop - dashboardNet;
  const passA = Math.abs(deltaA) < EPSILON;

  // ── Identity B: the gap to acquisition revenue IS the renewals total ───────────────────
  const deltaB = receiptsNetExShop - dashboardAcquisition;
  const deltaBvsRenewals = deltaB - renewals.net;
  const passB = Math.abs(deltaBvsRenewals) < EPSILON;

  console.log("── Reconciliation ─────────────────────────────────────────────────────────");
  console.log(`A. Receipts net (ex shop) : ${money(receiptsNetExShop)}`);
  console.log(`   Dashboard net          : ${money(dashboardNet)}`);
  console.log(`   Delta                  : ${money(deltaA)}  ${passA ? "✓ match" : "✗ MISMATCH"}\n`);

  console.log(`B. Receipts net (ex shop) : ${money(receiptsNetExShop)}`);
  console.log(`   Dashboard acquisition  : ${money(dashboardAcquisition)}`);
  console.log(`   Delta                  : ${money(deltaB)}`);
  console.log(`   Renewals total         : ${money(renewals.net)}`);
  console.log(
    `   Delta − renewals       : ${money(deltaBvsRenewals)}  ${passB ? "✓ delta is exactly the renewals total" : "✗ MISMATCH — classifier bug"}\n`
  );

  // ── Per-category cross-check ───────────────────────────────────────────────────────────
  const acquisitionByCategory = new Map<string, number>(
    byCategory.map((b) => [b.category as AcquisitionCategory as string, b.revenue])
  );
  console.log("Per-category (Receipts net vs dashboard acquisition):");
  let categoryFailures = 0;
  for (const category of RECEIPT_CATEGORIES) {
    if (category === "membership-renewal" || category === "shop-order") {
      console.log(
        `  ${RECEIPT_CATEGORY_LABELS[category].padEnd(22)} ${money(perCategory.get(category)!.net).padStart(14)}  (not in the dashboard's acquisition basis — skipped)`
      );
      continue;
    }
    const mine = perCategory.get(category)!.net;
    const theirs = acquisitionByCategory.get(category) ?? 0;
    const ok = Math.abs(mine - theirs) < EPSILON;
    if (!ok) categoryFailures++;
    console.log(
      `  ${RECEIPT_CATEGORY_LABELS[category].padEnd(22)} ${money(mine).padStart(14)} vs ${money(theirs).padStart(14)}  ${ok ? "✓" : "✗ MISMATCH"}`
    );
  }

  const passed = passA && passB && categoryFailures === 0;
  console.log(
    `\n${passed ? "✓ RECONCILED" : "✗ FAILED"} — ${passed ? "Receipts agrees with the dashboard on every basis checked." : "see the mismatches above."}\n`
  );

  await mongoose.disconnect();
  process.exit(passed ? 0 : 1);
}

run().catch((error) => {
  console.error("Reconciliation run failed:", error);
  process.exit(2);
});
