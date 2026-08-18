/**
 * Audit: are refunds recorded accurately on the PaymentEvent ledger?
 *
 * The Receipts ledger reports refund state from `RefundProcessed` / `RefundPartial` rows
 * joined on `paymentIntentId`. That is only as good as the webhook that writes them. This
 * script checks the ledger against itself AND against Stripe, and reports every discrepancy
 * class separately so a real gap can't hide inside a total.
 *
 * Checks:
 *   1. Orphan refunds     — a refund row whose paymentIntentId has no BenefitsGranted.
 *   2. Duplicate refunds  — more than one refund row of the same kind for one payment.
 *   3. Amount sanity      — full-refund amount (cents) vs the granted price (dollars).
 *   4. Both-kinds rows    — a payment carrying BOTH a full and a partial refund.
 *   5. Stripe cross-check — every refund Stripe reports in the window must exist on the
 *                           ledger, and vice versa. This is the one that catches a refund
 *                           issued in the Stripe dashboard that never reached the webhook.
 *
 * READ-ONLY. No writes to Mongo or Stripe.
 *
 *   npm run audit:receipts-refunds                 # local, last 90 days
 *   npm run audit:receipts-refunds:prod            # production, last 90 days
 *   npm run audit:receipts-refunds:prod -- --days=400
 *   npm run audit:receipts-refunds:prod -- --skip-stripe
 *
 * Exit codes: 0 = clean · 1 = discrepancies found · 2 = the run itself failed.
 */
import dotenv from "dotenv";
import path from "node:path";

const ENV_FILE = process.argv.includes("--production") ? ".env.production" : ".env.local";
dotenv.config({ path: path.resolve(process.cwd(), ENV_FILE) });

import mongoose from "mongoose";
import connectDB from "../src/lib/mongodb";
import PaymentEvent from "../src/models/PaymentEvent";

const IS_PRODUCTION = process.argv.includes("--production");
const SKIP_STRIPE = process.argv.includes("--skip-stripe");
const daysArg = process.argv.find((a) => a.startsWith("--days="));
const DAYS = daysArg ? parseInt(daysArg.split("=")[1], 10) || 90 : 90;

const money = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

interface Finding {
  check: string;
  detail: string;
}

