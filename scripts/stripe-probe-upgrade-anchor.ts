/**
 * Stripe Probe: trial-aware tier upgrade on an anchored subscription (TEST MODE ONLY)
 *
 * This is the **merge gate** for the trial-aware upgrade
 * (`src/app/api/stripe/upgrade-subscription-payment/route.ts`). It answers, against the live
 * Stripe API rather than the docs, the one question that decides whether the route is safe:
 *
 *   **How many invoices does the pay-first call produce, and which one ends up as
 *   `latest_invoice`?**
 *
 * That is not merely an accounting curiosity. The route reads `updatedSubscription.latest_invoice`
 * and hard-fails the request when the amount is under half the expected charge. If
 * `trial_end: "now"` + `billing_cycle_anchor: "now"` in one update spawns a $0 bookkeeping invoice
 * AFTER the real charge, then `latest_invoice` is $0, the guard trips, and a member who was just
 * charged correctly receives **HTTP 500 "Upgrade pricing error"** — and the 500 returns before the
 * anchor re-apply, so their anchor is destroyed too. Assertions U5 and U4 are that gate.
 *
 * Creates throwaway TEST-MODE objects and deletes them afterwards. Never touches MongoDB or
 * production. Refuses to run against a live key (`sk_live_…`), like its sibling probes.
 *
 * Usage:
 *   npm run stripe:probe-upgrade-anchor:dry   # validate env + print plan, create nothing
 *   npm run stripe:probe-upgrade-anchor       # full probe (~15-30s)
 *
 * Options:
 *   --dry-run   Validate STRIPE_SECRET_KEY is a test key and print the plan; create no objects.
 *   --keep      Do NOT clean up created test objects (for manual dashboard inspection).
 *
 * What it asserts:
 *   U0  CONTROL — the ORIGINAL bug still reproduces: the pay-first update WITHOUT `trial_end:"now"`
 *       is rejected by Stripe on a trialing subscription. If this ever stops failing, Stripe changed
 *       the behaviour and the whole workaround should be revisited.
 *   U1  With `trial_end:"now"` the same update SUCCEEDS.
 *   U2  The subscription is `active` immediately after it (trial genuinely ended).
 *   U3  Exactly ONE new paid invoice was produced by the upgrade.
 *   U4  `latest_invoice.total` is the FULL new-tier price (not $0, not a proration).
 *   U5  The pay-first call spawned NO $0 invoice. ← the landmine this probe exists for.
 *   U6  After the re-apply the subscription is `trialing` again.
 *   U7  `items[0].current_period_end === trial_end` (the anchor is what will bill next).
 *   U8  Any invoice the re-apply spawns is $0 AND classified by `isZeroAmountTrialUpdateInvoice`.
 *   U9  The re-apply charged nothing (paid-invoice count unchanged across it).
 *
 * Env: .env.local must have STRIPE_SECRET_KEY (a TEST key).
 *
 * @module scripts/stripe-probe-upgrade-anchor
 */

import { config } from "dotenv";
import path from "path";
import Stripe from "stripe";
import { isZeroAmountTrialUpdateInvoice } from "@/utils/billing/trial-invoice";

config({ path: path.resolve(process.cwd(), ".env.local") });

const DRY_RUN = process.argv.includes("--dry-run");
const KEEP = process.argv.includes("--keep");

const STRIPE_API_VERSION = "2025-08-27.basil";
const TOKEN_GOOD = "tok_visa";

/** Tier prices in cents — stand-ins for Tradie ($20) → Foreman ($40). */
const PRICE_LOW = 2000;
const PRICE_HIGH = 4000;

