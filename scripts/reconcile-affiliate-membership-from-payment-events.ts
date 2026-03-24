#!/usr/bin/env npx tsx

/**
 * Compare membership PaymentEvents to AffiliateCommission rows to detect drift.
 * Focus: renewals should have membership-recurring with stripeInvoiceId = raw invoice id (in_xxx).
 *
 * Usage:
 *   npx tsx scripts/reconcile-affiliate-membership-from-payment-events.ts [--limit=N]
 *
 * Env: MONGODB_URI in .env.local
 */

import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env.local") });

const LIMIT_ARG = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = LIMIT_ARG ? Math.max(1, parseInt(LIMIT_ARG.split("=")[1] || "500", 10)) : 500;

/** Billing reasons that should always have a membership-recurring row when paid (reduces false positives vs subscription_update). */
const RENEWAL_BILLING = new Set(["subscription_cycle", "subscription_threshold"]);

function rawInvoiceIdFromPaymentIntentId(paymentIntentId: string): string | null {
  if (!paymentIntentId.startsWith("invoice_")) return null;
  return paymentIntentId.slice("invoice_".length);
}

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set");
    process.exit(1);
  }

  const connectDB = (await import("../src/lib/mongodb")).default;
  const PaymentEvent = (await import("../src/models/PaymentEvent")).default;
  const AffiliateCommission = (await import("../src/models/AffiliateCommission")).default;

  await connectDB();

  const events = await PaymentEvent.find({
    packageType: "membership",
    eventType: "BenefitsGranted",
  })
    .sort({ timestamp: -1 })
    .limit(LIMIT)
    .lean();

  let missingRecurring = 0;
  let ok = 0;

  for (const ev of events) {
    const pid = ev.paymentIntentId;
    const br = (ev.data as { billingReason?: string })?.billingReason;
    const invoiceId = rawInvoiceIdFromPaymentIntentId(pid);
    if (!invoiceId) continue;

    const isRenewal = br && RENEWAL_BILLING.has(br);
    if (!isRenewal) {
      ok++;
      continue;
    }

    const existing = await AffiliateCommission.findOne({
      referredUserId: ev.userId,
      commissionType: "membership-recurring",
      stripeInvoiceId: invoiceId,
    }).lean();

    if (!existing) {
      missingRecurring++;
      console.warn(
        `[DRIFT] userId=${ev.userId} paymentIntentId=${pid} billingReason=${br} — no membership-recurring for invoice ${invoiceId}`
      );
    } else {
      ok++;
    }
  }

  console.log(
    `Done. scanned=${events.length} renewalDriftMissing=${missingRecurring} matchedOrSkipped=${ok} (limit=${LIMIT})`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
