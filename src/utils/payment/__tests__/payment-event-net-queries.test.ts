import assert from "node:assert/strict";
import { PAYMENTEVENTS_COLLECTION } from "@/utils/payment/payment-event-net-queries";

/**
 * Option B net revenue (same rule as Mongo $lookup): exclude BenefitsGranted
 * when paymentIntentId has a RefundProcessed. Pure mirror for unit testing.
 */
function netRevenueOptionB(
  benefits: Array<{ paymentIntentId: string; price: number }>,
  refundedPaymentIntentIds: Set<string>
): number {
  return benefits
    .filter((b) => !refundedPaymentIntentIds.has(b.paymentIntentId))
    .reduce((sum, b) => sum + b.price, 0);
}

function testNetRevenueOptionB() {
  const rows = [
    { paymentIntentId: "pi_a", price: 50 },
    { paymentIntentId: "pi_b", price: 30 },
  ];
  assert.equal(netRevenueOptionB(rows, new Set()), 80);
  assert.equal(netRevenueOptionB(rows, new Set(["pi_a"])), 30);
  assert.equal(netRevenueOptionB(rows, new Set(["pi_a", "pi_b"])), 0);
}

function testCollectionName() {
  assert.equal(PAYMENTEVENTS_COLLECTION, "paymentevents");
}

function run() {
  testNetRevenueOptionB();
  testCollectionName();
  console.log("payment-event-net-queries tests passed");
}

run();
