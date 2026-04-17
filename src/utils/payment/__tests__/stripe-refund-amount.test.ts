import assert from "node:assert/strict";
import {
  isFullRefundByAmounts,
  sumSucceededRefundAmountCents,
} from "@/utils/payment/stripe-refund-amount";

function testSumSucceeded() {
  assert.equal(sumSucceededRefundAmountCents([]), 0);
  assert.equal(
    sumSucceededRefundAmountCents([
      { status: "pending", amount: 500 },
      { status: "succeeded", amount: 1000 },
      { status: "failed", amount: 200 },
    ]),
    1000
  );
  assert.equal(
    sumSucceededRefundAmountCents([
      { status: "succeeded", amount: 300 },
      { status: "succeeded", amount: 200 },
    ]),
    500
  );
}

function testFullRefund() {
  assert.equal(isFullRefundByAmounts(1000, 1000), true);
  assert.equal(isFullRefundByAmounts(999, 1000), false);
  assert.equal(isFullRefundByAmounts(0, 1000), false);
  assert.equal(isFullRefundByAmounts(100, 0), false);
}

function run() {
  testSumSucceeded();
  testFullRefund();
  console.log("stripe-refund-amount tests passed");
}

run();
