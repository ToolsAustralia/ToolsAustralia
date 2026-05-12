import assert from "node:assert/strict";
import type Stripe from "stripe";
import { chooseChargeAction } from "../chargeOrRecoverPolicy";

function makeInvoice(overrides: Partial<Stripe.Invoice>): Stripe.Invoice {
  return {
    id: "in_test",
    status: "open",
    attempt_count: 0,
    next_payment_attempt: 1_700_000_000,
    amount_remaining: 2000,
    collection_method: "charge_automatically",
    ...overrides,
  } as Stripe.Invoice;
}

function testRoutesToPayForLiveOpenInvoice() {
  const decision = chooseChargeAction(makeInvoice({ status: "open" }));
  assert.equal(decision.kind, "pay");
}

function testRoutesToRecoverForOpenButExhaustedInvoice() {
  // Stripe quirk: open + attempt_count >= 1 + next_payment_attempt === null
  const decision = chooseChargeAction(
    makeInvoice({ status: "open", attempt_count: 3, next_payment_attempt: null })
  );
  assert.equal(decision.kind, "recover");
}

function testRoutesToRecoverForUncollectible() {
  const decision = chooseChargeAction(makeInvoice({ status: "uncollectible" }));
  assert.equal(decision.kind, "recover");
}

function testRoutesToRecoverForVoid() {
  const decision = chooseChargeAction(makeInvoice({ status: "void" }));
  assert.equal(decision.kind, "recover");
}

function testRoutesToPayForDraft() {
  // Draft is "still chargeable" per the recovery predicate; wrapper should pay it
  // (recovery would try to void + re-bill, which is wrong for a draft).
  const decision = chooseChargeAction(makeInvoice({ status: "draft" }));
  assert.equal(decision.kind, "pay");
}

function run() {
  testRoutesToPayForLiveOpenInvoice();
  testRoutesToRecoverForOpenButExhaustedInvoice();
  testRoutesToRecoverForUncollectible();
  testRoutesToRecoverForVoid();
  testRoutesToPayForDraft();
  console.log("chargeOrRecoverPolicy tests passed");
}

run();
