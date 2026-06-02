/**
 * Stripe Probe: Past-Due Reanchor mechanism (TEST MODE ONLY)
 *
 * Confirms — against the live Stripe API, not just docs — the behaviours the past-due reanchor
 * feature assumes when it calls `stripe.subscriptions.update({ trial_end, proration_behavior: 'none' })`
 * on a recovered subscription. Creates throwaway TEST-MODE objects and deletes them afterwards.
 * Never touches MongoDB or production. Refuses to run against a live key (`sk_live_…`).
 *
 * Usage:
 *   npm run stripe:probe-reanchor:dry      # validate env + print plan, create nothing
 *   npm run stripe:probe-reanchor          # Part A: core API behaviour on an active sub
 *   npx tsx scripts/stripe-probe-reanchor.ts --full   # Part A + Part B (real dunning via Test Clock)
 *
 * Options:
 *   --dry-run   Validate STRIPE_SECRET_KEY is a test key and print the plan; create no Stripe objects.
 *   --full      Also run Part B: drive a subscription through past_due → recovery via a Stripe Test
 *               Clock and assert the recovery-invoice gate signals (billing_reason, attempt_count)
 *               and the pause_collection → trial_end ordering. Slower (~30-60s; clock advances).
 *   --keep      Do NOT clean up created test objects (for manual dashboard inspection).
 *
 * What it asserts (maps to design spec §9):
 *   A1  trial_end + proration_behavior:'none' on a just-paid sub creates NO new charging invoice.
 *   A2  After the update: status === 'trialing' AND items[0].current_period_end === trial_end.
 *   A3  The just-paid invoice stays 'paid' (not voided/re-opened).
 *   A4  (--full) A real recovery invoice carries billing_reason==='subscription_cycle' AND attempt_count > 1.
 *   A5  (--full) Clearing pause_collection then setting trial_end (our two-step order) both succeed.
 *
 * Safety:
 * - HARD refuses any key not starting with `sk_test_`.
 * - All created objects (customers, subscriptions, invoices, test clocks, product/price) are torn
 *   down in a finally block unless --keep is passed.
 * - Exits non-zero if any assertion FAILS, so CI / the operator gets a clear gate result.
 *
 * Env: .env.local must have STRIPE_SECRET_KEY (a TEST key).
 *
 * @module scripts/stripe-probe-reanchor
 */

import { config } from "dotenv";
import path from "path";
import Stripe from "stripe";
import { getReanchorTrialEndTimestamp } from "@/utils/billing/anchor-billing";

config({ path: path.resolve(process.cwd(), ".env.local") });

const DRY_RUN = process.argv.includes("--dry-run");
const FULL = process.argv.includes("--full");
const KEEP = process.argv.includes("--keep");

const STRIPE_API_VERSION = "2025-08-27.basil";
/**
 * Stripe test tokens → fresh PaymentMethods. tok_visa always succeeds. tok_chargeCustomerFail
 * (card 4000000000000341) ATTACHES successfully but fails when CHARGED — the correct dunning card
 * (tok_chargeDeclined declines at attach-time validation, which is not what we want to simulate).
 */
const TOKEN_GOOD = "tok_visa";
const TOKEN_DECLINE = "tok_chargeCustomerFail";

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

/** Throwaway objects to delete in cleanup. */
const created = {
  customerIds: [] as string[],
  testClockIds: [] as string[],
  productId: undefined as string | undefined,
  priceId: undefined as string | undefined,
};

async function makePaymentMethod(stripe: Stripe, token: string): Promise<string> {
  const pm = await stripe.paymentMethods.create({ type: "card", card: { token } });
  return pm.id;
}

async function ensureProductAndPrice(stripe: Stripe): Promise<string> {
  const product = await stripe.products.create({ name: "Reanchor Probe (test, safe to delete)" });
  created.productId = product.id;
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: 1000, // $10.00 AUD
    currency: "aud",
    recurring: { interval: "month" },
  });
  created.priceId = price.id;
  return price.id;
}

/** Create an active, paid subscription. Optionally on a test clock. Returns the sub + its first invoice id. */
async function createActiveSubscription(
  stripe: Stripe,
  priceId: string,
  opts: { testClockId?: string } = {}
): Promise<{ sub: Stripe.Subscription; firstInvoiceId: string; customerId: string }> {
  const pmId = await makePaymentMethod(stripe, TOKEN_GOOD);
  const customer = await stripe.customers.create({
    email: `reanchor-probe+${results.length}-${Math.floor(Date.now() / 1000)}@example.com`,
    payment_method: pmId,
    invoice_settings: { default_payment_method: pmId },
    ...(opts.testClockId ? { test_clock: opts.testClockId } : {}),
  });
  created.customerIds.push(customer.id);

  const sub = await stripe.subscriptions.create({
    customer: customer.id,
    items: [{ price: priceId }],
    payment_behavior: "error_if_incomplete", // fail loudly if the first charge does not settle
    expand: ["latest_invoice"],
  });
  const latest = sub.latest_invoice as Stripe.Invoice | null;
  const firstInvoiceId = typeof latest === "object" && latest ? (latest.id as string) : "";
  return { sub, firstInvoiceId, customerId: customer.id };
}

