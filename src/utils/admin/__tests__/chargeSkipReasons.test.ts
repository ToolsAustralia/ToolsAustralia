import assert from "node:assert/strict";
import {
  SKIP_BUCKET_LABELS,
  SKIP_BUCKET_ORDER,
  classifySkipBucketFromMessage,
  classifySkipReasonFromMessage,
  skipReasonToBucket,
  type SkipBucketKey,
} from "../chargeSkipReasons";

function testEveryBucketHasLabelAndOrder() {
  for (const k of SKIP_BUCKET_ORDER) {
    assert.ok(SKIP_BUCKET_LABELS[k], `missing label for ${k}`);
  }
  // order covers exactly the label keys (no bucket unrenderable / no phantom order entry)
  assert.equal(SKIP_BUCKET_ORDER.length, Object.keys(SKIP_BUCKET_LABELS).length);
  assert.deepEqual(
    [...SKIP_BUCKET_ORDER].sort(),
    (Object.keys(SKIP_BUCKET_LABELS) as SkipBucketKey[]).sort()
  );
}

function testSkipReasonToBucket() {
  assert.equal(skipReasonToBucket("no_held_draft"), "noHeldDraft");
  assert.equal(skipReasonToBucket("awaiting_retry"), "awaitingRetry");
  assert.equal(skipReasonToBucket("recently_attempted"), "recentlyAttempted");
  assert.equal(skipReasonToBucket("no_longer_past_due"), "noLongerPastDue");
  assert.equal(skipReasonToBucket("already_paid"), "alreadyPaid");
  assert.equal(skipReasonToBucket("missing_payment_method"), "missingPaymentMethod");
  assert.equal(skipReasonToBucket("weird_unknown"), "other");
  assert.equal(skipReasonToBucket(undefined), "other");
  assert.equal(skipReasonToBucket(null), "other");
}

function testClassifyFromRealMessages() {
  // The exact strings the emitters write, so live rows bucket correctly.
  const cases: Array<[string, string | undefined]> = [
    ["Skipped: recovery no_held_draft — No held draft invoice exists on the subscription", "no_held_draft"],
    [
      "No held draft found; recovery cannot proceed without one (never create a manual invoice).",
      "no_held_draft",
    ],
    [
      "Skipped: no payable attempt right now — Stripe has a payment retry scheduled for 2026-07-25T00:00:00.000Z (auto-retry pending)",
      "awaiting_retry",
    ],
    ["Invoice already paid", "already_paid"],
    ['Skipped: subscription.status is "active", no longer past_due', "no_longer_past_due"],
    ["No payment method found on invoice or customer", "missing_payment_method"],
    ["Skipped: prior attempt at 2026-07-20T00:00:00.000Z within 6h window", "recently_attempted"],
    ["Skipped: another attempt within last 30 seconds (debounce)", "recently_attempted"],
    ["something totally unrecognized", undefined],
    ["", undefined],
    [null as unknown as string, undefined],
  ];
  for (const [msg, expected] of cases) {
    assert.equal(classifySkipReasonFromMessage(msg), expected, `reason for: ${msg}`);
  }
}

function testNoHeldDraftBeatsPaymentMethodPhrase() {
  // A no-held-draft message that also mentions "payment" must NOT bucket as missing_payment_method.
  const msg = "No held draft invoice exists; Stripe must have a cycle-billed draft to finalize and pay";
  assert.equal(classifySkipBucketFromMessage(msg), "noHeldDraft");
}

function testOneShotBucketing() {
  assert.equal(classifySkipBucketFromMessage("Skipped: recovery no_held_draft — x"), "noHeldDraft");
  assert.equal(
    classifySkipBucketFromMessage("Stripe has a payment retry scheduled for later (auto-retry pending)"),
    "awaitingRetry"
  );
  assert.equal(classifySkipBucketFromMessage(undefined), "other");
}

function run() {
  testEveryBucketHasLabelAndOrder();
  testSkipReasonToBucket();
  testClassifyFromRealMessages();
  testNoHeldDraftBeatsPaymentMethodPhrase();
  testOneShotBucketing();
  console.log("chargeSkipReasons tests passed");
}

run();
