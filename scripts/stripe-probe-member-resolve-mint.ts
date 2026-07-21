/**
 * Stripe Probe (TEST MODE ONLY): verifies the MEMBER "Resolve past due" mint path added to
 * `pay-failed-invoice` — specifically the DECLINE branch, which is the part unit tests can't cover.
 *
 * When a stranded `no_held_draft` member clicks Resolve, the route mints a fresh current cycle on
 * their DEFAULT card via `mintCurrentCycleInvoice({ skipClaim: true })`. If that default card
 * DECLINES (or needs 3DS off_session can't do), the design prompts the member to add a working card
 * (requiresNewCardPreflight); their retry then collects on the new default via the normal open-invoice
 * pay path. This probe proves — against live Stripe — that:
 *   D0  the mint on a declining default returns `charge_failed`
 *   D1  `classifyMemberResolveMintOutcome` maps that to `retry_interactively`
 *   D2  the minted invoice is left `open` (unpaid, retryable — not void/dead)
 *   D5  the minted-failed invoice is NOT re-classified "stranded" (so a later Resolve won't re-mint)
 *   D6  after the member adds a working card, the retry collects on the new default (the recovery)
 * It also proves `skipClaim: true` never touches the claim (the injected claim deps throw if called).
 *
 * Creates throwaway TEST-MODE objects on a Test Clock; tears them down. Refuses non-sk_test.
 * Usage: npx tsx scripts/stripe-probe-member-resolve-mint.ts   (--keep to leave objects)
 * @module scripts/stripe-probe-member-resolve-mint
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
    const { mintCurrentCycleInvoice } = await import("../src/services/subscription/mintCurrentCycleInvoice");
    const { classifyMemberResolveMintOutcome } = await import(
      "../src/utils/payment/recovery/member-resolve-mint-policy"
    );

    const nowUnix = Math.floor(Date.now() / 1000);
    const clock = await stripe.testHelpers.testClocks.create({ frozen_time: nowUnix });
    created.clock = clock.id;
    const product = await stripe.products.create({ name: "member-resolve-mint-probe (delete me)" });
    created.product = product.id;
    const price = await stripe.prices.create({
      product: product.id, unit_amount: 2000, currency: "aud", recurring: { interval: "month" },
    });
    created.price = price.id;

    const goodPm = await pm(TOKEN_GOOD);
    const customer = await stripe.customers.create({
      email: `member-resolve-mint-probe-${nowUnix}@example.com`, payment_method: goodPm,
      invoice_settings: { default_payment_method: goodPm }, test_clock: clock.id,
    });
    created.customer = customer.id;

    const sub = await stripe.subscriptions.create({
      customer: customer.id, items: [{ price: price.id }],
      payment_behavior: "error_if_incomplete", expand: ["latest_invoice"],
    });
    check("P0.active", sub.status === "active", `sub status=${sub.status}`);

    // Swap to a declining card + advance past renewal → failed renewal → past_due.
    const declinePm = await pm(TOKEN_DECLINE);
    await stripe.paymentMethods.attach(declinePm, { customer: customer.id });
    await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: declinePm } });
    const pe = periodEndOf(sub)!;
    await advance(clock.id, pe + 3600);
    const pastDue = await stripe.subscriptions.retrieve(sub.id, { expand: ["items"] });
    check("P1.past_due", pastDue.status === "past_due" || pastDue.status === "unpaid", `status=${pastDue.status}`);

    // Pause keep_as_draft (mimic the app). No held draft yet → the no_held_draft cohort.
    await stripe.subscriptions.update(sub.id, { pause_collection: { behavior: "keep_as_draft" } });
    const draftsBefore = await stripe.invoices.list({ subscription: sub.id, status: "draft", limit: 10 });
    check("P2.no_held_draft", draftsBefore.data.length === 0, `held drafts before mint=${draftsBefore.data.length} (expect 0)`);

    // ── DECLINE PATH: leave the DECLINING card as default so the mint's off_session auto-charge fails. ──
    const deadOriginal = (await stripe.invoices.list({ subscription: sub.id, status: "open", limit: 1 })).data[0]?.id;
    const result = await mintCurrentCycleInvoice(
      { subscriptionId: sub.id, originalInvoiceId: deadOriginal, claimedBy: "member", skipClaim: true },
      {
        // skipClaim: true → these must NEVER be called (proves the member route can't self-deadlock).
        acquireClaim: async () => { throw new Error("acquireClaim called under skipClaim"); },
        releaseClaim: async () => { throw new Error("releaseClaim called under skipClaim"); },
        getSubscription: (id) => stripe.subscriptions.retrieve(id),
        unpauseAndAnchorNow: (id) => stripe.subscriptions.update(id, {
          pause_collection: "", billing_cycle_anchor: "now", proration_behavior: "none",
          metadata: { billing_anchor_rule: "rebill_current_cycle" }, expand: ["latest_invoice"],
        }),
        voidInvoice: async (id) => { await stripe.invoices.voidInvoice(id).catch(() => {}); },
      }
    );
    check("D0.charge_failed", !result.ok && result.reason === "charge_failed", `mint on declining default → ${JSON.stringify(result)}`);
    check(
      "D1.classified_retry",
      classifyMemberResolveMintOutcome(result).kind === "retry_interactively",
      `classifier → ${classifyMemberResolveMintOutcome(result).kind} (expect retry_interactively)`
    );

    if (!result.ok && result.invoiceId) {
      const minted = await stripe.invoices.retrieve(result.invoiceId, { expand: ["payment_intent"] });
      check("D2.minted_open", minted.status === "open", `minted invoice status=${minted.status} (expect open — unpaid, retryable)`);

      // D5: the minted-failed invoice must NOT be re-classified as "stranded" — otherwise a member who
      // abandons and clicks Resolve again would MINT A SECOND cycle. It should route to normal interactive
      // pay instead.
      const { isOriginalInvoiceEligibleForRecovery } = await import(
        "../src/utils/payment/recovery/stranded-invoice-policy"
      );
      const elig = isOriginalInvoiceEligibleForRecovery(minted);
      const eligReason = "reason" in elig ? elig.reason : "";
      check("D5.not_stranded", !elig.eligible, `minted-failed invoice eligible-for-recovery=${elig.eligible} (expect false → an immediate re-Resolve routes to normal pay, not a re-mint; holds while Stripe still has a retry scheduled) [${eligReason}]`);

      // D6: the recovery the route drives on a decline — the member adds a WORKING card as the new
      // customer + subscription default (mirroring InlineCardSetup + updateSubscriptionPaymentMethod),
      // then their retry re-enters via the normal open-invoice pay path and collects on the NEW card.
      // This is why the route returns requiresNewCardPreflight (add-a-card) instead of re-charging the
      // card that just failed.
      const goodPm2 = await pm(TOKEN_GOOD);
      await stripe.paymentMethods.attach(goodPm2, { customer: customer.id });
      await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: goodPm2 } });
      await stripe.subscriptions.update(sub.id, { default_payment_method: goodPm2 });
      try {
        const paid = await stripe.invoices.pay(result.invoiceId, { off_session: false });
        check("D6.recovered_with_new_card", paid.status === "paid", `after adding a good default + retry: minted invoice status=${paid.status} (expect paid)`);
      } catch (e) {
        check("D6.recovered_with_new_card", false, `retry after good default threw: ${e instanceof Error ? e.message : String(e)}`);
      }
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
  console.log(
    `\n=== RESULT: ${pass ? "ALL PASS — declined member mint stays chargeable (no re-mint); add-a-card retry collects on the new default" : "FAIL — reconsider the member decline path before shipping"} ===`
  );
  process.exit(pass ? 0 : 1);
}
main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