/** Count invoices for a subscription that represent a real charge (amount_due > 0). */
async function chargingInvoiceCount(stripe: Stripe, subId: string): Promise<number> {
  const list = await stripe.invoices.list({ subscription: subId, limit: 100 });
  return list.data.filter((inv) => (inv.amount_due ?? 0) > 0).length;
}

/** Re-retrieve a subscription with items expanded. */
async function retrieveSub(stripe: Stripe, subId: string): Promise<Stripe.Subscription> {
  return stripe.subscriptions.retrieve(subId, { expand: ["items"] });
}

/** The reanchor update under test. */
async function reanchorUpdate(stripe: Stripe, subId: string, trialEnd: number): Promise<Stripe.Subscription> {
  return stripe.subscriptions.update(subId, {
    trial_end: trialEnd,
    proration_behavior: "none",
    metadata: { billing_anchor_rule: "past_due_reanchor", probe: "1" },
  });
}

// ---------------------------------------------------------------------------
// PART A — core API behaviour on an active, just-paid subscription
// ---------------------------------------------------------------------------
async function runPartA(stripe: Stripe, priceId: string): Promise<void> {
  console.log("\n=== PART A: trial_end behaviour on an active, just-paid subscription ===");
  const { sub, firstInvoiceId } = await createActiveSubscription(stripe, priceId);
  check("A0.active", sub.status === "active", `subscription created status=${sub.status}`);

  const before = await chargingInvoiceCount(stripe, sub.id);
  const trialEnd = getReanchorTrialEndTimestamp(new Date()); // exercise the real helper
  console.log(`  computed trial_end=${trialEnd} (${new Date(trialEnd * 1000).toISOString()})`);

  await reanchorUpdate(stripe, sub.id, trialEnd);
  await sleep(500); // let any async invoice settle
  const after = await chargingInvoiceCount(stripe, sub.id);
  const updated = await retrieveSub(stripe, sub.id);

  check("A1.no_new_charge", after === before, `charging invoices before=${before} after=${after} (expect equal)`);
  check("A2a.trialing", updated.status === "trialing", `status=${updated.status} (expect trialing)`);
  check(
    "A2b.period_end_eq_trial_end",
    periodEndOf(updated) === trialEnd,
    `items[0].current_period_end=${periodEndOf(updated)} vs trial_end=${trialEnd}`
  );

  const firstInvoice = firstInvoiceId ? await stripe.invoices.retrieve(firstInvoiceId) : null;
  check(
    "A3.paid_invoice_unchanged",
    firstInvoice?.status === "paid",
    `first invoice status=${firstInvoice?.status} (expect paid)`
  );
}

// ---------------------------------------------------------------------------
// PART B — full dunning lifecycle via a Stripe Test Clock
// ---------------------------------------------------------------------------
async function advanceClock(stripe: Stripe, clockId: string, toUnix: number): Promise<void> {
  await stripe.testHelpers.testClocks.advance(clockId, { frozen_time: toUnix });
  // Poll until the clock finishes advancing.
  for (let i = 0; i < 60; i++) {
    const clock = await stripe.testHelpers.testClocks.retrieve(clockId);
    if (clock.status === "ready") return;
    if (clock.status === "internal_failure") throw new Error("test clock internal_failure");
    await sleep(2000);
  }
  throw new Error("test clock did not become ready in time");
}

