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

function run() {
  testPicksNewestOpenWithAmount();
  testFiltersZeroRemaining();
  testFiltersSendInvoice();
  console.log("failed-invoice pause selection tests passed");
}

run();
