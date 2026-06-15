#!/usr/bin/env npx tsx
/**
 * Affiliate commission reconciliation — the durable safety net.
 *
 * WHY: commission creation in the webhook is fire-and-forget (non-blocking
 * try/catch), so a transient failure silently drops a commission with no retry.
 * There was a recurring-only backfill (`sync-missing-affiliate-recurring-commissions`)
 * but nothing for one-time / upsell / mini-draw / membership-first. This script
 * reconciles **every** commission type from the durable `PaymentEvent` ledger —
 * no Stripe API needed — and (optionally) backfills the gaps idempotently.
 *
 * For each referred user's net (non-refunded) `BenefitsGranted`, it derives the
 * expected commission and checks whether one exists. Missing → reported (audit)
 * and, with --apply, created via `recordAffiliateCommission` (idempotent: it
 * re-checks and computes the correct per-affiliate rate, and only `$inc`s
 * Affiliate totals on a genuine insert). It also flags **over-paid** commissions
 * still active on a fully-refunded payment (clawback candidates).
 *
 * READ-ONLY by default. Reviewed-backfill workflow:
 *   npm run reconcile:affiliate-commissions:dry   # audit + CSV, no writes
 *   # review the CSV, then:
 *   npm run reconcile:affiliate-commissions        # create the missing commissions
 *
 * Env: MONGODB_URI in .env.local (point it at the target DB).
 */

import { config } from "dotenv";
import path from "node:path";
import fs from "node:fs";
import type mongoose from "mongoose";

config({ path: path.resolve(process.cwd(), ".env.local") });

const APPLY = process.argv.includes("--apply");
const ELIGIBLE_TYPES = ["membership", "one-time", "upsell", "mini-draw"] as const;

type PkgType = (typeof ELIGIBLE_TYPES)[number];

function commissionTypeFor(packageType: PkgType, isRenewal: boolean):
  | "one-time-package"
  | "upsell"
  | "membership-first"
  | "membership-recurring"
  | "mini-draw-package" {
  if (packageType === "one-time") return "one-time-package";
  if (packageType === "upsell") return "upsell";
  if (packageType === "mini-draw") return "mini-draw-package";
  return isRenewal ? "membership-recurring" : "membership-first";
}

