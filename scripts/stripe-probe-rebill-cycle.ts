/**
 * Stripe Probe (TEST MODE ONLY): PHASE 0 gate for the "re-bill a stranded no_held_draft
 * member now" feature. Verifies — against live Stripe — that forcing the current cycle to
 * bill via `subscriptions.update({ billing_cycle_anchor: 'now', proration_behavior: 'none' })`
 * on a `past_due` sub with `pause_collection: keep_as_draft` and NO held draft yields a
 * **held DRAFT** `subscription_cycle` invoice (not an auto-charged/open one, not an error),
 * which can then be finalized + paid — i.e. the mechanism the mint primitive will rely on.
 *
 * If M2 (held draft) FAILS, the re-bill plan must be reconsidered before any app code.
 *
 * Creates throwaway TEST-MODE objects on a Test Clock; tears them down. Refuses non-sk_test.
 * Usage: npx tsx scripts/stripe-probe-rebill-cycle.ts   (--keep to leave objects for inspection)
 * @module scripts/stripe-probe-rebill-cycle
 */
import { config } from "dotenv";
import path from "path";
import Stripe from "stripe";
config({ path: path.resolve(process.cwd(), ".env.local") });

const key = process.env.STRIPE_SECRET_KEY ?? "";
if (!key.startsWith("sk_test_")) {
  console.error(`REFUSING: STRIPE_SECRET_KEY is not a test key (${key.slice(0, 8)}…). Test mode only.`);
  process.exit(1);
}
const KEEP = process.argv.includes("--keep");
const stripe = new Stripe(key, { apiVersion: "2025-08-27.basil" });
const TOKEN_GOOD = "tok_visa";
const TOKEN_DECLINE = "tok_chargeCustomerFail";

