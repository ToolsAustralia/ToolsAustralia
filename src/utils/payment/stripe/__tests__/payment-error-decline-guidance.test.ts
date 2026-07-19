import assert from "node:assert/strict";
import { formatPaymentError, getCardDeclineGuidance } from "../payment-error-messages";
import { extractPaymentErrorCodes, isStripeCardError, categorizeError } from "../payment-error-detection";

/**
 * Regression tests for the confirm-time card-decline pipeline.
 *
 * Production bug (2026-07): stripe.paymentIntents.create with confirm:true
 * THROWS a StripeCardError on decline (e.g. decline_code "invalid_account" →
 * message "Invalid account."), which fell into the routes' generic catch and
 * came back as a 500 { error: "Failed to create one-time purchase" } — the
 * user saw "Failed to create one-time purchase Please try again." with no
 * hint to use another card. These tests pin: (1) the server-side card-error
 * duck-type, (2) client extraction of code/decline_code from every error
 * shape incl. ApiError (`.data`), (3) concise per-decline-code guidance.
 */

// The ApiError shape from src/lib/queries.ts: an Error whose `.data` carries
// the parsed response body. Reproduces what usePurchaseMembership throws.
function apiError(body: Record<string, unknown>, message = "Payment failed"): Error {
  const err = new Error(message);
  Object.assign(err, { status: 400, data: body });
  return err;
}

function testIsStripeCardError() {
  // Thrown StripeCardError shape (stripe SDK sets type to the class name).
  assert.equal(
    isStripeCardError({ type: "StripeCardError", code: "card_declined", decline_code: "invalid_account" }),
    true,
    "SDK class-name type matches"
  );
  assert.equal(isStripeCardError({ rawType: "card_error", code: "incorrect_cvc" }), true, "rawType card_error matches");
  assert.equal(
    isStripeCardError({ type: "StripeInvalidRequestError", code: "resource_missing" }),
    false,
    "non-card Stripe errors do NOT match (must stay 500)"
  );
  assert.equal(isStripeCardError(new Error("boom")), false, "plain Error does not match");
  assert.equal(isStripeCardError(null), false, "null does not match");
  assert.equal(isStripeCardError("card_error"), false, "string does not match");
}

function testExtractPaymentErrorCodes() {
  // ApiError shape (body on .data) — the live purchase path.
  const fromApiError = extractPaymentErrorCodes(
    apiError({ error: "Payment failed", details: "Invalid account.", code: "card_declined", decline_code: "invalid_account" })
  );
  assert.equal(fromApiError.code, "card_declined", "ApiError.data code extracted");
  assert.equal(fromApiError.declineCode, "invalid_account", "ApiError.data decline_code extracted");

  // axios-style shape (body on .response.data) — legacy defensive path.
  const fromAxios = extractPaymentErrorCodes({
    response: { data: { code: "card_declined", decline_code: "insufficient_funds" } },
  });
  assert.equal(fromAxios.code, "card_declined", "axios code extracted");
  assert.equal(fromAxios.declineCode, "insufficient_funds", "axios decline_code extracted");

  // Raw Stripe error shape (direct props).
  const fromStripe = extractPaymentErrorCodes({ type: "StripeCardError", code: "expired_card", decline_code: undefined });
  assert.equal(fromStripe.code, "expired_card", "direct code extracted");
  assert.equal(fromStripe.declineCode, undefined, "no decline_code → undefined");

  // Plain body object (already-parsed 400 JSON).
  const fromBody = extractPaymentErrorCodes({ error: "Payment failed", code: "card_declined", decline_code: "do_not_honor" });
  assert.equal(fromBody.declineCode, "do_not_honor", "plain body decline_code extracted");

  assert.deepEqual(extractPaymentErrorCodes(new Error("x")), { code: undefined, declineCode: undefined }, "plain Error → empty");
}