async function main(): Promise<void> {
  if (!process.env.MONGODB_URI) {
    console.error("❌ MONGODB_URI not set in .env.local");
    process.exit(1);
  }

  const mongooseMod = (await import("mongoose")).default;
  const connectDB = (await import("../src/lib/mongodb")).default;
  const { default: PaymentEvent } = await import("../src/models/PaymentEvent");
  const { default: AffiliateCommission } = await import("../src/models/AffiliateCommission");
  const { default: User } = await import("../src/models/User");
  const {
    recordAffiliateCommission,
    normalizeStripePaymentIntentKeyForCommission,
    stripeInvoiceIdLookupVariants,
  } = await import("../src/utils/affiliate/affiliate-attribution");

  await connectDB();
  const dbName = mongooseMod.connection?.db?.databaseName ?? "(unknown)";
  const uri = process.env.MONGODB_URI;
  const at = uri.indexOf("@");
  const host = at >= 0 ? uri.slice(at + 1).split("/")[0] : "(host?)";
  console.log(`🧮 Reconcile affiliate commissions — ${APPLY ? "APPLY (live)" : "DRY-RUN"} · db="${dbName}" @ ${host}`);

  // Referred users → affiliateId
  const referredUsers = await User.find(
    { "affiliateReferral.affiliateId": { $exists: true, $ne: null } },
    { _id: 1, "affiliateReferral.affiliateId": 1, stripeSubscriptionId: 1 }
  ).lean();
  const affiliateByUser = new Map<string, mongoose.Types.ObjectId>();
  const subByUser = new Map<string, string | undefined>();
  for (const u of referredUsers) {
    affiliateByUser.set(String(u._id), u.affiliateReferral!.affiliateId as mongoose.Types.ObjectId);
    subByUser.set(String(u._id), (u as { stripeSubscriptionId?: string }).stripeSubscriptionId);
  }
  const referredIds = referredUsers.map((u) => u._id);
  console.log(`   referred users: ${referredIds.length}`);

  // Refunded payment intents (exclude fully-refunded from backfill; flag active commissions on them)
  const refundedPIs = new Set<string>(await PaymentEvent.distinct("paymentIntentId", { eventType: "RefundProcessed" }));

  // All eligible BenefitsGranted for referred users
  const benefits = await PaymentEvent.find(
    { eventType: "BenefitsGranted", packageType: { $in: ELIGIBLE_TYPES }, userId: { $in: referredIds } },
    { paymentIntentId: 1, userId: 1, packageType: 1, packageId: 1, packageName: 1, isRenewal: 1, "data.price": 1, timestamp: 1 }
  )
    .sort({ timestamp: 1 })
    .lean();
  console.log(`   eligible BenefitsGranted: ${benefits.length}`);

  const missing: Array<Record<string, unknown>> = [];
  let createdCount = 0;
  let owedCents = 0;
  let processed = 0;
  const logEvery = Math.max(1, Math.floor(benefits.length / 20));

  for (const b of benefits) {
    processed++;
    if (processed % logEvery === 0) {
      const pct = ((processed / benefits.length) * 100).toFixed(0);
      console.log(`   …${processed}/${benefits.length} (${pct}%) · missing so far: ${missing.length}`);
    }

    const userId = String(b.userId);
    const affiliateId = affiliateByUser.get(userId);
    if (!affiliateId) continue;
    const pid: string = b.paymentIntentId;
    if (!pid) continue;
    if (refundedPIs.has(pid)) continue; // fully refunded → no commission owed

    const packageType = b.packageType as PkgType;
    const isRenewal = !!b.isRenewal;
    const commissionType = commissionTypeFor(packageType, isRenewal);
    const purchaseAmount = Math.round(((b.data as { price?: number } | undefined)?.price ?? 0) * 100);
    if (purchaseAmount <= 0) continue;

    // Build the same id keys recordAffiliateCommission uses, then check existence.
    const isInvoiceKeyed = commissionType === "membership-recurring";
    const rawInvoiceId = pid.startsWith("invoice_") ? pid.slice("invoice_".length) : pid; // in_…
    const invoiceVariants = stripeInvoiceIdLookupVariants(rawInvoiceId);
    const piNormalized = normalizeStripePaymentIntentKeyForCommission(pid);

    const existing = isInvoiceKeyed
      ? await AffiliateCommission.findOne({
          affiliateId,
          referredUserId: b.userId,
          commissionType,
          stripeInvoiceId: { $in: invoiceVariants },
        }).lean()
      : await AffiliateCommission.findOne({
          affiliateId,
          referredUserId: b.userId,
          commissionType,
          stripePaymentIntentId: piNormalized,
        }).lean();

    if (existing) continue; // already attributed

    owedCents += purchaseAmount; // pre-rate; commission ≈ rate * this
    missing.push({
      userId,
      affiliateId: String(affiliateId),
      commissionType,
      packageType,
      isRenewal,
      purchaseAmountCents: purchaseAmount,
      paymentIntentId: pid,
      date: new Date(b.timestamp).toISOString().slice(0, 10),
    });

    if (APPLY) {
      const created = await recordAffiliateCommission({
        affiliateId,
        referredUserId: b.userId as mongoose.Types.ObjectId,
        commissionType,
        purchaseType: packageType,
        packageId: b.packageId,
        packageName: b.packageName,
        purchaseAmount,
        ...(isInvoiceKeyed ? { stripeInvoiceId: rawInvoiceId } : { stripePaymentIntentId: pid }),
        ...(subByUser.get(userId) ? { stripeSubscriptionId: subByUser.get(userId) } : {}),
        isFirstTimePurchase: commissionType === "membership-first",
        isRecurringPayment: isInvoiceKeyed,
        earnedAt: new Date(b.timestamp),
      });
      if (created) createdCount++;
    }
  }

  // Over-paid: active commissions whose payment was fully refunded
  const refundedList = [...refundedPIs];
  const refundedVariants = refundedList.flatMap((p) => {
    const set = new Set([p]);
    if (p.startsWith("invoice_")) set.add(p.slice("invoice_".length));
    else set.add(`invoice_${p}`);
    return [...set];
  });
  const overPaid = await AffiliateCommission.find(
    {
      status: { $ne: "cancelled" },
      $or: [{ stripePaymentIntentId: { $in: refundedVariants } }, { stripeInvoiceId: { $in: refundedVariants } }],
    },
    { commissionType: 1, status: 1, commissionAmount: 1, stripePaymentIntentId: 1, stripeInvoiceId: 1 }
  ).lean();

  // CSV audit
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dir = path.resolve(process.cwd(), "temp", "readonly");
  fs.mkdirSync(dir, { recursive: true });
  const csvPath = path.join(dir, `affiliate-reconcile-${stamp}.csv`);
  const header = "userId,affiliateId,commissionType,packageType,isRenewal,purchaseAmountCents,paymentIntentId,date\n";
  const rows = missing
    .map((m) => `${m.userId},${m.affiliateId},${m.commissionType},${m.packageType},${m.isRenewal},${m.purchaseAmountCents},${m.paymentIntentId},${m.date}`)
    .join("\n");
  fs.writeFileSync(csvPath, header + rows + "\n");

  const byType = missing.reduce<Record<string, number>>((acc, m) => {
    acc[m.commissionType as string] = (acc[m.commissionType as string] ?? 0) + 1;
    return acc;
  }, {});

  console.log("\n📊 Reconciliation summary");
  console.log(`   missing commissions: ${missing.length}  ${APPLY ? `(created ${createdCount})` : "(would create)"}`);
  console.log(`   by type: ${JSON.stringify(byType)}`);
  console.log(`   gross purchase value behind the gap: $${(owedCents / 100).toFixed(2)} (commission ≈ 30% of this)`);
  console.log(`   over-paid (active commission on a refunded payment): ${overPaid.length}`);
  for (const c of overPaid.slice(0, 25)) {
    console.log(`     ⚠️ ${c._id} ${c.commissionType} status=${c.status} $${((c.commissionAmount ?? 0) / 100).toFixed(2)} pi=${c.stripePaymentIntentId ?? "-"} inv=${c.stripeInvoiceId ?? "-"}`);
  }
  console.log(`   audit CSV: ${csvPath}`);
  if (!APPLY) console.log("\n[dry-run] Review the CSV, then re-run with the live npm script to create the missing commissions.");

  // 3-tier exit: 0 clean, 2 found-but-dry, 0 applied
  process.exit(!APPLY && missing.length > 0 ? 2 : 0);
}

main().catch((err) => {
  console.error("❌ reconcile-affiliate-commissions failed:", err);
  process.exit(1);
});
