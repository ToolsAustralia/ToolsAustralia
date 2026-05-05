// src/server/admin/__tests__/chargePastDueSelectionPolicy.test.ts
import assert from "node:assert/strict";
import type Stripe from "stripe";
import { selectCurrentSubscriptionChargeable } from "../chargePastDueSelectionPolicy";

// Minimal invoice factory — only the fields the function reads.
function makeInvoice(
  id: string,
  opts: {
    subId?: string | null;          // root-level .subscription (legacy API)
    parentSubId?: string | null;    // .parent.subscription_details.subscription (new API)
    status?: string;
    collectionMethod?: string;
    amountRemaining?: number;
    created?: number;
  } = {}
): Stripe.Invoice {
  const {
    subId = null,
    parentSubId,
    status = "open",
    collectionMethod = "charge_automatically",
    amountRemaining = 5000,
    created = 1000,
  } = opts;

  return {
    id,
    status,
    collection_method: collectionMethod,
    amount_remaining: amountRemaining,
    created,
    subscription: subId,
    ...(parentSubId !== undefined
      ? { parent: { subscription_details: { subscription: parentSubId } } }
      : {}),
  } as unknown as Stripe.Invoice;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

function testNewApiFieldReturnsTargetWhenMatching() {
  // Stripe >=2025-04-01: subscription id lives on parent.subscription_details.subscription
  const inv = makeInvoice("in_new", { parentSubId: "sub_abc", subId: null });
  const result = selectCurrentSubscriptionChargeable([inv], "sub_abc");
  assert.equal(result.target?.id, "in_new", "should select invoice with parent.subscription_details.subscription match");
  assert.equal(result.skipped.length, 0);
}

function testLegacyRootFieldReturnsTargetWhenMatching() {
  // Stripe <2025-04-01: subscription id lives at invoice.subscription
  const inv = makeInvoice("in_legacy", { subId: "sub_abc" });
  const result = selectCurrentSubscriptionChargeable([inv], "sub_abc");
  assert.equal(result.target?.id, "in_legacy", "should select invoice with root .subscription match");
  assert.equal(result.skipped.length, 0);
}

function testNewApiFieldTakesPrecedenceOverLegacyRoot() {
  // If both exist and DISAGREE, parent field wins (Stripe 2025-04-01+ is authoritative).
  // The invoice belongs to sub_right via parent field; root field points to a different sub.
  const inv = makeInvoice("in_both", { parentSubId: "sub_right", subId: "sub_wrong" });
  const resultRight = selectCurrentSubscriptionChargeable([inv], "sub_right");
  const resultWrong = selectCurrentSubscriptionChargeable([inv], "sub_wrong");
  assert.equal(resultRight.target?.id, "in_both", "parent field should win when both present");
  assert.equal(resultWrong.target, null, "legacy root should be ignored when parent field exists");
}

function testDifferentSubIdIsFilteredOut() {
  const inv = makeInvoice("in_other", { subId: "sub_other" });
  const result = selectCurrentSubscriptionChargeable([inv], "sub_abc");
  assert.equal(result.target, null, "invoice on a different sub should not be returned");
  assert.equal(result.skipped.length, 1);
  assert.equal(result.skipped[0].id, "in_other");
}

function testInvoiceWithNeitherFieldIsFilteredOut() {
  const inv = makeInvoice("in_nosub", { subId: null });
  const result = selectCurrentSubscriptionChargeable([inv], "sub_abc");
  assert.equal(result.target, null, "invoice with no sub id should be skipped");
  assert.equal(result.skipped.length, 1);
}

function testNullUserSubIdReturnsNullTarget() {
  const inv = makeInvoice("in_any", { subId: "sub_abc" });
  const result = selectCurrentSubscriptionChargeable([inv], null);
  assert.equal(result.target, null);
  assert.equal(result.skipped.length, 1, "all invoices should be in skipped when userSubId is null");
}

function testUndefinedUserSubIdReturnsNullTarget() {
  const inv = makeInvoice("in_any", { subId: "sub_abc" });
  const result = selectCurrentSubscriptionChargeable([inv], undefined);
  assert.equal(result.target, null);
  assert.equal(result.skipped.length, 1, "all invoices should be in skipped when userSubId is undefined");
}

function testEmptyInvoiceListReturnsNullTarget() {
  const result = selectCurrentSubscriptionChargeable([], "sub_abc");
  assert.equal(result.target, null);
  assert.equal(result.skipped.length, 0);
}

function testMultipleInvoicesMixedSubsOnlyMatchingSelected() {
  // Two invoices on the right sub, one on a different sub.
  const matchA = makeInvoice("in_matchA", { subId: "sub_abc", created: 100, amountRemaining: 5000 });
  const matchB = makeInvoice("in_matchB", { parentSubId: "sub_abc", created: 200, amountRemaining: 5000 });
  const other  = makeInvoice("in_other",  { subId: "sub_xyz" });

  const result = selectCurrentSubscriptionChargeable([matchA, matchB, other], "sub_abc");
  // pickOpenInvoiceForFailedRenewal picks the newest — matchB (created: 200)
  assert.equal(result.target?.id, "in_matchB", "should pick newest matching open invoice");
  assert.equal(result.skipped.length, 2, "non-target invoices (matchA + other) should be skipped");
  const skippedIds = result.skipped.map((i) => i.id).sort();
  assert.deepEqual(skippedIds, ["in_matchA", "in_other"]);
}

function testNonChargeableInvoiceOnCorrectSubYieldsNullTarget() {
  // Invoice on the right sub but with collection_method = "send_invoice" → not chargeable
  const inv = makeInvoice("in_manual", { subId: "sub_abc", collectionMethod: "send_invoice" });
  const result = selectCurrentSubscriptionChargeable([inv], "sub_abc");
  assert.equal(result.target, null, "send_invoice collection method should not be a target");
}

function run() {
  testNewApiFieldReturnsTargetWhenMatching();
  testLegacyRootFieldReturnsTargetWhenMatching();
  testNewApiFieldTakesPrecedenceOverLegacyRoot();
  testDifferentSubIdIsFilteredOut();
  testInvoiceWithNeitherFieldIsFilteredOut();
  testNullUserSubIdReturnsNullTarget();
  testUndefinedUserSubIdReturnsNullTarget();
  testEmptyInvoiceListReturnsNullTarget();
  testMultipleInvoicesMixedSubsOnlyMatchingSelected();
  testNonChargeableInvoiceOnCorrectSubYieldsNullTarget();
  console.log("chargePastDueSelectionPolicy tests passed");
}

run();
