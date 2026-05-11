/**
 * Detects Stripe.js client-side noise errors that should NOT be auto-logged
 * to ErrorReport. These are user-input issues, not system bugs.
 *
 * Covers:
 * - Incomplete card field errors emitted by Stripe Elements pre-validation
 *   (incomplete_number, incomplete_cvc, incomplete_expiry, incomplete_zip)
 * - Generic validation_error type with no actionable failure
 * - Apple Pay / Google Pay sheet cancellation / payment_exception
 *   (user opened the wallet and dismissed without paying)
 *
 * Why: these surface from `stripe.confirmPayment` / `confirmSetup` /
 * `elements.submit` without an account ever being touched. They flood the
 * admin error reports page with "Anonymous" rows that have no diagnostic
 * value and crowd out real failures (declines, API errors, render crashes).
 */

type MaybeStripeError = {
  type?: string;
  code?: string;
  message?: string;
};

const INCOMPLETE_OR_INVALID_CODES = new Set([
  "incomplete_number",
  "incomplete_cvc",
  "incomplete_expiry",
  "incomplete_zip",
  "invalid_number",
  "invalid_cvc",
  "invalid_expiry_year",
  "invalid_expiry_year_past",
  "invalid_expiry_month",
  "invalid_expiry_month_past",
]);

// Stripe.js client-side validation surface area. These are emitted by
// `elements.submit()` / `confirmPayment` / `confirmSetup` before any
// server call. Match them by message because by the time errors reach
// the parent error handler they have been narrowed to strings.
const NOISE_MESSAGE_FRAGMENTS = [
  "your card number is incomplete",
  "your card number is invalid",
  "your card's security code is incomplete",
  "your card's security code is invalid",
  "your card's expiration date is incomplete",
  "your card's expiration date is invalid",
  "your card's expiration year is invalid",
  "your card's expiration year is in the past",
  "your card's expiration month is invalid",
  "your card's expiration month is in the past",
  "your postal code is incomplete",
  "your postal code is invalid",
  "please fill in your card details",
  "please complete all required fields",
];

const WALLET_FRAGMENTS = [
  "google pay",
  "apple pay",
  "payment_exception",
  "wallet",
  "unable to show",
];

export function isStripeNoiseError(error: unknown): boolean {
  if (!error) return false;

  let code = "";
  let type = "";
  let message = "";

  if (typeof error === "string") {
    message = error.toLowerCase();
  } else if (typeof error === "object") {
    const err = error as MaybeStripeError;
    code = (err.code || "").toLowerCase();
    type = (err.type || "").toLowerCase();
    message = (err.message || "").toLowerCase();
  } else {
    return false;
  }

  if (code && INCOMPLETE_OR_INVALID_CODES.has(code)) return true;

  if (message && NOISE_MESSAGE_FRAGMENTS.some((fragment) => message.includes(fragment))) {
    return true;
  }

  if (
    code === "google_pay.payment_exception" ||
    code === "apple_pay.payment_exception" ||
    type.includes("google_pay") ||
    type.includes("apple_pay")
  ) {
    return true;
  }

  if (
    type === "validation_error" &&
    WALLET_FRAGMENTS.some((fragment) => message.includes(fragment))
  ) {
    return true;
  }

  return false;
}
