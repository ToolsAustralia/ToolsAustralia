/**
 * SetupIntent Utility Functions
 * 
 * Utilities for checking SetupIntent status and extracting payment method information.
 * Used to handle retry scenarios where SetupIntent may already be succeeded.
 */

import type Stripe from "stripe";

export interface SetupIntentStatusResult {
  status: Stripe.SetupIntent.Status;
  paymentMethodId: string | null;
  setupIntent: Stripe.SetupIntent | null;
  error?: string;
  hasLastSetupError?: boolean; // NEW: Flag indicating if SetupIntent has last_setup_error
  lastSetupError?: {            // NEW: Last error details for recovery decision
    code?: string;
    message?: string;
    decline_code?: string;
  };
}

/**
 * Extract SetupIntent ID from client secret
 * 
 * @param clientSecret - SetupIntent client secret (e.g., "seti_xxx_secret_yyy")
 * @returns SetupIntent ID or null if invalid format
 */
export function extractSetupIntentId(clientSecret: string): string | null {
  try {
    // SetupIntent client secret format: "seti_xxx_secret_yyy"
    const parts = clientSecret.split("_secret_");
    if (parts.length === 2 && parts[0].startsWith("seti_")) {
      return parts[0];
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Check SetupIntent status and extract payment method if succeeded
 * 
 * This function is used to handle retry scenarios where a SetupIntent
 * may have already succeeded in a previous attempt.
 * 
 * @param stripe - Stripe instance
 * @param clientSecret - SetupIntent client secret
 * @returns SetupIntent status and payment method ID if succeeded
 */
export async function checkSetupIntentStatus(
  stripe: Stripe | null,
  clientSecret: string
): Promise<SetupIntentStatusResult> {
  if (!stripe) {
    return {
      status: "requires_payment_method" as Stripe.SetupIntent.Status,
      paymentMethodId: null,
      setupIntent: null,
      error: "Stripe not loaded",
    };
  }

  try {
    const setupIntentId = extractSetupIntentId(clientSecret);
    if (!setupIntentId) {
      return {
        status: "requires_payment_method" as Stripe.SetupIntent.Status,
        paymentMethodId: null,
        setupIntent: null,
        error: "Invalid SetupIntent client secret format",
      };
    }

    const setupIntent = await stripe.setupIntents.retrieve(setupIntentId);

    // ✅ NEW: Detect last_setup_error for recovery decision
    const hasLastSetupError = !!setupIntent.last_setup_error;
    const lastSetupError = setupIntent.last_setup_error ? {
      code: setupIntent.last_setup_error.code,
      message: setupIntent.last_setup_error.message,
      decline_code: (setupIntent.last_setup_error as { decline_code?: string }).decline_code,
    } : undefined;

    // Extract payment method ID with proper type narrowing
    let paymentMethodId: string | null = null;
    if (setupIntent.payment_method) {
      if (typeof setupIntent.payment_method === "string") {
        paymentMethodId = setupIntent.payment_method;
      } else {
        // TypeScript now knows it's a PaymentMethod object
        paymentMethodId = setupIntent.payment_method.id;
      }
    }

    return {
      status: setupIntent.status,
      paymentMethodId,
      setupIntent,
      hasLastSetupError,  // ✅ NEW
      lastSetupError,     // ✅ NEW
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error checking SetupIntent status:", errorMessage);

    return {
      status: "requires_payment_method" as Stripe.SetupIntent.Status,
      paymentMethodId: null,
      setupIntent: null,
      error: errorMessage,
    };
  }
}