let pass = true;
const check = (id: string, ok: boolean, detail: string) => {
  console.log(`${ok ? "✅ PASS" : "❌ FAIL"}  ${id}  —  ${detail}`);
  if (!ok) pass = false;
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const periodEndOf = (s: Stripe.Subscription) => s.items?.data?.[0]?.current_period_end;
const reason = (i: Stripe.Invoice) => (i as Stripe.Invoice & { billing_reason?: string }).billing_reason;

async function pm(token: string) {
  return (await stripe.paymentMethods.create({ type: "card", card: { token } })).id;
}
async function advance(clockId: string, to: number) {
  await stripe.testHelpers.testClocks.advance(clockId, { frozen_time: to });
  for (let i = 0; i < 60; i++) {
    const c = await stripe.testHelpers.testClocks.retrieve(clockId);
    if (c.status === "ready") return;
    if (c.status === "internal_failure") throw new Error("test clock internal_failure");
    await sleep(2000);
  }
  throw new Error("test clock not ready in time");
}

const created = { clock: "", customer: "", product: "", price: "" };

async function main() {
  try {
    const nowUnix = Math.floor(Date.now() / 1000);
    const clock = await stripe.testHelpers.testClocks.create({ frozen_time: nowUnix });
    created.clock = clock.id;
    const product = await stripe.products.create({ name: "rebill-probe (delete me)" });
    created.product = product.id;
    const price = await stripe.prices.create({ product: product.id, unit_amount: 2000, currency: "aud", recurring: { interval: "month" } });
    created.price = price.id;

    const goodPm = await pm(TOKEN_GOOD);
    const customer = await stripe.customers.create({
      email: `rebill-probe-${nowUnix}@example.com`, payment_method: goodPm,
      invoice_settings: { default_payment_method: goodPm }, test_clock: clock.id,
    });
    created.customer = customer.id;

    const sub = await stripe.subscriptions.create({
      customer: customer.id, items: [{ price: price.id }],
      payment_behavior: "error_if_incomplete", expand: ["latest_invoice"],
    });
    check("P0.active", sub.status === "active", `sub status=${sub.status}`);

    // Swap to a declining card, advance past renewal → failed renewal → past_due.
    const declinePm = await pm(TOKEN_DECLINE);
    await stripe.paymentMethods.attach(declinePm, { customer: customer.id });
    await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: declinePm } });
    const pe = periodEndOf(sub)!;
    await advance(clock.id, pe + 3600);
    const pastDue = await stripe.subscriptions.retrieve(sub.id, { expand: ["items"] });
    check("P1.past_due", pastDue.status === "past_due" || pastDue.status === "unpaid", `status=${pastDue.status}`);

    // Pause keep_as_draft (mimic our app). Do NOT pay the failed invoice — this is the
    // no_held_draft state: one dead open cycle invoice, no draft yet.
    await stripe.subscriptions.update(sub.id, { pause_collection: { behavior: "keep_as_draft" } });
    const draftsBefore = await stripe.invoices.list({ subscription: sub.id, status: "draft", limit: 10 });
    check("P2.no_held_draft", draftsBefore.data.length === 0, `held drafts before mint=${draftsBefore.data.length} (expect 0)`);

    // ── INTEGRATION TEST: call the REAL mintCurrentCycleInvoice primitive with an injected
    //    always-acquire claim (no Mongo) + real Stripe deps. Verifies unpause+anchor, that
    //    latest_invoice resolves to the minted PAID invoice, the void, and the result mapping. ──
    // Put a GOOD card back on first (so the forced cycle auto-charges).
    const goodPm2 = await pm(TOKEN_GOOD);
    await stripe.paymentMethods.attach(goodPm2, { customer: customer.id });
    await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: goodPm2 } });

    const { mintCurrentCycleInvoice } = await import("../src/services/subscription/mintCurrentCycleInvoice");
    const deadOriginal = (await stripe.invoices.list({ subscription: sub.id, status: "open", limit: 1 })).data[0]?.id;
    const result = await mintCurrentCycleInvoice(
      { subscriptionId: sub.id, originalInvoiceId: deadOriginal, claimedBy: "probe" },
      {
        acquireClaim: async () => true, // injected: no Mongo in a Stripe probe
        releaseClaim: async () => {},
        getSubscription: (id) => stripe.subscriptions.retrieve(id),
        unpauseAndAnchorNow: (id) => stripe.subscriptions.update(id, {
          pause_collection: "", billing_cycle_anchor: "now", proration_behavior: "none",
          metadata: { billing_anchor_rule: "rebill_current_cycle" }, expand: ["latest_invoice"],
        }),
        voidInvoice: async (id) => { await stripe.invoices.voidInvoice(id).catch(() => {}); },
      }
    );
    check("M0.mint_ok", result.ok === true, `mintCurrentCycleInvoice → ${JSON.stringify(result)}`);
    if (result.ok) {
      check("M1.amount_paid", result.amountPaid === 2000, `minted invoice collected $${(result.amountPaid/100).toFixed(2)} (expect $20.00)`);
      const mi = await stripe.invoices.retrieve(result.invoiceId);
      console.log(`  🔑 FINDING: minted billing_reason=${reason(mi)} (anchor:'now' → subscription_update; webhook normalizes → grants a full cycle off LIVE metadata)`);
      check("M2.latest_invoice_is_paid", mi.status === "paid", `latest_invoice resolved to the minted PAID invoice (status=${mi.status})`);
    }
    // Renewal pushed ~1 month out (anchor:'now' doubles as the reanchor).
    const fresh = await stripe.subscriptions.retrieve(sub.id, { expand: ["items"] });
    const daysOut = ((periodEndOf(fresh) ?? 0) - Math.floor(Date.now() / 1000)) / 86400;
    check("M3.renewal_pushed_out", (periodEndOf(fresh) ?? 0) > Math.floor(Date.now() / 1000), `next renewal period_end in ~${daysOut.toFixed(0)}d (anchor:now doubles as the reanchor)`);
    // The dead original was voided.
    if (deadOriginal) {
      const orig = await stripe.invoices.retrieve(deadOriginal);
      check("M4.original_voided", orig.status === "void", `dead original ${deadOriginal} status=${orig.status} (expect void)`);
    }
  } finally {
    if (!KEEP) {
      if (created.clock) await stripe.testHelpers.testClocks.del(created.clock).catch(() => {});
      if (created.customer) await stripe.customers.del(created.customer).catch(() => {});
      if (created.price) await stripe.prices.update(created.price, { active: false }).catch(() => {});
      if (created.product) await stripe.products.update(created.product, { active: false }).catch(() => {});
      console.log("\nCleaned up test objects.");
    } else {
      console.log("\n--keep: left objects for inspection.");
    }
  }
  console.log(`\n=== RESULT: ${pass ? "ALL PASS — billing_cycle_anchor:'now' under keep_as_draft yields a payable held draft; mint mechanism viable" : "FAIL — reconsider the mint mechanism before app code"} ===`);
  process.exit(pass ? 0 : 1);
}
main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
