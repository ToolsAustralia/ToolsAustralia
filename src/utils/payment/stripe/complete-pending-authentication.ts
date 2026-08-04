import { getStripePromise } from "@/lib/stripe-client";
import { autoLogPaymentError } from "@/utils/error-reporting/auto-log-error";

/**
 * The `paymentIntent` shape the purchase routes return alongside `success: true`.
 * Only the fields this helper needs — callers pass their own response object through.
 */
export interface PendingAuthenticationIntent {
  id?: string;
  status?: string;
  clientSecret?: string | null;
}

/** Context for the ErrorReport, so a failed authentication is attributable in admin. */
export interface PendingAuthenticationContext {
  packageId?: string;
  packageName?: string;
  amount?: number;
  userEmail?: string;
}

/**
 * Finish a purchase whose PaymentIntent still needs the cardholder's bank authentication
 * ("3-D Secure"), and throw if it does not end up paid.
 *
 * WHY THIS EXISTS
 * `/api/stripe/create-one-time-purchase-existing-user` answers `success: true` with
 * `paymentIntent.status: "requires_action"` and a client secret, on the documented assumption
 * that "frontend will handle 3DS redirect via client_secret". No caller ever did. So a buyer
 * whose bank asked for authentication was shown the full success celebration — "Purchase
 * Complete! Your payment was successful" — while Stripe held the charge as **Incomplete**:
 * no money taken, no webhook, no entries granted. Reproduced with test card 4000 0025 0000 3155.
 *
 * WHAT IT DOES
 * `stripe.handleNextAction` presents the issuer's challenge and resolves once the customer
 * finishes or abandons it. A `succeeded` intent means the charge went through and the webhook
 * will grant benefits exactly as on the no-authentication path. `processing` is also accepted:
 * some payment methods settle asynchronously and the webhook still completes them.
 *
 * Anything else — an error, an abandoned challenge, a still-`requires_action` intent — THROWS,
 * so the caller's existing error handling runs: the optimistic state rolls back and the buyer is
 * told the truth instead of being congratulated.
 *
 * Safe to call unconditionally: a payment that needed no authentication returns immediately.
 */
export async function completePendingAuthentication(
  paymentIntent: PendingAuthenticationIntent | null | undefined,
  context: PendingAuthenticationContext = {}
): Promise<void> {
  if (!paymentIntent) return;
  if (paymentIntent.status !== "requires_action") return;

  /**
   * Report before throwing, so this stops being invisible.
   *
   * Nothing logged a 3-D Secure failure anywhere: the buyer got a success screen, Stripe held
   * the charge as Incomplete, and no ErrorReport was written — the only trace was in the Stripe
   * dashboard, which nobody watches per-customer. An abandoned challenge is genuinely user-side
   * and the existing severity classifier will rank it as such; a `no_client_secret` or
   * `stripe_unavailable` is OUR failure and should stand out. Both are worth seeing: a run of
   * abandonments means the challenge itself is confusing or broken on some device.
   *
   * Deliberately never throws — a reporting failure must not replace the real payment error.
   */
  const report = (errorCode: string, message: string) =>
    autoLogPaymentError(new Error(message), {
      paymentIntentId: paymentIntent.id,
      packageId: context.packageId,
      packageName: context.packageName,
      amount: context.amount,
      userEmail: context.userEmail,
      errorCode,
      errorMessage: message,
    }).catch(() => {
      /* reporting is best-effort; never mask the payment error */
    });

  const clientSecret = paymentIntent.clientSecret;
  if (!clientSecret) {
    // The server said authentication is required but gave us nothing to authenticate with.
    // Failing loudly beats showing a success screen for a charge that cannot complete.
    const message =
      "This payment needs your bank's approval, but we couldn't start that step. No charge was made — please try again.";
    await report("3ds_no_client_secret", message);
    throw new Error(message);
  }

  const stripe = await getStripePromise();
  if (!stripe) {
    const message =
      "This payment needs your bank's approval, but the payment form didn't load. No charge was made — please try again.";
    await report("3ds_stripe_unavailable", message);
    throw new Error(message);
  }

  const { error, paymentIntent: confirmed } = await stripe.handleNextAction({ clientSecret });

  if (error) {
    // Stripe's message is customer-appropriate (e.g. "We are unable to authenticate your
    // payment method"), so surface it rather than a generic string.
    const message = error.message || "Your bank did not approve this payment. No charge was made.";
    await report(error.code || "3ds_failed", message);
    throw new Error(message);
  }

  const finalStatus = confirmed?.status;
  if (finalStatus === "succeeded" || finalStatus === "processing") return;

  // Challenge closed/abandoned, or the intent came back still unauthenticated.
  const message =
    "Your bank didn't approve this payment, so it wasn't completed. No charge was made — please try again or use a different card.";
  await report(`3ds_not_completed_${finalStatus ?? "unknown"}`, message);
  throw new Error(message);
}
