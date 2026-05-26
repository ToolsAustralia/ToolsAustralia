import assert from "node:assert/strict";
import type Stripe from "stripe";
import type * as Mod from "../cancelIncompleteSubscription";

type HelperClient = Parameters<typeof Mod.cancelIncompleteSubscriptionAndVoidInvoice>[1];

type Calls = { cancel: string[]; void: string[] };

/**
 * Mock Stripe with a fixed subscription + invoice. Records cancel/void calls so we
 * can assert the helper only mutates abandoned-incomplete subs and only voids OPEN
 * invoices. No live calls.
 */
function mockStripe(opts: {
  subStatus: string;
  invoiceId?: string | null;
  invoiceStatus?: string;
  calls: Calls;
}): HelperClient {
  const { subStatus, invoiceId = "in_1", invoiceStatus = "open", calls } = opts;
  return {
    subscriptions: {
      retrieve: async (id: string) =>
        ({ id, status: subStatus, latest_invoice: invoiceId }) as unknown as Stripe.Subscription,
      cancel: async (id: string) => {
        calls.cancel.push(id);
        return { id, status: "canceled" } as unknown as Stripe.Subscription;
      },
    },
    invoices: {
      retrieve: async (id: string) =>
        ({ id, status: invoiceStatus }) as unknown as Stripe.Invoice,
      voidInvoice: async (id: string) => {
        calls.void.push(id);
        return { id, status: "void" } as unknown as Stripe.Invoice;
      },
    },
  } as unknown as HelperClient;
}

async function testCancelsIncompleteAndVoidsOpenInvoice(mod: typeof Mod) {
  const calls: Calls = { cancel: [], void: [] };
  const stripe = mockStripe({ subStatus: "incomplete", invoiceStatus: "open", calls });
  const r = await mod.cancelIncompleteSubscriptionAndVoidInvoice("sub_1", stripe);
  assert.equal(r.cancelled, true, "incomplete sub must be cancelled");
  assert.equal(r.invoiceVoided, true, "open invoice must be voided");
  assert.deepEqual(calls.cancel, ["sub_1"], "cancel called once for the sub");
  assert.deepEqual(calls.void, ["in_1"], "void called once for the invoice");
}

async function testSkipsManageable(mod: typeof Mod) {
  const calls: Calls = { cancel: [], void: [] };
  const stripe = mockStripe({ subStatus: "trialing", invoiceStatus: "open", calls });
  const r = await mod.cancelIncompleteSubscriptionAndVoidInvoice("sub_2", stripe);
  assert.equal(r.action, "skipped", "trialing sub must be skipped");
  assert.equal(r.cancelled, false, "must not cancel a manageable sub");
  assert.deepEqual(calls.cancel, [], "no cancel for manageable sub");
  assert.deepEqual(calls.void, [], "no void for manageable sub");
}

async function testSkipsCanceled(mod: typeof Mod) {
  const calls: Calls = { cancel: [], void: [] };
  const stripe = mockStripe({ subStatus: "canceled", calls });
  const r = await mod.cancelIncompleteSubscriptionAndVoidInvoice("sub_3", stripe);
  assert.equal(r.action, "skipped", "canceled sub must be skipped");
  assert.deepEqual(calls.cancel, [], "no cancel for canceled sub");
}

async function testIncompleteExpiredDoesNotCancelAndDoesNotVoidVoided(mod: typeof Mod) {
  const calls: Calls = { cancel: [], void: [] };
  // incomplete_expired: Stripe has already voided the invoice.
  const stripe = mockStripe({ subStatus: "incomplete_expired", invoiceStatus: "void", calls });
  const r = await mod.cancelIncompleteSubscriptionAndVoidInvoice("sub_4", stripe);
  assert.equal(r.cancelled, false, "must not cancel an already-terminal sub");
  assert.equal(r.invoiceVoided, false, "must not void an already-void invoice");
  assert.deepEqual(calls.cancel, [], "no cancel for incomplete_expired");
  assert.deepEqual(calls.void, [], "no void for already-void invoice");
}

async function testIncompleteWithPaidInvoiceCancelsButDoesNotVoid(mod: typeof Mod) {
  const calls: Calls = { cancel: [], void: [] };
  const stripe = mockStripe({ subStatus: "incomplete", invoiceStatus: "paid", calls });
  const r = await mod.cancelIncompleteSubscriptionAndVoidInvoice("sub_5", stripe);
  assert.equal(r.cancelled, true, "incomplete sub still cancelled");
  assert.equal(r.invoiceVoided, false, "paid invoice must never be voided");
  assert.deepEqual(calls.void, [], "no void for paid invoice");
}

async function testInvoiceRetrieveThrowsDoesNotCrashCaller(mod: typeof Mod) {
  const calls: Calls = { cancel: [], void: [] };
  const client = {
    subscriptions: {
      retrieve: async (id: string) =>
        ({ id, status: "incomplete", latest_invoice: "in_bad" }) as unknown as Stripe.Subscription,
      cancel: async (id: string) => {
        calls.cancel.push(id);
        return { id, status: "canceled" } as unknown as Stripe.Subscription;
      },
    },
    invoices: {
      retrieve: async () => {
        throw new Error("rate limit");
      },
      voidInvoice: async (id: string) => {
        calls.void.push(id);
        return { id, status: "void" } as unknown as Stripe.Invoice;
      },
    },
  } as unknown as HelperClient;
  const r = await mod.cancelIncompleteSubscriptionAndVoidInvoice("sub_err", client);
  assert.equal(r.cancelled, true, "sub still cancelled despite invoice error");
  assert.equal(r.invoiceVoided, false, "invoice void skipped on error");
  assert.equal(r.action, "cancelled", "action reflects the successful cancel");
  assert.deepEqual(calls.cancel, ["sub_err"], "cancel was called");
  assert.deepEqual(calls.void, [], "void not called after retrieve error");
}

async function testNullInvoiceSkipsVoid(mod: typeof Mod) {
  const calls: Calls = { cancel: [], void: [] };
  const stripe = mockStripe({ subStatus: "incomplete", invoiceId: null, calls });
  const r = await mod.cancelIncompleteSubscriptionAndVoidInvoice("sub_noinv", stripe);
  assert.equal(r.cancelled, true, "incomplete sub cancelled");
  assert.equal(r.invoiceVoided, false, "no invoice to void");
  assert.deepEqual(calls.void, [], "void not called when no invoice");
}

async function run() {
  process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_dummy_for_unit_tests";
  const mod = await import("../cancelIncompleteSubscription");
  await testCancelsIncompleteAndVoidsOpenInvoice(mod);
  await testSkipsManageable(mod);
  await testSkipsCanceled(mod);
  await testIncompleteExpiredDoesNotCancelAndDoesNotVoidVoided(mod);
  await testIncompleteWithPaidInvoiceCancelsButDoesNotVoid(mod);
  await testInvoiceRetrieveThrowsDoesNotCrashCaller(mod);
  await testNullInvoiceSkipsVoid(mod);
  console.log("cancel-incomplete-subscription tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
