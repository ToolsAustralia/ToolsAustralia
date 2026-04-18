import assert from "node:assert/strict";
import { isFullRefundByAmounts, sumSucceededRefundAmountCents } from "../stripe-refund-amount";

function testSumSucceededRefundAmountCents() {
  assert.equal(
    sumSucceededRefundAmountCents([
      { status: "succeeded", amount: 1000 },
      { status: "pending", amount: 500 },
      { status: "failed", amount: 200 },
    ]),
    1000
  );
  assert.equal(sumSucceededRefundAmountCents([]), 0);
}

function testIsFullRefundByAmounts() {
  assert.equal(isFullRefundByAmounts(1000, 1000), true);
  assert.equal(isFullRefundByAmounts(1001, 1000), true);
  assert.equal(isFullRefundByAmounts(999, 1000), false);
  assert.equal(isFullRefundByAmounts(100, 0), false);
}

function run() {
  testSumSucceededRefundAmountCents();
  testIsFullRefundByAmounts();
  console.log("stripe-refund-amount tests passed");
}

run();
