/**
 * PaymentIntent Recovery Utility
 * 
 * Centralized logic for PaymentIntent recovery (for one-time purchases).
 * Creates new PaymentIntent when existing one has already succeeded or was canceled.
 */

export interface PaymentIntentRecoveryResult {
  success: boolean;
  clientSecret: string | null;
  paymentIntentId: string | null;
  error?: string;
}

/**
 * Recover PaymentIntent by creating a new one
 * Note: This requires the original payment details (amount, currency, etc.)
 * The calling component should provide these details
 */
export interface PaymentIntentRecoveryOptions {
  amount: number; // Amount in cents
  currency?: string; // Default: "aud"
  metadata?: Record<string, string>;
  paymentMethodId?: string;
}

/**
 * Recover PaymentIntent by creating a new one
 * This is typically called when a PaymentIntent has already succeeded or was canceled
 */
export async function recoverPaymentIntent(
  options: PaymentIntentRecoveryOptions
): Promise<PaymentIntentRecoveryResult> {
  try {
    // Create new PaymentIntent via API
    const response = await fetch("/api/stripe/create-payment-intent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        amount: options.amount,
        currency: options.currency || "aud",
        metadata: options.metadata || {},
        paymentMethodId: options.paymentMethodId,
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      return {
        success: false,
        clientSecret: null,
        paymentIntentId: null,
        error: result.error || "Failed to create payment intent",
      };
    }

    if (!result.success || !result.client_secret) {
      return {
        success: false,
        clientSecret: null,
        paymentIntentId: null,
        error: result.error || "Invalid payment intent response",
      };
    }

    return {
      success: true,
      clientSecret: result.client_secret,
      paymentIntentId: result.payment_intent_id || null,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("PaymentIntent recovery failed:", errorMessage);
    
    return {
      success: false,
      clientSecret: null,
      paymentIntentId: null,
      error: errorMessage,
    };
  }
}
