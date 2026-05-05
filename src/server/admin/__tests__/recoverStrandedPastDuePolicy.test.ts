import assert from "node:assert/strict";
import type Stripe from "stripe";
import {
  buildRecoveryVoidIdempotencyKey,
  buildRecoveryCreateIdempotencyKey,
  buildRecoveryFinalizeIdempotencyKey,
  buildRecoveryItemIdempotencyKey,
  isOriginalInvoiceEligibleForRecovery,
  pickHeldDraftForRecovery,
  hasRecentRecoveryAttempt,
} from "../recoverStrandedPastDuePolicy";

function testIdempotencyKeysAreStableAndDistinct() {
  assert.equal(buildRecoveryVoidIdempotencyKey("in_x"), "recover-void-in_x");
  assert.equal(buildRecoveryCreateIdempotencyKey("in_x"), "recover-create-in_x");
  assert.equal(buildRecoveryFinalizeIdempotencyKey("in_y"), "recover-finalize-in_y");
  assert.equal(buildRecoveryItemIdempotencyKey("in_x"), "recover-item-in_x");
  assert.notEqual(
    buildRecoveryVoidIdempotencyKey("in_a"),
    buildRecoveryVoidIdempotencyKey("in_b")
  );
  // All four keys for the same invoice id must be distinct
  assert.notEqual(buildRecoveryVoidIdempotencyKey("in_x"), buildRecoveryCreateIdempotencyKey("in_x"));
  assert.notEqual(buildRecoveryCreateIdempotencyKey("in_x"), buildRecoveryItemIdempotencyKey("in_x"));
  assert.notEqual(buildRecoveryItemIdempotencyKey("in_x"), buildRecoveryFinalizeIdempotencyKey("in_x"));
}

function testEligibleWhenUncollectible() {
  const inv = { status: "uncollectible", amount_remaining: 4000 } as Stripe.Invoice;
  assert.equal(isOriginalInvoiceEligibleForRecovery(inv).eligible, true);
}

function testEligibleWhenAlreadyVoid() {
  const inv = { status: "void", amount_remaining: 4000 } as Stripe.Invoice;
  assert.equal(isOriginalInvoiceEligibleForRecovery(inv).eligible, true);
}

function testNotEligibleWhenStillOpen() {
  const inv = { status: "open", amount_remaining: 4000 } as Stripe.Invoice;
  const result = isOriginalInvoiceEligibleForRecovery(inv);
  assert.equal(result.eligible, false);
  assert.equal(result.reason, "still_chargeable");
}

function testNotEligibleWhenAlreadyPaid() {
  const inv = { status: "paid", amount_remaining: 0 } as Stripe.Invoice;
  const result = isOriginalInvoiceEligibleForRecovery(inv);
  assert.equal(result.eligible, false);
  assert.equal(result.reason, "already_paid");
}

function testNotEligibleWhenDraft() {
  const inv = { status: "draft", amount_remaining: 4000 } as Stripe.Invoice;
  const result = isOriginalInvoiceEligibleForRecovery(inv);
  assert.equal(result.eligible, false);
  assert.equal(result.reason, "still_chargeable");
}

function testPickHeldDraftMatchesAmount() {
  const drafts = [
    { id: "in_d1", status: "draft", amount_due: 2000, created: 100 } as Stripe.Invoice,
    { id: "in_d2", status: "draft", amount_due: 4000, created: 200 } as Stripe.Invoice,
    { id: "in_d3", status: "draft", amount_due: 4000, created: 300 } as Stripe.Invoice,
  ];
  const picked = pickHeldDraftForRecovery(drafts, 4000);
  assert.equal(picked?.id, "in_d3"); // newest matching
}

function testPickHeldDraftReturnsNullWhenNoMatch() {
  const drafts = [
    { id: "in_d1", status: "draft", amount_due: 2000, created: 100 } as Stripe.Invoice,
  ];
  assert.equal(pickHeldDraftForRecovery(drafts, 4000), null);
}

function testPickHeldDraftReturnsNullOnEmptyList() {
  assert.equal(pickHeldDraftForRecovery([], 4000), null);
}

function testRecentLockBlocksWithinWindow() {
  const now = new Date("2026-05-05T12:00:00.000Z");
  // 5h ago — inside the 6h window
  const rows = [
    {
      attemptedAt: new Date("2026-05-05T07:00:00.000Z"),
      result: { recovery: { originalInvoiceId: "in_orig" } },
    },
  ];
  assert.equal(hasRecentRecoveryAttempt(rows, "in_orig", now), true);
}

function testRecentLockAllowsAfterWindow() {
  const now = new Date("2026-05-05T12:00:00.000Z");
  // Just over 6h ago — outside the 6h window
  const rows = [
    {
      attemptedAt: new Date("2026-05-05T05:59:59.000Z"),
      result: { recovery: { originalInvoiceId: "in_orig" } },
    },
  ];
  assert.equal(hasRecentRecoveryAttempt(rows, "in_orig", now), false);
}

function testRecentLockIgnoresDifferentInvoice() {
  const now = new Date("2026-05-05T12:00:00.000Z");
  // 5h ago — inside window, but wrong invoice id
  const rows = [
    {
      attemptedAt: new Date("2026-05-05T07:00:00.000Z"),
      result: { recovery: { originalInvoiceId: "in_other" } },
    },
  ];
  assert.equal(hasRecentRecoveryAttempt(rows, "in_orig", now), false);
}

function testRecentLockIgnoresRowsWithoutRecoveryTag() {
  const now = new Date("2026-05-05T12:00:00.000Z");
  // 5h ago — inside window, but no recovery tag
  const rows = [
    { attemptedAt: new Date("2026-05-05T07:00:00.000Z"), result: {} },
    { attemptedAt: new Date("2026-05-05T07:00:00.000Z") },
  ];
  assert.equal(hasRecentRecoveryAttempt(rows, "in_orig", now), false);
}

function run() {
  testIdempotencyKeysAreStableAndDistinct();
  testEligibleWhenUncollectible();
  testEligibleWhenAlreadyVoid();
  testNotEligibleWhenStillOpen();
  testNotEligibleWhenAlreadyPaid();
  testNotEligibleWhenDraft();
  testPickHeldDraftMatchesAmount();
  testPickHeldDraftReturnsNullWhenNoMatch();
  testPickHeldDraftReturnsNullOnEmptyList();
  testRecentLockBlocksWithinWindow();
  testRecentLockAllowsAfterWindow();
  testRecentLockIgnoresDifferentInvoice();
  testRecentLockIgnoresRowsWithoutRecoveryTag();
  console.log("recoverStrandedPastDuePolicy tests passed");
}

run();
