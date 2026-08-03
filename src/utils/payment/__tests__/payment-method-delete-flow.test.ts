import assert from "node:assert/strict";
import {
  getPaymentMethodDeleteFlowKind,
  getPaymentMethodDeleteMessages,
  type PaymentMethodDeleteFlowKind,
} from "../payment-method-delete-flow";
import type { SavedPaymentMethod } from "@/hooks/queries";

// The Remove button is shown on EVERY saved card (including the default), so this helper is
// the only thing standing between a member and silently killing their own renewals. It picks
// which warning they see; `billing-last` additionally drives `confirmBillingRisk` on the API.

const pm = (id: string): SavedPaymentMethod => ({ paymentMethodId: id }) as SavedPaymentMethod;

function testNonBillingCardIsSimple() {
  // Not the subscription's billing card → nothing to warn about beyond re-entry.
  assert.equal(
    getPaymentMethodDeleteFlowKind("pm_other", [pm("pm_billing"), pm("pm_other")], "pm_billing", true),
    "simple"
  );
}

function testNoActiveSubscriptionIsAlwaysSimple() {
  // Even the card Stripe has on the subscription is harmless to drop with no active sub.
  assert.equal(
    getPaymentMethodDeleteFlowKind("pm_billing", [pm("pm_billing")], "pm_billing", false),
    "simple"
  );
}

function testBillingCardWithOthersReassigns() {
  // Backend auto-promotes a replacement, so the member is told renewals move, not that they stop.
  assert.equal(
    getPaymentMethodDeleteFlowKind("pm_billing", [pm("pm_billing"), pm("pm_spare")], "pm_billing", true),
    "billing-reassign"
  );
}

function testLastBillingCardIsBillingLast() {
  // The dangerous case: renewals genuinely stop.
  assert.equal(
    getPaymentMethodDeleteFlowKind("pm_billing", [pm("pm_billing")], "pm_billing", true),
    "billing-last"
  );
}

function testUnknownSubscriptionDefaultIsSimple() {
  // If we could not resolve the subscription's card, never claim renewals are at risk.
  assert.equal(
    getPaymentMethodDeleteFlowKind("pm_a", [pm("pm_a")], null, true),
    "simple"
  );
}

function testOnlyBillingLastRequiresExplicitConsent() {
  // The checkbox gates the one outcome the member cannot undo by re-adding later.
  const kinds: PaymentMethodDeleteFlowKind[] = ["simple", "billing-reassign", "billing-last"];
  for (const kind of kinds) {
    const copy = getPaymentMethodDeleteMessages(kind);
    assert.ok(copy.title.length > 0, `${kind} needs a title`);
    assert.ok(copy.message.length > 0, `${kind} needs a message`);
    assert.ok(copy.confirmText.length > 0, `${kind} needs a confirm label`);
    assert.equal(
      Boolean(copy.requireCheckbox),
      kind === "billing-last",
      `${kind}: checkbox must be required for billing-last only`
    );
  }
}

function testCopyStaysShortAndCustomerFacing() {
  for (const kind of ["simple", "billing-reassign", "billing-last"] as PaymentMethodDeleteFlowKind[]) {
    const { message } = getPaymentMethodDeleteMessages(kind);
    // Members dismiss walls of text; the consequence is the point of the dialog.
    assert.ok(
      message.length <= 130,
      `${kind} message is ${message.length} chars — keep it under 130`
    );
    // No internal/vendor jargon in customer-facing copy.
    for (const banned of ["Stripe", "customer record", "payment_method", "API"]) {
      assert.ok(
        !message.includes(banned),
        `${kind} message must not expose "${banned}" to members`
      );
    }
  }
}

function testBillingLastNamesTheRealConsequence() {
  const { message, requireCheckbox } = getPaymentMethodDeleteMessages("billing-last");
  assert.match(message, /won't renew/i, "must state renewals stop");
  assert.match(requireCheckbox!.label, /won't renew/i, "consent must restate the consequence");
}

function run() {
  testNonBillingCardIsSimple();
  testNoActiveSubscriptionIsAlwaysSimple();
  testBillingCardWithOthersReassigns();
  testLastBillingCardIsBillingLast();
  testUnknownSubscriptionDefaultIsSimple();
  testOnlyBillingLastRequiresExplicitConsent();
  testCopyStaysShortAndCustomerFacing();
  testBillingLastNamesTheRealConsequence();
  console.log("payment-method-delete-flow tests passed");
}

run();
