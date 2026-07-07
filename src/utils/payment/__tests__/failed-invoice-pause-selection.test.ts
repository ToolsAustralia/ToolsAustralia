import assert from "node:assert/strict";
import type Stripe from "stripe";
import { pickOpenInvoiceForFailedRenewal } from "../failed-invoice-selection";

function inv(
  id: string,
  created: number,
  opts: { amount_remaining?: number; collection_method?: Stripe.Invoice.CollectionMethod }
): Stripe.Invoice {
  return {
    id,
    object: "invoice",
    created,
    amount_remaining: opts.amount_remaining ?? 1000,
    collection_method: opts.collection_method ?? "charge_automatically",
  } as Stripe.Invoice;
}

function testPicksNewestOpenWithAmount() {
  const a = inv("in_old", 100, { amount_remaining: 1000 });
  const b = inv("in_new", 200, { amount_remaining: 500 });
  const picked = pickOpenInvoiceForFailedRenewal([a, b]);
  assert.equal(picked?.id, "in_new");
}

function testFiltersZeroRemaining() {
  const a = inv("in_open", 100, { amount_remaining: 0 });
  assert.equal(pickOpenInvoiceForFailedRenewal([a]), null);
}

function testFiltersSendInvoice() {
  const a = inv("in_si", 100, { amount_remaining: 1000, collection_method: "send_invoice" });
  assert.equal(pickOpenInvoiceForFailedRenewal([a]), null);
}

function testStillReturnsStrandedOpenInvoice() {
  // APPROACH B GUARD: the shared picker must KEEP returning a stranded (retry-exhausted) open
  // invoice — the admin recover path and Norm's `willRecover` depend on it being surfaced.
  // Member paths detect "stranded" at the PAY step; this selector must NOT be hardened to drop it.
  const stranded = {
    id: "in_stranded",
    object: "invoice",
    created: 300,
    amount_remaining: 4000,
    collection_method: "charge_automatically",
    status: "open",
    attempt_count: 3,
    next_payment_attempt: null,
  } as unknown as Stripe.Invoice;
  const picked = pickOpenInvoiceForFailedRenewal([stranded]);
  assert.equal(picked?.id, "in_stranded", "shared picker must still return stranded opens (Approach B)");
}

function run() {
  testPicksNewestOpenWithAmount();
  testFiltersZeroRemaining();
  testFiltersSendInvoice();
  testStillReturnsStrandedOpenInvoice();
  console.log("failed-invoice pause selection tests passed");
}

run();
