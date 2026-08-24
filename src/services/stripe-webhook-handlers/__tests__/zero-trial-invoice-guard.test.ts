import assert from "node:assert/strict";
import dotenv from "dotenv";
import path from "node:path";
import type Stripe from "stripe";

// Load .env.local before any imports that depend on env vars (the stripe
// singleton throws at import if STRIPE_SECRET_KEY is missing).
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

/**
 * Webhook-level regression test for the $0 "Trial period" invoice guard.
 *
 * The pure predicate is unit-tested in `test:trial-invoice`. This test pins the
 * thing the predicate test CANNOT: that `handleInvoicePaymentSucceeded` actually
 * HONORS the guard — i.e. given Stripe's $0 `subscription_update` trial-bookkeeping
 * invoice (auto-created whenever past-due reanchor / the anchor-billing migration /
 * join-anchoring sets `trial_end`), the handler short-circuits BEFORE the grant
 * flow. The guard is the SOLE line of defense against this double-grant (every
 * idempotency layer keys on the per-invoice/per-event id, and the $0 invoice has
 * its own distinct id), so a regression that removed or bypassed the guard would
 * silently reintroduce the bug with no second net. See docs/PAST_DUE_REANCHOR.md.
 *
 * Probe: the guard returns at index.ts:3601 — BEFORE `connectDB()` and the
 * `User.findOne({ stripeCustomerId })` lookup. So "was User.findOne reached?" is a
 * clean, fixture-free signal for whether execution passed the guard. We mock
 * `stripe.invoices.retrieve` (the handler re-retrieves the invoice fresh) and spy
 * on `User.findOne` (returns null so the handler bails harmlessly at user-not-found).
 *
 * If this test fails, the handler is granting (or about to grant) for the $0
 * trial invoice — a P0 double-grant regression.
 *
 * Case D covers the trial-aware tier upgrade (`upgrade-subscription-payment`), which
 * re-applies the anchor-24 `trial_end` AFTER charging. That one upgrade emits TWO
 * `subscription_update` invoices with DIFFERENT ids — the real paid upgrade charge and
 * Stripe's spawned $0 "Trial period" bookkeeping invoice. Cases A/C pin the two shapes
 * in isolation on one shared id; Case D pins the pair as it actually arrives, which is
 * what proves the classifier — not per-invoice-id idempotency — is what separates them.
 * See docs/PAST_DUE_REANCHOR.md and docs/subscription/.
 */

interface InvoiceShape {
  billing_reason: Stripe.Invoice["billing_reason"];
  total: number;
  amount_paid: number;
  /** Defaults to TEST_INVOICE_ID. Case D needs two DISTINCT ids in one scenario. */
  id?: string;
}

const TEST_INVOICE_ID = "in_zero_trial_guard_test_001";
const TEST_CUSTOMER_ID = "cus_zero_trial_guard_test_001";
/** The two invoices one trial-aware upgrade emits — distinct ids, same billing_reason. */
const UPGRADE_PAID_INVOICE_ID = "in_zero_trial_guard_test_upgrade_paid";
const UPGRADE_TRIAL_INVOICE_ID = "in_zero_trial_guard_test_upgrade_trial";

function buildInvoice(shape: InvoiceShape): Stripe.Invoice {
  return {
    id: shape.id ?? TEST_INVOICE_ID,
    object: "invoice",
    status: "paid",
    billing_reason: shape.billing_reason,
    total: shape.total,
    amount_paid: shape.amount_paid,
    customer: TEST_CUSTOMER_ID,
    subscription: "sub_zero_trial_guard_test_001",
    lines: { data: [], has_more: false, object: "list", url: "" },
    metadata: {},
  } as unknown as Stripe.Invoice;
}

function buildEvent(invoice: Stripe.Invoice): Stripe.Event {
  return {
    id: `evt_zero_trial_guard_test_${invoice.id}`,
    type: "invoice.payment_succeeded",
    data: { object: invoice },
    created: 1715476800,
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    api_version: "2025-08-27.basil",
    object: "event",
  } as unknown as Stripe.Event;
}