function testDeclineGuidanceMap() {
  // Specific, concise guidance per decline code.
  assert.equal(getCardDeclineGuidance("invalid_account")?.title, "Card Declined", "invalid_account title");
  assert.match(
    getCardDeclineGuidance("invalid_account")!.message,
    /closed or invalid account/i,
    "invalid_account names the real reason"
  );
  assert.match(getCardDeclineGuidance("insufficient_funds")!.message, /funds/i, "insufficient_funds mentions funds");
  assert.equal(getCardDeclineGuidance("expired_card")?.title, "Card Expired", "expired_card title");
  assert.equal(getCardDeclineGuidance(undefined, "incorrect_cvc")?.title, "Incorrect CVC", "CVC via error code (no decline_code)");
  assert.equal(getCardDeclineGuidance(undefined, "expired_card")?.title, "Card Expired", "expiry via error code");

  // Sensitive codes must NEVER reveal the reason — generic decline only.
  for (const sensitive of ["lost_card", "stolen_card", "pickup_card", "fraudulent"]) {
    const g = getCardDeclineGuidance(sensitive);
    assert.equal(g?.title, "Card Declined", `${sensitive} → generic title`);
    assert.doesNotMatch(g!.message, /lost|stolen|fraud|pickup/i, `${sensitive} reason must not leak`);
  }

  // Unknown decline code → still a decline → generic guidance.
  assert.equal(getCardDeclineGuidance("some_new_stripe_code")?.title, "Card Declined", "unknown decline code → generic");

  // card_declined code with no decline_code → generic guidance.
  assert.equal(getCardDeclineGuidance(undefined, "card_declined")?.title, "Card Declined", "bare card_declined → generic");

  // Non-card codes fall through so callers keep their normal handling.
  assert.equal(getCardDeclineGuidance(undefined, "invoice_payment_intent_requires_action"), null, "non-card code → null");
  assert.equal(getCardDeclineGuidance(undefined, undefined), null, "no codes → null");

  // Every message stays short and readable (the whole point of the guide).
  for (const code of ["invalid_account", "insufficient_funds", "expired_card", "incorrect_cvc", "processing_error"]) {
    const g = getCardDeclineGuidance(code)!;
    assert.ok(g.message.length <= 120, `${code} message ≤ 120 chars (got ${g.message.length})`);
  }
}

function testFormatPaymentErrorEndToEnd() {
  // THE BUG SHAPE, post-fix: 400 body carried on ApiError.data.
  const declined = formatPaymentError(
    apiError({ success: false, error: "Payment failed", details: "Invalid account.", code: "card_declined", decline_code: "invalid_account" })
  );
  assert.equal(declined.title, "Card Declined", "invalid_account → Card Declined title");
  assert.match(declined.message, /closed or invalid account/i, "user sees the actual reason");
  assert.match(declined.message, /different card|contact your bank/i, "user gets a next step");
  assert.equal(declined.shouldIncludeTryAgain, false, "no blind 'try again' for a permanent decline");

  // Excessive-retry block takes priority over the decline reason.
  const blocked = formatPaymentError(
    apiError({ error: "Payment failed", decline_code: "generic_decline", requiresDifferentPaymentMethod: true, failureReason: "stripe_excessive_retry" })
  );
  assert.equal(blocked.title, "Card Temporarily Blocked", "excessive retry outranks decline guidance");

  // categorizeError also honours the ApiError.data flags.
  assert.equal(
    categorizeError(apiError({ requiresDifferentPaymentMethod: true })).errorType,
    "stripe_excessive_retry",
    "requiresDifferentPaymentMethod probed on .data"
  );

  // No decline info at all (e.g. a genuine 500) → unchanged generic path.
  const generic = formatPaymentError(new Error("Failed to create one-time purchase"));
  assert.equal(generic.title, "Payment Error", "non-decline keeps generic title");
  assert.match(generic.message, /try again/i, "non-decline keeps try-again guidance");

  // Raw thrown Stripe error on the client (Stripe.js style shapes) still maps.
  const rawStripe = formatPaymentError({ type: "StripeCardError", code: "card_declined", decline_code: "insufficient_funds", message: "Your card has insufficient funds." });
  assert.equal(rawStripe.title, "Card Declined", "raw stripe error → decline guidance");
  assert.match(rawStripe.message, /funds/i, "raw stripe error → specific reason");

  // The useStripeSubscription-manufactured shape (monthly membership flow):
  // Error + .code + legacy .response.data (error/code only) + full body on .data.
  // The .data body must win so decline_code isn't lost to the legacy shape.
  const hookError = new Error("Payment failed") as Error & { code?: string; response?: unknown; data?: unknown };
  hookError.code = "card_declined";
  hookError.response = { data: { error: "Payment failed", code: "card_declined" } };
  hookError.data = { success: false, error: "Payment failed", details: "Your card has insufficient funds.", code: "card_declined", decline_code: "insufficient_funds" };
  const hookFormatted = formatPaymentError(hookError);
  assert.equal(hookFormatted.title, "Card Declined", "hook-manufactured error → decline guidance");
  assert.match(hookFormatted.message, /funds/i, "hook-manufactured error → specific reason from .data, not generic from .response");
}

function run() {
  testIsStripeCardError();
  testExtractPaymentErrorCodes();
  testDeclineGuidanceMap();
  testFormatPaymentErrorEndToEnd();
  console.log("payment-error-decline-guidance tests passed");
}

run();