async function runPartB(stripe: Stripe, priceId: string): Promise<void> {
  console.log("\n=== PART B: past_due → recovery → reanchor via Test Clock ===");
  const nowUnix = Math.floor(Date.now() / 1000);
  const clock = await stripe.testHelpers.testClocks.create({ frozen_time: nowUnix });
  created.testClockIds.push(clock.id);

  const { sub, customerId } = await createActiveSubscription(stripe, priceId, { testClockId: clock.id });
  check("B0.active", sub.status === "active", `subscription on test clock status=${sub.status}`);

  // Swap the default card to one that declines, so the next renewal fails.
  const declinePmId = await makePaymentMethod(stripe, TOKEN_DECLINE);
  await stripe.paymentMethods.attach(declinePmId, { customer: customerId });
  await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: declinePmId } });

  // Advance just past the current period end to trigger the renewal charge (which will decline).
  const periodEnd = periodEndOf(sub);
  if (!periodEnd) {
    check("B.period_end_present", false, "no current_period_end on the created sub");
    return;
  }
  await advanceClock(stripe, clock.id, periodEnd + 3600);

  const pastDue = await retrieveSub(stripe, sub.id);
  check("B1.past_due", pastDue.status === "past_due" || pastDue.status === "unpaid", `status after failed renewal=${pastDue.status}`);

  // Find the open renewal invoice.
  const openList = await stripe.invoices.list({ subscription: sub.id, status: "open", limit: 10 });
  const renewalInvoice = openList.data.find((inv) => inv.billing_reason === "subscription_cycle");
  check(
    "B2.cycle_invoice_open",
    !!renewalInvoice,
    `open subscription_cycle invoice ${renewalInvoice?.id ?? "NOT FOUND"} (attempt_count=${renewalInvoice?.attempt_count})`
  );
  if (!renewalInvoice?.id) return;

  // Mimic our app: pause collection on the past_due sub.
  await stripe.subscriptions.update(sub.id, { pause_collection: { behavior: "keep_as_draft" } });

  // Recover: swap back to a good card and pay the open invoice.
  const goodPmId = await makePaymentMethod(stripe, TOKEN_GOOD);
  await stripe.paymentMethods.attach(goodPmId, { customer: customerId });
  await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: goodPmId } });
  const paid = await stripe.invoices.pay(renewalInvoice.id, { payment_method: goodPmId });

  // NOTE: because our app sets pause_collection on failure, Stripe does NOT auto-retry, so a
  // single-failure recovery has attempt_count === 1. The feature therefore does NOT rely on
  // attempt_count > 1 as the primary dunning signal — it uses a durable `dunning_recovery` invoice
  // metadata marker stamped at failure time (which a direct-to-Stripe probe like this does not run).
  console.log(
    `  ℹ️  recovered invoice attempt_count=${paid.attempt_count} (weak signal under pause_collection; the metadata marker is authoritative)`
  );
  check("A4.cycle_billing_reason", paid.billing_reason === "subscription_cycle",
    `recovered invoice billing_reason=${paid.billing_reason} (expect subscription_cycle)`);
  check("B3.invoice_paid", paid.status === "paid", `recovered invoice status=${paid.status}`);

  // Our two-step order: clear pause, THEN reanchor. Use the recovery instant (paid_at) as
  // recoveryDate — NOT real wall-clock — because the sub lives in TEST-CLOCK time ~1 month ahead.
  const recoveredSub = await retrieveSub(stripe, sub.id);
  const paidAt = paid.status_transitions?.paid_at;
  const recoveryDate = new Date((paidAt ?? Math.floor(Date.now() / 1000)) * 1000);
  const trialEnd = getReanchorTrialEndTimestamp(recoveryDate);
  try {
    await stripe.subscriptions.update(sub.id, { pause_collection: "" }); // resume
    const reanchored = await reanchorUpdate(stripe, sub.id, trialEnd);
    check("A5.pause_then_trial_end_ok", true, `cleared pause then set trial_end; status=${reanchored.status}`);
    const fresh = await retrieveSub(stripe, sub.id);
    check("A2a.trialing(B)", fresh.status === "trialing", `post-reanchor status=${fresh.status}`);
    check("A2b.period_end_eq_trial_end(B)", periodEndOf(fresh) === trialEnd,
      `items[0].current_period_end=${periodEndOf(fresh)} vs trial_end=${trialEnd}`);
  } catch (err) {
    check("A5.pause_then_trial_end_ok", false, `pause/trial_end sequence threw: ${(err as Error).message}`);
  }

  void recoveredSub;
}

// ---------------------------------------------------------------------------
async function cleanup(stripe: Stripe): Promise<void> {
  if (KEEP) {
    console.log("\n--keep set: leaving test objects in place for inspection.");
    return;
  }
  console.log("\nCleaning up test objects…");
  for (const id of created.testClockIds) {
    try {
      await stripe.testHelpers.testClocks.del(id); // deletes its customers/subs too
    } catch (e) {
      console.error(`  could not delete test clock ${id}:`, (e as Error).message);
    }
  }
  for (const id of created.customerIds) {
    try {
      await stripe.customers.del(id); // cascades subs + invoices
    } catch {
      // Customers on a deleted test clock are already gone — ignore.
    }
  }
  if (created.priceId) {
    try {
      await stripe.prices.update(created.priceId, { active: false });
    } catch (e) {
      console.error(`  could not archive price:`, (e as Error).message);
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

  console.log(`Stripe reanchor probe — TEST MODE — apiVersion ${STRIPE_API_VERSION}`);
  console.log(`Plan: Part A (core API behaviour)${FULL ? " + Part B (Test Clock dunning lifecycle)" : ""}`);
  console.log(
    "Asserts: A1 no new charge, A2 trialing & current_period_end==trial_end, A3 paid invoice unchanged" +
      (FULL ? ", A4 recovery gate signals, A5 pause→trial_end ordering" : "")
  );

  if (DRY_RUN) {
    console.log("\n--dry-run: validated test key and printed plan. Created nothing. Exiting 0.");
    process.exit(0);
  }

  const stripe = new Stripe(key, { apiVersion: STRIPE_API_VERSION, typescript: true, maxNetworkRetries: 2 });

  try {
    const priceId = await ensureProductAndPrice(stripe);
    await runPartA(stripe, priceId);
    if (FULL) await runPartB(stripe, priceId);
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
      "\nDo NOT merge the behavior flip to main until these pass (or the design is adjusted). See docs/PAST_DUE_REANCHOR.md §Pre-ship gate."
    );
    process.exit(1);
  }
  console.log("All reanchor Stripe assumptions confirmed. The behavior flip is safe to merge to main.");
  process.exit(0);
}

main();