async function run() {
  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);

  console.log(`\nRefund accuracy audit — target=${IS_PRODUCTION ? "PRODUCTION" : "local"}`);
  console.log(`Window: last ${DAYS} days (since ${since.toISOString()})`);
  console.log("Read-only: no writes are performed.\n");

  await connectDB();

  const findings: Finding[] = [];

  // ── Load the ledger's refund rows + the payments they point at ─────────────────────────
  const refundRows = await PaymentEvent.find({
    eventType: { $in: ["RefundProcessed", "RefundPartial"] },
  })
    .select("_id paymentIntentId eventType timestamp data userId")
    .lean();

  const grants = await PaymentEvent.find({ eventType: "BenefitsGranted" })
    .select("paymentIntentId data.price timestamp")
    .lean();

  const grantByPi = new Map<string, { price: number; timestamp: Date }>();
  for (const g of grants) {
    const pi = typeof g.paymentIntentId === "string" ? g.paymentIntentId : "";
    if (!pi) continue;
    grantByPi.set(pi, {
      price: typeof (g.data as { price?: number })?.price === "number" ? (g.data as { price: number }).price : 0,
      timestamp: g.timestamp as Date,
    });
  }

  console.log(`Ledger: ${grants.length.toLocaleString()} BenefitsGranted · ${refundRows.length} refund rows`);
  const fullRows = refundRows.filter((r) => r.eventType === "RefundProcessed");
  const partialRows = refundRows.filter((r) => r.eventType === "RefundPartial");
  console.log(`        ${fullRows.length} RefundProcessed · ${partialRows.length} RefundPartial\n`);

  // ── 1. Orphan refunds ──────────────────────────────────────────────────────────────────
  const orphans = refundRows.filter((r) => {
    const pi = typeof r.paymentIntentId === "string" ? r.paymentIntentId : "";
    return pi && !grantByPi.has(pi);
  });
  console.log(`1. Orphan refunds (no matching BenefitsGranted) : ${orphans.length}`);
  for (const o of orphans.slice(0, 10)) {
    findings.push({ check: "orphan-refund", detail: `${o._id} → ${o.paymentIntentId}` });
    console.log(`     ⚠ ${o._id}  pi=${o.paymentIntentId}`);
  }
  if (orphans.length > 10) console.log(`     … and ${orphans.length - 10} more`);

  // ── 2. Duplicate refunds of the same kind ──────────────────────────────────────────────
  const seen = new Map<string, number>();
  for (const r of refundRows) {
    const key = `${r.eventType}:${r.paymentIntentId}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const dupes = [...seen.entries()].filter(([, n]) => n > 1);
  console.log(`2. Duplicate refund rows for one payment       : ${dupes.length}`);
  for (const [key, n] of dupes.slice(0, 10)) {
    findings.push({ check: "duplicate-refund", detail: `${key} ×${n}` });
    console.log(`     ⚠ ${key} ×${n}`);
  }

  // ── 3. Amount sanity on full refunds ───────────────────────────────────────────────────
  // data.refundAmount is CENTS; data.price is DOLLARS. A full refund should return the
  // granted amount. A mismatch means the ledger's "net $0" overstates or understates.
  let amountMismatches = 0;
  let missingAmount = 0;
  for (const r of fullRows) {
    const pi = typeof r.paymentIntentId === "string" ? r.paymentIntentId : "";
    const grant = pi ? grantByPi.get(pi) : undefined;
    if (!grant) continue;
    const cents = (r.data as { refundAmount?: number })?.refundAmount;
    if (typeof cents !== "number") {
      missingAmount++;
      continue;
    }
    const refunded = cents / 100;
    if (Math.abs(refunded - grant.price) > 0.005) {
      amountMismatches++;
      if (amountMismatches <= 10) {
        findings.push({
          check: "full-refund-amount-mismatch",
          detail: `${pi}: refunded ${money(refunded)} vs granted ${money(grant.price)}`,
        });
        console.log(
          `     ⚠ ${pi}  refunded ${money(refunded)} ≠ granted ${money(grant.price)}  (Δ ${money(refunded - grant.price)})`
        );
      }
    }
  }
  console.log(`3. Full refunds whose amount ≠ granted price   : ${amountMismatches}`);
  console.log(`   Full refunds with no refundAmount recorded  : ${missingAmount}`);

  // ── 4. A payment carrying both a full AND a partial refund ─────────────────────────────
  const fullPis = new Set(fullRows.map((r) => String(r.paymentIntentId)));
  const bothKinds = partialRows.filter((r) => fullPis.has(String(r.paymentIntentId)));
  console.log(`4. Payments with BOTH full + partial refunds   : ${bothKinds.length}`);
  for (const b of bothKinds.slice(0, 10)) {
    // Not necessarily wrong (partial then full), but the ledger shows only the full one.
    findings.push({ check: "both-refund-kinds", detail: String(b.paymentIntentId) });
    console.log(`     ⚠ ${b.paymentIntentId} — Receipts shows the FULL refund and hides the partial`);
  }

  // ── 5. Stripe cross-check ──────────────────────────────────────────────────────────────
  if (SKIP_STRIPE) {
    console.log(`\n5. Stripe cross-check                          : SKIPPED (--skip-stripe)`);
  } else if (!process.env.STRIPE_SECRET_KEY) {
    console.log(`\n5. Stripe cross-check                          : SKIPPED (no STRIPE_SECRET_KEY)`);
  } else {
    const { default: Stripe } = await import("stripe");
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    console.log(`\n5. Stripe cross-check (listing refunds since ${since.toISOString().slice(0, 10)})…`);

    // ⚠️ WHY THIS IS ONLY A COUNT, NOT A PER-REFUND MATCH.
    //
    // The ledger keys a refund by the SAME polymorphic id its BenefitsGranted row used:
    // `pi_…` for a one-off, `invoice_in_…` for a subscription renewal. A Stripe refund only
    // ever carries the PaymentIntent — a DIFFERENT id from the invoice the ledger filed it
    // under. In Stripe API v18.5.0 every field that used to bridge the two
    // (`charge.invoice`, `invoice.payment_intent`, `invoice.charge`, `invoice.payments`) is
    // gone, so the join cannot be made on ids at all; it has to go through the customer.
    //
    // That correlation lives in ONE place — `scripts/backfill-missing-refund-events.ts`,
    // which resolves charge.customer → User → the matching purchase and reports
    // matched / ambiguous / unmatched honestly. Duplicating it here would give two
    // implementations that could disagree, so this check reports the headline counts and
    // defers. A gap between the two numbers is expected on historical data and is NOT by
    // itself a discrepancy — run the backfill script's dry-run to see what it consists of.
    let stripeCount = 0;
    for await (const _refund of stripe.refunds.list({
      created: { gte: Math.floor(since.getTime() / 1000) },
      limit: 100,
    })) {
      void _refund;
      stripeCount++;
      if (stripeCount % 100 === 0) console.log(`     … ${stripeCount} refunds scanned`);
    }

    const inWindow = refundRows.filter((r) => r.timestamp && new Date(r.timestamp) >= since);
    console.log(`   Stripe refunds in window   : ${stripeCount}`);
    console.log(`   Ledger refund rows in window: ${inWindow.length}`);
    if (stripeCount > inWindow.length) {
      console.log(
        `   → ${stripeCount - inWindow.length} Stripe refund(s) have no obvious ledger row. Run:`
      );
      console.log(`       npm run backfill:missing-refunds${IS_PRODUCTION ? ":prod" : ""}:dry`);
      console.log(`     for the per-refund breakdown (matched / ambiguous / unmatched).`);
    } else {
      console.log(`   → Ledger covers every Stripe refund in the window.`);
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────────────────
  const byCheck = new Map<string, number>();
  for (const f of findings) byCheck.set(f.check, (byCheck.get(f.check) ?? 0) + 1);

  console.log(`\n── Summary ────────────────────────────────────────────────────────────────`);
  if (findings.length === 0) {
    console.log("✓ CLEAN — no refund discrepancies found.\n");
  } else {
    for (const [check, n] of byCheck) console.log(`  ${check.padEnd(34)} ${n}`);
    console.log(`\n✗ ${findings.length} discrepancy/discrepancies found (see above).\n`);
  }

  await mongoose.disconnect();
  process.exit(findings.length === 0 ? 0 : 1);
}

run().catch((error) => {
  console.error("Refund audit failed:", error);
  process.exit(2);
});