async function run() {
  const { stripe } = await import("@/lib/stripe");
  const { default: connectDB } = await import("@/lib/mongodb");
  const { default: User } = await import("@/models/User");
  const { default: PaymentEvent } = await import("@/models/PaymentEvent");
  const { dispatchStripeEvent } = await import("../index");

  // The $0-skip case short-circuits BEFORE the handler's own connectDB(), so we
  // connect explicitly here for the PaymentEvent assertion / cleanup. (Cases B/C
  // reach the handler's connectDB, which is then a no-op.)
  await connectDB();

  // ── Install spies on the two shared singletons. Both are patched as object
  //    properties, so the handler (which imported the same instances) sees them.
  const originalRetrieve = stripe.invoices.retrieve;
  const originalFindOne = User.findOne;

  let currentInvoice: Stripe.Invoice = buildInvoice({ billing_reason: "subscription_cycle", total: 5000, amount_paid: 5000 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (stripe.invoices as any).retrieve = async () => currentInvoice;

  let findOneCalls = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (User as any).findOne = (...args: unknown[]) => {
    findOneCalls++;
    void args;
    return Promise.resolve(null);
  };

  // Each case: set the invoice the handler will "retrieve", dispatch, and observe
  // whether the guard let execution through to the user lookup.
  async function dispatchWith(shape: InvoiceShape): Promise<number> {
    currentInvoice = buildInvoice(shape);
    findOneCalls = 0;
    try {
      await dispatchStripeEvent(buildEvent(currentInvoice));
    } catch {
      // The handler may throw downstream (we return null user); irrelevant — the
      // findOneCalls counter already captured whether the guard was passed.
    }
    return findOneCalls;
  }

  let failures = 0;
  function expect(label: string, actual: unknown, expected: unknown) {
    try {
      assert.deepEqual(actual, expected);
      console.log(`  PASS  ${label}`);
    } catch {
      failures++;
      console.error(`  FAIL  ${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
    }
  }

  try {
    // Case A — Stripe's $0 trial-bookkeeping invoice MUST be skipped by the guard,
    // so the handler never reaches the user lookup / grant flow.
    const aCalls = await dispatchWith({ billing_reason: "subscription_update", total: 0, amount_paid: 0 });
    expect("$0 subscription_update invoice is skipped (User.findOne NOT reached)", aCalls, 0);

    // And it must not have created a BenefitsGranted PaymentEvent.
    const aGrantRows = await PaymentEvent.countDocuments({
      _id: `BenefitsGranted-invoice_${TEST_INVOICE_ID}`,
    });
    expect("$0 subscription_update invoice creates no BenefitsGranted row", aGrantRows, 0);

    // Case B — a real renewal (subscription_cycle, paid) MUST NOT be skipped: the
    // handler proceeds past the guard to the user lookup.
    const bCalls = await dispatchWith({ billing_reason: "subscription_cycle", total: 5000, amount_paid: 5000 });
    expect("real subscription_cycle renewal is NOT skipped (User.findOne reached)", bCalls >= 1, true);

    // Case C — a real PAID upgrade proration (subscription_update with total > 0)
    // MUST NOT be skipped. Guards against someone widening the predicate to skip
    // ALL subscription_update invoices, which would silently drop upgrade grants.
    const cCalls = await dispatchWith({ billing_reason: "subscription_update", total: 2000, amount_paid: 2000 });
    expect("paid subscription_update upgrade is NOT skipped (User.findOne reached)", cCalls >= 1, true);

    // ── Case D — the trial-aware tier upgrade (`upgrade-subscription-payment`).
    // An anchor-24 member sits on a pending `trial_end`, so the pay-first upgrade must
    // end the trial to charge, then RE-APPLY the anchor-24 `trial_end` for the next
    // cycle. That re-apply makes Stripe spawn its $0 "Trial period" invoice — a SECOND
    // `subscription_update` invoice, with its own id, moments after the real paid one.
    //
    // Both invoices carry billing_reason "subscription_update", so nothing about the id,
    // the event, or the ordering tells them apart — only `isZeroAmountTrialUpdateInvoice`
    // does. Dispatching them as a PAIR (distinct ids, real order: charge then trial) is
    // the assertion A/C cannot make: it proves per-invoice-id idempotency is NOT what
    // stops the double-grant, because the $0 invoice's id has never been seen before.

    // D1 — the real paid upgrade charge MUST grant.
    const dPaidCalls = await dispatchWith({
      id: UPGRADE_PAID_INVOICE_ID,
      billing_reason: "subscription_update",
      total: 2000,
      amount_paid: 2000,
    });
    expect("upgrade: paid charge invoice is NOT skipped (User.findOne reached)", dPaidCalls >= 1, true);

    // D2 — the $0 trial invoice the re-apply spawns MUST be skipped, even though it is a
    // brand-new invoice id arriving right after a real payment on the same subscription.
    const dTrialCalls = await dispatchWith({
      id: UPGRADE_TRIAL_INVOICE_ID,
      billing_reason: "subscription_update",
      total: 0,
      amount_paid: 0,
    });
    expect("upgrade: spawned $0 trial invoice is skipped (User.findOne NOT reached)", dTrialCalls, 0);

    // D3 — and it left no grant behind. This is the actual double-grant assertion: the
    // member is charged once for the upgrade and gets exactly one batch of free entries.
    const dTrialGrantRows = await PaymentEvent.countDocuments({
      _id: `BenefitsGranted-invoice_${UPGRADE_TRIAL_INVOICE_ID}`,
    });
    expect("upgrade: spawned $0 trial invoice creates no BenefitsGranted row", dTrialGrantRows, 0);
  } finally {
    // Restore the singletons and clean up.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (stripe.invoices as any).retrieve = originalRetrieve;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (User as any).findOne = originalFindOne;
    try {
      await PaymentEvent.deleteMany({
        _id: {
          $in: [
            `BenefitsGranted-invoice_${TEST_INVOICE_ID}`,
            `BenefitsGranted-invoice_${UPGRADE_PAID_INVOICE_ID}`,
            `BenefitsGranted-invoice_${UPGRADE_TRIAL_INVOICE_ID}`,
          ],
        },
      });
    } catch {
      // best-effort cleanup
    }
  }

  if (failures > 0) {
    console.error(`zero-trial-invoice-guard test FAILED (${failures} assertion(s))`);
    process.exit(1);
  }
  console.log("zero-trial-invoice-guard test passed");
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
