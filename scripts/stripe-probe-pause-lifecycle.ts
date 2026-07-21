#!/usr/bin/env npx tsx
/**
 * Stripe Probe (TEST MODE ONLY): verifies the STRIPE MECHANISM the 30-day retention-pause feature
 * relies on — `pause_collection{behavior:"void", resumes_at = period_end + 30d}`:
 *   (M1) during the freeze the cycle invoice is VOIDED — no charge — and Stripe keeps the sub
 *        `status:"active"` (the APP owns the DB "paused" state, not Stripe);
 *   (M2) at `resumes_at` Stripe AUTO-resumes collection and bills the next cycle (paid).
 *
 * The app-side pieces are covered by fast unit tests instead of this probe:
 *   - period-end timing  → `npm run test:retention-pause` (computeResumeAt)
 *   - flip/restore logic → `npm run test:pause-transition` (decidePauseTransition)
 * This probe covers only the Stripe-behaviour assumptions those rely on.
 *
 * Creates throwaway TEST-MODE objects on a Test Clock; tears them down. Refuses a non-`sk_test_` key
 * (your `.env.local` may hold the LIVE key — run this with a test key).
 * Usage: npx tsx scripts/stripe-probe-pause-lifecycle.ts [--keep]
 * @module scripts/stripe-probe-pause-lifecycle
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
const RETENTION_PAUSE_DAYS = 30;

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
    const nowUnix = Math.floor(Date.now() / 1000);
    const clock = await stripe.testHelpers.testClocks.create({ frozen_time: nowUnix });
    created.clock = clock.id;
    const product = await stripe.products.create({ name: "pause-probe (delete me)" });
    created.product = product.id;
    const price = await stripe.prices.create({
      product: product.id, unit_amount: 2000, currency: "aud", recurring: { interval: "month" },
    });
    created.price = price.id;

    const goodPm = await pm(TOKEN_GOOD);
    const customer = await stripe.customers.create({
      email: `pause-probe-${nowUnix}@example.com`, payment_method: goodPm,
      invoice_settings: { default_payment_method: goodPm }, test_clock: clock.id,
    });
    created.customer = customer.id;

    const sub = await stripe.subscriptions.create({
      customer: customer.id, items: [{ price: price.id }],
      payment_behavior: "error_if_incomplete", expand: ["latest_invoice"],
    });
    check("P0.active", sub.status === "active", `sub status=${sub.status}`);

    const periodEnd = periodEndOf(sub)!;
    const resumesAt = periodEnd + RETENTION_PAUSE_DAYS * 86400; // period_end + 30d — the feature's timing

    // Apply the retention pause exactly as RetentionPauseService does on the Stripe side.
    await stripe.subscriptions.update(sub.id, {
      pause_collection: { behavior: "void", resumes_at: resumesAt },
      metadata: { pauseReason: "retention", pauseResumesAt: new Date(resumesAt * 1000).toISOString() },
    });

    // ── M1: advance INTO the freeze (just past period end). The cycle invoice must be VOIDED
    //    (no charge), and Stripe keeps the sub `status:"active"` (the app owns "paused"). ──
    await advance(clock.id, periodEnd + 3600);
    const paidDuringFreeze = (await stripe.invoices.list({ customer: customer.id, status: "paid", limit: 20 })).data
      .filter((i) => (i.created ?? 0) > periodEnd);
    check("M1a.no_charge_during_freeze", paidDuringFreeze.length === 0,
      `paid invoices after period end during freeze=${paidDuringFreeze.length} (expect 0)`);
    const voidDuringFreeze = await stripe.invoices.list({ customer: customer.id, status: "void", limit: 20 });
    check("M1b.cycle_invoice_voided", voidDuringFreeze.data.length >= 1,
      `void invoices during freeze=${voidDuringFreeze.data.length} (expect >=1)`);
    const frozenSub = await stripe.subscriptions.retrieve(sub.id);
    check("M1c.stripe_still_active", frozenSub.status === "active",
      `Stripe status during freeze=${frozenSub.status} (the app owns "paused")`);
    check("M1d.pause_present", frozenSub.pause_collection != null,
      `pause_collection present during freeze=${frozenSub.pause_collection != null}`);

    // ── M2: advance to the resume date. Stripe AUTO-resumes (pause_collection null) and bills. ──
    await advance(clock.id, resumesAt + 3600);
    const resumedSub = await stripe.subscriptions.retrieve(sub.id);
    check("M2a.auto_resumed", resumedSub.pause_collection == null,
      `pause_collection cleared at resume=${resumedSub.pause_collection == null}`);
    check("M2b.stripe_active", resumedSub.status === "active", `Stripe status after resume=${resumedSub.status}`);
    const billedAtResume = (await stripe.invoices.list({ customer: customer.id, status: "paid", limit: 20 })).data
      .filter((i) => (i.created ?? 0) >= resumesAt - 86400);
    check("M2c.auto_billed_next_cycle", billedAtResume.length >= 1,
      `paid cycle invoices at/after resume=${billedAtResume.length} (expect >=1)`);
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
    `\n=== RESULT: ${pass ? "ALL PASS — void pause discards cycle invoices during the freeze; Stripe auto-resumes + bills at resumes_at" : "FAIL — reconsider the pause mechanism"} ===`
  );
  process.exit(pass ? 0 : 1);
}
main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
