import assert from "node:assert";
import {
  isExpectedPaymentDecline,
  classifyErrorSeverity,
} from "../error-severity-classifier";

// --- isExpectedPaymentDecline ---

// A non-empty Stripe decline_code only ever exists on an issuer decline.
assert.equal(isExpectedPaymentDecline({ declineCode: "insufficient_funds" }), true);
assert.equal(isExpectedPaymentDecline({ declineCode: "generic_decline" }), true);
assert.equal(isExpectedPaymentDecline({ declineCode: "   " }), false, "whitespace-only decline code is not a decline");

// Known card-error codes → decline.
for (const code of [
  "card_declined",
  "insufficient_funds",
  "expired_card",
  "incorrect_cvc",
  "processing_error",
  "generic_decline",
]) {
  assert.equal(isExpectedPaymentDecline({ errorCode: code }), true, `${code} should be a decline`);
}
// Case-insensitive.
assert.equal(isExpectedPaymentDecline({ errorCode: "CARD_DECLINED" }), true);

// Message-phrasing fallback (when no structured code is present).
assert.equal(
  isExpectedPaymentDecline({ message: "Your card has insufficient funds. Try a different card." }),
  true
);
assert.equal(isExpectedPaymentDecline({ message: "Your card was declined" }), true);

// Genuine payment-system failures are NOT declines.
assert.equal(isExpectedPaymentDecline({ message: "Stripe Elements failed to load" }), false);
assert.equal(isExpectedPaymentDecline({ errorCode: "api_connection_error", message: "Network error" }), false);
assert.equal(isExpectedPaymentDecline({}), false);

// --- classifyErrorSeverity: payment category split ---

// Expected declines → medium (no longer critical).
assert.equal(
  classifyErrorSeverity(new Error("Your card has insufficient funds. Try a different card."), "payment").severity,
  "medium"
);
assert.equal(
  classifyErrorSeverity({ code: "card_declined", message: "Payment failed" }, "payment").severity,
  "medium"
);

// Genuine payment-system failures → still critical.
assert.equal(
  classifyErrorSeverity(new Error("Stripe Elements failed to load"), "payment").severity,
  "critical"
);
assert.equal(
  classifyErrorSeverity(new Error("Unexpected payment processing failure"), "payment").severity,
  "critical"
);

// Non-payment categories are unaffected by the change.
assert.equal(classifyErrorSeverity(new Error("Server error"), "api").severity, "high");
assert.equal(classifyErrorSeverity(new Error("Connection lost"), "network").severity, "medium");

console.log("✅ payment-decline-severity: all assertions passed");
