import assert from "node:assert/strict";
import { normalizeStripePaymentIntentKeyForCommission } from "../affiliate-attribution";

function testNormalizeInvoicePrefix() {
  assert.equal(normalizeStripePaymentIntentKeyForCommission("invoice_in_1ABC"), "invoice_in_1ABC");
  assert.equal(normalizeStripePaymentIntentKeyForCommission("in_1ABC"), "invoice_in_1ABC");
}

function testNormalizePaymentIntent() {
  assert.equal(normalizeStripePaymentIntentKeyForCommission("pi_123"), "pi_123");
}

function run() {
  testNormalizeInvoicePrefix();
  testNormalizePaymentIntent();
  console.log("affiliate-attribution tests passed");
}

run();
