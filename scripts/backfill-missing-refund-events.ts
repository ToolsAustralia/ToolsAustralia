/**
 * Reconcile Stripe refunds against the PaymentEvent ledger, and (optionally) write back the
 * refunds the ledger never recorded.
 *
 * ## Why this exists
 *
 * The Receipts ledger and every `data.price`-derived revenue figure read refund state from
 * `RefundProcessed` / `RefundPartial` rows. Refunds issued before refund tracking was working
 * never produced those rows, so the ledger reports them as fully-paid revenue. The money left
 * the business; the ledger disagrees.
 *
 * ## ⚠️ The correlation problem (read before trusting the output)
 *
 * A Stripe refund carries a **PaymentIntent** (`pi_…`). The ledger keys a subscription
 * payment by its **invoice** (`invoice_in_…`) — a different id. In Stripe API v18.5.0 the
 * fields that used to bridge them (`charge.invoice`, `invoice.payment_intent`,
 * `invoice.charge`, `invoice.payments`) are all absent, so the two cannot be joined directly.
 *
 * This script therefore correlates through the **customer**:
 *   Stripe refund → charge.customer → User.stripeCustomerId → userId
 *   → the closest preceding un-refunded BenefitsGranted for that user with a matching amount.
 *
 * That is a heuristic, not an identity. It is reported honestly:
 *   - `matched`     — exactly one candidate. Safe.
 *   - `ambiguous`   — several equally-good candidates (the user made identical purchases).
 *                     NEVER written, always listed.
 *   - `unmatched`   — no BenefitsGranted fits. Listed for manual review.
 *
 * ## ⚠️ What --apply does and does NOT do
 *
 * It writes the missing `RefundProcessed` PaymentEvent rows so REVENUE reporting becomes
 * correct. It deliberately does **NOT** reverse entries, points or benefits the way
 * `processRefundReversal` does for a live refund. Those refunds are historical: the draws
 * they touched have already been run, and retro-actively deleting entries would rewrite
 * settled draw history to fix a reporting number. Revenue truth and draw history are
 * separate concerns; this script only repairs the former.
 *
 * Rows it writes are stamped `processedBy: "admin"` and `data.backfilledFromStripe: true`
 * so they are distinguishable from webhook-written rows forever.
 *
 * Default is DRY-RUN. Pass --apply to write.
 *
 *   npm run backfill:missing-refunds:dry            # local, report only
 *   npm run backfill:missing-refunds                # local, write
 *   npm run backfill:missing-refunds:prod:dry       # production, report only
 *   npm run backfill:missing-refunds:prod           # production, write
 */
import dotenv from "dotenv";
import path from "node:path";

const ENV_FILE = process.argv.includes("--production") ? ".env.production" : ".env.local";
dotenv.config({ path: path.resolve(process.cwd(), ENV_FILE) });

import mongoose from "mongoose";
import Stripe from "stripe";
import connectDB from "../src/lib/mongodb";
import PaymentEvent from "../src/models/PaymentEvent";
import User from "../src/models/User";

const APPLY = process.argv.includes("--apply");
const IS_PRODUCTION = process.argv.includes("--production");

const money = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);
const monthOf = (d: Date) => d.toISOString().slice(0, 7);

/** Amounts must agree to the cent; timestamps only need to be ordered. */
const AMOUNT_EPSILON = 0.005;

interface StripeRefund {
  id: string;
  amountCents: number;
  created: Date;
  customerId: string | null;
  paymentIntentId: string | null;
}

interface Candidate {
  ledgerKey: string;
  userId: string;
  price: number;
  timestamp: Date;
}

