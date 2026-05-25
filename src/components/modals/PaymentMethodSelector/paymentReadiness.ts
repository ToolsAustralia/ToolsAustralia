/**
 * Stripe REQUIRES the PaymentElement's `ready` event before elements.submit() /
 * confirmPayment(). Submitting earlier makes Stripe throw "We could not retrieve
 * data from the specified Element…". This guard gates both the Purchase button
 * (isFormValid) and the imperative confirmStripeIntent(). See docs/shared-ui/gotchas.md.
 */
export interface PaymentReadinessInput {
  stripe: unknown | null;
  elements: unknown | null;
  isElementReady: boolean;
}

export function paymentNotReadyReason({ stripe, elements, isElementReady }: PaymentReadinessInput): string | null {
  if (!stripe || !elements) return "Stripe not loaded";
  if (!isElementReady) return "Payment form is still loading. Please wait a moment and try again.";
  return null;
}
