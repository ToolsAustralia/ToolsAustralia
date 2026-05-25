import assert from "node:assert/strict";
import { canSubmitPayment, paymentNotReadyReason } from "../paymentReadiness";

let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}`); console.error(e instanceof Error ? e.message : String(e)); }
}

const stripe = {}; const elements = {};

test("not submittable when stripe missing → 'Stripe not loaded'", () => {
  assert.equal(canSubmitPayment({ stripe: null, elements, isElementReady: true }), false);
  assert.equal(paymentNotReadyReason({ stripe: null, elements, isElementReady: true }), "Stripe not loaded");
});

test("not submittable when element not ready → loading message (NOT the Stripe submit error)", () => {
  assert.equal(canSubmitPayment({ stripe, elements, isElementReady: false }), false);
  assert.equal(
    paymentNotReadyReason({ stripe, elements, isElementReady: false }),
    "Payment form is still loading. Please wait a moment and try again."
  );
});

test("submittable only when stripe + elements + ready", () => {
  assert.equal(canSubmitPayment({ stripe, elements, isElementReady: true }), true);
  assert.equal(paymentNotReadyReason({ stripe, elements, isElementReady: true }), null);
});

console.log(failed === 0 ? "\nAll paymentReadiness tests passed" : `\n${failed} test(s) failed`);
process.exit(failed === 0 ? 0 : 1);