async function run() {
  console.log(
    `\nStripe → ledger refund reconciliation — target=${IS_PRODUCTION ? "PRODUCTION" : "local"} (${APPLY ? "APPLY" : "DRY-RUN"})\n`
  );
  await connectDB();

  // ── 1. Stripe side ─────────────────────────────────────────────────────────────────────
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  const refunds: StripeRefund[] = [];
  let scanned = 0;
  process.stdout.write("Listing Stripe refunds… ");
  for await (const r of stripe.refunds.list({ limit: 100, expand: ["data.charge"] })) {
    const charge = typeof r.charge === "string" ? null : r.charge;
    refunds.push({
      id: r.id,
      amountCents: r.amount,
      created: new Date(r.created * 1000),
      customerId: charge ? (typeof charge.customer === "string" ? charge.customer : (charge.customer?.id ?? null)) : null,
      paymentIntentId:
        typeof r.payment_intent === "string" ? r.payment_intent : (r.payment_intent?.id ?? null),
    });
    scanned++;
    if (scanned % 100 === 0) process.stdout.write(`${scanned}… `);
  }
  console.log(`${refunds.length} total.`);

  // ── 2. Ledger side ─────────────────────────────────────────────────────────────────────
  const grants = await PaymentEvent.find({ eventType: "BenefitsGranted" })
    .select("paymentIntentId userId data.price timestamp")
    .lean();
  const existingRefunds = await PaymentEvent.find({
    eventType: { $in: ["RefundProcessed", "RefundPartial"] },
  })
    .select("paymentIntentId timestamp")
    .lean();

  const alreadyRefunded = new Set(existingRefunds.map((r) => String(r.paymentIntentId)));
  console.log(
    `Ledger: ${grants.length.toLocaleString()} BenefitsGranted · ${existingRefunds.length} refund rows already recorded.\n`
  );

  // ⚠️ IDEMPOTENCY, and why it cannot rely on the amount match.
  //
  // The correlation is (customer, amount, closest-preceding purchase). If a member made TWO
  // identical purchases and one was refunded, a second run finds the first purchase already
  // refunded, happily matches the SAME Stripe refund to the second one, and writes a
  // duplicate — under-reporting revenue again. The `claimed` set only guards within a run.
  //
  // So idempotency is keyed on the Stripe refund id we stamped on the row, not on the
  // matching heuristic: a refund this script has already filed is never reconsidered.
  const backfilled = await PaymentEvent.find({
    eventType: "RefundProcessed",
    "data.stripeRefundId": { $exists: true },
  })
    .select("data.stripeRefundId")
    .lean();
  const backfilledRefundIds = new Set(
    backfilled
      .map((r) => (r.data as { stripeRefundId?: unknown })?.stripeRefundId)
      .filter((id): id is string => typeof id === "string")
  );
  if (backfilledRefundIds.size > 0) {
    console.log(
      `${backfilledRefundIds.size} refund(s) were filed by a previous run of this script — they will be skipped.\n`
    );
  }

  // stripeCustomerId → userId
  const users = await User.find({ stripeCustomerId: { $exists: true, $ne: null } })
    .select("stripeCustomerId")
    .lean();
  const userIdByCustomer = new Map<string, string>();
  for (const u of users) {
    const cid = u.stripeCustomerId as string | undefined;
    if (cid) userIdByCustomer.set(cid, String(u._id));
  }
  console.log(`Resolved ${userIdByCustomer.size.toLocaleString()} Stripe customers → users.\n`);

  // userId → their BenefitsGranted rows, newest first
  const grantsByUser = new Map<string, Candidate[]>();
  for (const g of grants) {
    const uid = g.userId ? String(g.userId) : "";
    const key = typeof g.paymentIntentId === "string" ? g.paymentIntentId : "";
    if (!uid || !key) continue;
    const price = typeof (g.data as { price?: number })?.price === "number" ? (g.data as { price: number }).price : 0;
    if (!grantsByUser.has(uid)) grantsByUser.set(uid, []);
    grantsByUser.get(uid)!.push({ ledgerKey: key, userId: uid, price, timestamp: g.timestamp as Date });
  }
  for (const list of grantsByUser.values()) list.sort((a, b) => +b.timestamp - +a.timestamp);

  // ── 3. Correlate ───────────────────────────────────────────────────────────────────────
  const alreadyCovered: StripeRefund[] = [];
  const matched: Array<{ refund: StripeRefund; candidate: Candidate }> = [];
  const ambiguous: Array<{ refund: StripeRefund; candidates: Candidate[] }> = [];
  const unmatched: StripeRefund[] = [];
  const claimed = new Set<string>(); // one BenefitsGranted can only absorb one refund

  for (const refund of [...refunds].sort((a, b) => +a.created - +b.created)) {
    // Already filed by a previous run — checked FIRST, before any amount matching, or the
    // heuristic will re-attach it to a different purchase and duplicate it (see above).
    if (backfilledRefundIds.has(refund.id)) {
      alreadyCovered.push(refund);
      continue;
    }

    // Direct hit: a one-off payment whose PI the ledger stored verbatim.
    if (refund.paymentIntentId && alreadyRefunded.has(refund.paymentIntentId)) {
      alreadyCovered.push(refund);
      continue;
    }

    const userId = refund.customerId ? userIdByCustomer.get(refund.customerId) : undefined;
    if (!userId) {
      unmatched.push(refund);
      continue;
    }

    const dollars = refund.amountCents / 100;
    const pool = (grantsByUser.get(userId) ?? []).filter(
      (c) =>
        Math.abs(c.price - dollars) < AMOUNT_EPSILON &&
        +c.timestamp <= +refund.created &&
        !alreadyRefunded.has(c.ledgerKey) &&
        !claimed.has(c.ledgerKey)
    );

    if (pool.length === 0) {
      // The ledger may already carry this refund under the invoice key.
      const coveredByInvoice = (grantsByUser.get(userId) ?? []).some(
        (c) => Math.abs(c.price - dollars) < AMOUNT_EPSILON && alreadyRefunded.has(c.ledgerKey)
      );
      if (coveredByInvoice) alreadyCovered.push(refund);
      else unmatched.push(refund);
      continue;
    }

    // Closest preceding purchase wins.
    const best = pool[0];
    const tie = pool.filter((c) => +c.timestamp === +best.timestamp);
    if (tie.length > 1) {
      ambiguous.push({ refund, candidates: tie });
      continue;
    }
    claimed.add(best.ledgerKey);
    matched.push({ refund, candidate: best });
  }

  // ── 4. Report ──────────────────────────────────────────────────────────────────────────
  console.log("── Correlation ────────────────────────────────────────────────────────────");
  console.log(`Stripe refunds                        : ${refunds.length}`);
  console.log(`  already on the ledger               : ${alreadyCovered.length}`);
  console.log(`  MISSING, confidently matched        : ${matched.length}`);
  console.log(`  ambiguous (never auto-written)      : ${ambiguous.length}`);
  console.log(`  unmatched (manual review)           : ${unmatched.length}\n`);

  const months = new Map<string, { stripe: number; onLedger: number; missing: number }>();
  const bump = (d: Date, field: "stripe" | "onLedger" | "missing") => {
    const m = monthOf(d);
    if (!months.has(m)) months.set(m, { stripe: 0, onLedger: 0, missing: 0 });
    months.get(m)![field]++;
  };
  for (const r of refunds) bump(r.created, "stripe");
  for (const r of alreadyCovered) bump(r.created, "onLedger");
  for (const m of matched) bump(m.refund.created, "missing");
  for (const a of ambiguous) bump(a.refund.created, "missing");
  for (const u of unmatched) bump(u.created, "missing");

  console.log("By month (when did tracking start working?):");
  console.log("  month     stripe  on-ledger  missing");
  for (const [m, v] of [...months.entries()].sort()) {
    const flag = v.onLedger === 0 && v.stripe > 0 ? "  ← no tracking" : "";
    console.log(
      `  ${m}   ${String(v.stripe).padStart(5)}  ${String(v.onLedger).padStart(8)}  ${String(v.missing).padStart(7)}${flag}`
    );
  }

  const missingValue = [...matched].reduce((s, m) => s + m.refund.amountCents / 100, 0);
  console.log(`\nRevenue currently overstated by the missing rows: ${money(missingValue)}`);

  if (ambiguous.length > 0) {
    console.log(`\nAmbiguous (identical purchases — resolve by hand, never auto-written):`);
    for (const a of ambiguous.slice(0, 15)) {
      console.log(
        `  ${a.refund.id}  ${money(a.refund.amountCents / 100)}  ${a.refund.created.toISOString().slice(0, 10)}  → ${a.candidates.length} candidates`
      );
    }
    if (ambiguous.length > 15) console.log(`  … and ${ambiguous.length - 15} more`);
  }

  if (unmatched.length > 0) {
    // Grouped by amount: card-verification charges ($0.50 auth tests) dominate this bucket
    // and are correctly excluded — there was never a purchase to refund. Only the
    // package-priced rows here are worth a human's time.
    const byAmount = new Map<number, number>();
    for (const u of unmatched) byAmount.set(u.amountCents, (byAmount.get(u.amountCents) ?? 0) + 1);
    console.log(`\nUnmatched by amount (no BenefitsGranted fits):`);
    for (const [cents, n] of [...byAmount.entries()].sort((a, b) => a[0] - b[0])) {
      const note = cents <= 100 ? "  ← card-verification / auth test, not a purchase" : "";
      console.log(`  ${money(cents / 100).padStart(10)} × ${String(n).padStart(4)}${note}`);
    }
    // Decisive question for revenue accuracy: does the ledger hold ANY purchase for this
    // customer? If not, the payment was never counted as revenue either — so an unrecorded
    // refund against it overstates nothing, and there is no correction to make.
    let noUserAtAll = 0;
    let noGrantsAtAll = 0;
    let hasGrantsButNoFit = 0;
    for (const u of unmatched) {
      const uid = u.customerId ? userIdByCustomer.get(u.customerId) : undefined;
      if (!uid) noUserAtAll++;
      else if ((grantsByUser.get(uid) ?? []).length === 0) noGrantsAtAll++;
      else hasGrantsButNoFit++;
    }
    console.log(`\n  Why they don't match:`);
    console.log(`    Stripe customer maps to no User        : ${noUserAtAll}`);
    console.log(`    User has NO BenefitsGranted at all     : ${noGrantsAtAll}  ← revenue was never recorded either, so nothing is overstated`);
    console.log(`    User has purchases, none fit amount/date: ${hasGrantsButNoFit}  ← the only genuinely suspicious bucket`);

    const realUnmatched = unmatched.filter((u) => u.amountCents > 100);
    console.log(`\n  Of ${unmatched.length} unmatched, ${realUnmatched.length} are above $1:`);
    for (const u of realUnmatched.slice(0, 15)) {
      console.log(
        `    ${u.id}  ${money(u.amountCents / 100)}  ${u.created.toISOString().slice(0, 10)}  customer=${u.customerId ?? "?"}`
      );
    }
    if (realUnmatched.length > 15) console.log(`    … and ${realUnmatched.length - 15} more`);
  }

  // ── 5. Write ───────────────────────────────────────────────────────────────────────────
  if (!APPLY) {
    console.log(`\nDRY-RUN — nothing written. Re-run with --apply to insert ${matched.length} row(s).`);
    console.log("Reminder: --apply repairs REVENUE only. It does not reverse entries or benefits.\n");
    await mongoose.disconnect();
    process.exit(0);
  }

  console.log(`\nWriting ${matched.length} RefundProcessed row(s)…`);
  let written = 0;
  let skipped = 0;
  const total = matched.length;
  const step = Math.max(1, Math.floor(total / 20));
  const startedAt = Date.now();

  for (const [i, { refund, candidate }] of matched.entries()) {
    try {
      await PaymentEvent.create({
        _id: `RefundProcessed-${candidate.ledgerKey}`,
        paymentIntentId: candidate.ledgerKey,
        eventType: "RefundProcessed",
        userId: new mongoose.Types.ObjectId(candidate.userId),
        packageType: "one-time",
        data: {
          refundAmount: refund.amountCents,
          isFullRefund: true,
          // Provenance: this row was reconciled from Stripe, not written by the webhook.
          // Benefits were deliberately NOT reversed — see the header.
          backfilledFromStripe: true,
          stripeRefundId: refund.id,
          benefitsReversed: false,
        },
        processedBy: "admin",
        timestamp: refund.created,
      });
      written++;
    } catch (e) {
      const err = e as { code?: number };
      if (err?.code === 11000) skipped++;
      else throw e;
    }
    if ((i + 1) % step === 0 || i + 1 === total) {
      const done = i + 1;
      const rate = done / Math.max(1, (Date.now() - startedAt) / 1000);
      const eta = Math.round((total - done) / Math.max(rate, 0.001));
      console.log(
        `  ${done}/${total} (${Math.round((done / total) * 100)}%) · ${rate.toFixed(1)}/sec · ETA ${eta}s`
      );
    }
  }

  console.log(`\n✓ Wrote ${written} row(s); ${skipped} already existed.`);
  console.log("  Revenue reporting is now corrected. Entries/benefits were NOT touched.\n");

  await mongoose.disconnect();
}

run().catch((error) => {
  console.error("Backfill failed:", error);
  process.exit(1);
});
