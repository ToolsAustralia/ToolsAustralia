import assert from "node:assert/strict";
import { paymentNotReadyReason } from "../paymentReadiness";

let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}`); console.error(e instanceof Error ? e.message : String(e)); }
}

const stripe = {}; const elements = {};

test("stripe/elements missing → 'Stripe not loaded'", () => {
  assert.equal(paymentNotReadyReason({ stripe: null, elements, isElementReady: true }), "Stripe not loaded");
});

test("element not ready → loading message (NOT the raw Stripe submit error)", () => {
  assert.equal(
    paymentNotReadyReason({ stripe, elements, isElementReady: false }),
    "Payment form is still loading. Please wait a moment and try again."
  );
});

test("all present → null (submittable)", () => {
  assert.equal(paymentNotReadyReason({ stripe, elements, isElementReady: true }), null);
});

console.log(failed === 0 ? "\nAll paymentReadiness tests passed" : `\n${failed} test(s) failed`);
process.exit(failed === 0 ? 0 : 1);