interface AssertionResult {
  id: string;
  pass: boolean;
  detail: string;
}
const results: AssertionResult[] = [];
function check(id: string, pass: boolean, detail: string): void {
  results.push({ id, pass, detail });
  console.log(`${pass ? "✅ PASS" : "❌ FAIL"}  ${id}  —  ${detail}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Current period end (Basil moves this onto items). */
function periodEndOf(sub: Stripe.Subscription): number | undefined {
  return sub.items?.data?.[0]?.current_period_end;
}

const created = {
  customerIds: [] as string[],
  productId: undefined as string | undefined,
  priceIds: [] as string[],
};

async function makePaymentMethod(stripe: Stripe): Promise<string> {
  const pm = await stripe.paymentMethods.create({ type: "card", card: { token: TOKEN_GOOD } });
  return pm.id;
}

async function ensurePrices(stripe: Stripe): Promise<{ low: string; high: string }> {
  const product = await stripe.products.create({ name: "Upgrade-Anchor Probe (test, safe to delete)" });
  created.productId = product.id;
  const low = await stripe.prices.create({
    product: product.id,
    unit_amount: PRICE_LOW,
    currency: "aud",
    recurring: { interval: "month" },
  });
  const high = await stripe.prices.create({
    product: product.id,
    unit_amount: PRICE_HIGH,
    currency: "aud",
    recurring: { interval: "month" },
  });
  created.priceIds.push(low.id, high.id);
  return { low: low.id, high: high.id };
}

/**
 * Build an ANCHORED member exactly as the join rule does: a future `trial_end` +
 * `proration_behavior: "none"`, with `add_invoice_items` so they pay the full price at signup.
 * The result is a `trialing` subscription that has already paid — the real production shape.
 */
async function createAnchoredTrialingSubscription(
  stripe: Stripe,
  priceLow: string,
  trialEnd: number
): Promise<{ sub: Stripe.Subscription; pmId: string }> {
  const pmId = await makePaymentMethod(stripe);
  const customer = await stripe.customers.create({
    email: `upgrade-anchor-probe+${created.customerIds.length}-${Math.floor(Date.now() / 1000)}@example.com`,
    payment_method: pmId,
    invoice_settings: { default_payment_method: pmId },
  });
  created.customerIds.push(customer.id);

  const sub = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: priceLow }],
    trial_end: trialEnd,
    proration_behavior: "none",
    // Mirrors the real join flow: `add_invoice_items` only accepts ONE-TIME prices, so the signup
    // charge is built inline via `price_data` rather than reusing the recurring price.
    add_invoice_items: [
      { price_data: { currency: "aud", unit_amount: PRICE_LOW, product: created.productId as string }, quantity: 1 },
    ],
    metadata: { billing_anchor_rule: "join_25_27_to_24", probe: "1" },
    expand: ["latest_invoice"],
  });
  return { sub, pmId };
}

/** Every invoice on a subscription, newest-first. */
async function listInvoices(stripe: Stripe, subId: string): Promise<Stripe.Invoice[]> {
  const list = await stripe.invoices.list({ subscription: subId, limit: 100 });
  return list.data;
}

async function paidInvoiceCount(stripe: Stripe, subId: string): Promise<number> {
  return (await listInvoices(stripe, subId)).filter((inv) => (inv.amount_paid ?? 0) > 0).length;
}

async function invoiceIds(stripe: Stripe, subId: string): Promise<Set<string>> {
  return new Set((await listInvoices(stripe, subId)).map((inv) => inv.id as string));
}

/** The route's pay-first update, with `endTrial` toggling the one param under test. */
function payFirstParams(
  itemId: string,
  priceHigh: string,
  pmId: string,
  endTrial: boolean
): Stripe.SubscriptionUpdateParams {
  return {
    items: [{ id: itemId, price: priceHigh }],
    proration_behavior: "none",
    billing_cycle_anchor: "now",
    ...(endTrial ? { trial_end: "now" as const } : {}),
    cancel_at_period_end: false,
    payment_behavior: "error_if_incomplete",
    default_payment_method: pmId,
    expand: ["latest_invoice.payment_intent"],
    metadata: { probe: "1", upgradeType: "no_proration" },
  };
}

// ---------------------------------------------------------------------------
// PART A — CONTROL: the original bug must still reproduce
// ---------------------------------------------------------------------------
async function runControl(stripe: Stripe, priceLow: string, priceHigh: string, trialEnd: number): Promise<void> {
  console.log("\n=== PART A: CONTROL — pay-first upgrade WITHOUT ending the trial ===");
  const { sub, pmId } = await createAnchoredTrialingSubscription(stripe, priceLow, trialEnd);
  console.log(`  anchored sub ${sub.id} status=${sub.status} trial_end=${sub.trial_end}`);

  let threw = false;
  let message = "";
  try {
    await stripe.subscriptions.update(sub.id, payFirstParams(sub.items.data[0].id, priceHigh, pmId, false));
  } catch (e) {
    threw = true;
    message = (e as Error).message ?? "";
  }
  const mentionsTrial = /trial/i.test(message);
  check(
    "U0.control_rejected",
    threw && mentionsTrial,
    threw
      ? `Stripe rejected it as expected: "${message.slice(0, 140)}"`
      : "Stripe ACCEPTED the un-fixed update — the premise changed; revisit the workaround"
  );
}

// ---------------------------------------------------------------------------
// PART B — the shipped sequence
// ---------------------------------------------------------------------------
async function runFix(stripe: Stripe, priceLow: string, priceHigh: string, trialEnd: number): Promise<void> {
  console.log("\n=== PART B: the shipped sequence — end trial -> charge -> re-apply anchor ===");
  const { sub, pmId } = await createAnchoredTrialingSubscription(stripe, priceLow, trialEnd);
  console.log(`  anchored sub ${sub.id} status=${sub.status} trial_end=${sub.trial_end}`);

  const paidBefore = await paidInvoiceCount(stripe, sub.id);
  const idsBefore = await invoiceIds(stripe, sub.id);

  // ── Call 1: pay-first, trial ended in the same request ──────────────────────
  let upgraded: Stripe.Subscription;
  try {
    upgraded = await stripe.subscriptions.update(sub.id, payFirstParams(sub.items.data[0].id, priceHigh, pmId, true));
    check("U1.upgrade_succeeds", true, "pay-first update with trial_end:'now' resolved");
  } catch (e) {
    check("U1.upgrade_succeeds", false, `pay-first update THREW: ${(e as Error).message}`);
    return;
  }

  check("U2.active_after_charge", upgraded.status === "active", `status=${upgraded.status} (expect active)`);

  await sleep(1500); // let any async invoice settle before counting

  const paidAfterCall1 = await paidInvoiceCount(stripe, sub.id);
  const afterCall1 = await listInvoices(stripe, sub.id);
  const newFromCall1 = afterCall1.filter((inv) => !idsBefore.has(inv.id as string));

  check(
    "U3.one_new_paid_invoice",
    paidAfterCall1 - paidBefore === 1,
    `paid invoices ${paidBefore} -> ${paidAfterCall1} (expect +1)`
  );

  const latest = upgraded.latest_invoice as Stripe.Invoice | null;
  const latestTotal = typeof latest === "object" && latest ? (latest.total ?? 0) : -1;
  check(
    "U4.latest_invoice_is_the_charge",
    latestTotal === PRICE_HIGH,
    `latest_invoice.total=${latestTotal} (expect ${PRICE_HIGH} = full new-tier price)`
  );

  const zeroFromCall1 = newFromCall1.filter((inv) => (inv.total ?? 0) === 0);
  check(
    "U5.no_zero_invoice_from_pay_first",
    zeroFromCall1.length === 0,
    `pay-first call created ${newFromCall1.length} invoice(s), ${zeroFromCall1.length} of them $0 ` +
      `[${newFromCall1.map((i) => `${i.id}:${i.billing_reason}:${i.total}`).join(", ")}]`
  );

  // ── Call 2: re-apply the anchor for the next cycle ──────────────────────────
  const idsBeforeCall2 = new Set(afterCall1.map((inv) => inv.id as string));
  const reapplied = await stripe.subscriptions.update(sub.id, {
    trial_end: trialEnd,
    proration_behavior: "none",
    metadata: { ...upgraded.metadata, billing_anchor_rule: "upgrade_reanchor" },
  });

  check("U6.trialing_after_reapply", reapplied.status === "trialing", `status=${reapplied.status} (expect trialing)`);
  check(
    "U7.period_end_eq_trial_end",
    periodEndOf(reapplied) === trialEnd,
    `items[0].current_period_end=${periodEndOf(reapplied)} vs trial_end=${trialEnd}`
  );

  await sleep(1500);
  const afterCall2 = await listInvoices(stripe, sub.id);
  const newFromCall2 = afterCall2.filter((inv) => !idsBeforeCall2.has(inv.id as string));
  const allZeroAndClassified =
    newFromCall2.length === 0 ||
    newFromCall2.every((inv) => (inv.total ?? 0) === 0 && isZeroAmountTrialUpdateInvoice(inv));
  check(
    "U8.reapply_invoice_is_classified_zero",
    allZeroAndClassified,
    newFromCall2.length === 0
      ? "re-apply spawned no invoice at all (nothing for the webhook to grant on)"
      : `re-apply spawned ${newFromCall2.length}: ` +
        `[${newFromCall2.map((i) => `${i.id}:${i.billing_reason}:${i.total}:guard=${isZeroAmountTrialUpdateInvoice(i)}`).join(", ")}]`
  );

  const paidAfterCall2 = await paidInvoiceCount(stripe, sub.id);
  check(
    "U9.reapply_charges_nothing",
    paidAfterCall2 === paidAfterCall1,
    `paid invoices ${paidAfterCall1} -> ${paidAfterCall2} (expect unchanged)`
  );
}

async function cleanup(stripe: Stripe): Promise<void> {
  if (KEEP) {
    console.log("\n--keep: leaving test objects in place.");
    return;
  }
  console.log("\nCleaning up test objects…");
  for (const id of created.customerIds) {
    try {
      await stripe.customers.del(id); // cascades subs + invoices
    } catch (e) {
      console.error(`  could not delete customer ${id}:`, (e as Error).message);
    }
  }
  for (const id of created.priceIds) {
    try {
      await stripe.prices.update(id, { active: false });
    } catch (e) {
      console.error(`  could not archive price ${id}:`, (e as Error).message);
    }
  }
  if (created.productId) {
    try {
      await stripe.products.update(created.productId, { active: false });
    } catch (e) {
      console.error(`  could not archive product:`, (e as Error).message);
    }
  }
}

async function main(): Promise<void> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    console.error("STRIPE_SECRET_KEY is not set in .env.local");
    process.exit(2);
  }
  if (!key.startsWith("sk_test_")) {
    console.error(
      `REFUSING TO RUN: STRIPE_SECRET_KEY is not a test key (starts with "${key.slice(0, 8)}…"). ` +
        `This probe creates and deletes objects and must only run against a Stripe TEST key (sk_test_…).`
    );
    process.exit(2);
  }

  // 20 days out: comfortably past the route's 14-day double-charge floor, so the probe exercises
  // the "keep their own anchor" path rather than the advance-a-month path.
  const trialEnd = Math.floor(Date.now() / 1000) + 20 * 24 * 60 * 60;

  console.log(`Stripe upgrade-anchor probe — TEST MODE — apiVersion ${STRIPE_API_VERSION}`);
  console.log(`Plan: Part A (control: un-fixed update is rejected) + Part B (the shipped sequence)`);
  console.log(`Simulated anchor trial_end=${trialEnd} (${new Date(trialEnd * 1000).toISOString()})`);
  console.log(
    "Asserts: U0 control rejected, U1 upgrade succeeds, U2 active, U3 one new paid invoice, " +
      "U4 latest_invoice is the full charge, U5 NO $0 invoice from the pay-first call, " +
      "U6 trialing after re-apply, U7 period_end==trial_end, U8 spawned invoice is classified $0, " +
      "U9 re-apply charges nothing"
  );

  if (DRY_RUN) {
    console.log("\n--dry-run: validated test key and printed plan. Created nothing. Exiting 0.");
    process.exit(0);
  }

  const stripe = new Stripe(key, { apiVersion: STRIPE_API_VERSION, typescript: true, maxNetworkRetries: 2 });

  try {
    const { low, high } = await ensurePrices(stripe);
    await runControl(stripe, low, high, trialEnd);
    await runFix(stripe, low, high, trialEnd);
  } catch (err) {
    console.error("\nProbe aborted with an error:", err);
    check("probe.completed", false, `threw before finishing: ${(err as Error).message}`);
  } finally {
    await cleanup(stripe);
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n=== RESULT: ${results.length - failed.length}/${results.length} assertions passed ===`);
  if (failed.length > 0) {
    console.log("FAILED:");
    for (const f of failed) console.log(`  ❌ ${f.id} — ${f.detail}`);
    console.log(
      "\nDo NOT merge the trial-aware upgrade until these pass. If U5 failed, the pay-first call " +
        "DOES spawn a $0 invoice and `latest_invoice` cannot be trusted — select the paid invoice " +
        "explicitly in the route before reading `amount_due`. See docs/PAST_DUE_REANCHOR.md."
    );
    process.exit(1);
  }
  console.log("All trial-aware-upgrade Stripe assumptions confirmed. Safe to merge.");
  process.exit(0);
}

main();
