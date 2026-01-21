/**
 * SetupIntent Recovery Utility
 * 
 * Centralized logic for SetupIntent recovery.
 * Creates new SetupIntent when existing one has already succeeded.
 */

export interface SetupIntentRecoveryResult {
  success: boolean;
  clientSecret: string | null;
  setupIntentId: string | null;
  error?: string;
}

/**
 * Recover SetupIntent by creating a new one
 * Clears old SetupIntent and creates a fresh one for seamless retry
 */
export async function recoverSetupIntent(): Promise<SetupIntentRecoveryResult> {
  try {
    // Create new SetupIntent via API
    const response = await fetch("/api/stripe/create-setup-intent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
    });

    const result = await response.json();

    if (!response.ok) {
      return {
        success: false,
        clientSecret: null,
        setupIntentId: null,
        error: result.error || "Failed to create setup intent",
      };
    }

    if (!result.success || !result.client_secret) {
      return {
        success: false,
        clientSecret: null,
        setupIntentId: null,
        error: result.error || "Invalid setup intent response",
      };
    }

    return {
      success: true,
      clientSecret: result.client_secret,
      setupIntentId: result.setup_intent_id || null,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("SetupIntent recovery failed:", errorMessage);
    
    return {
      success: false,
      clientSecret: null,
      setupIntentId: null,
      error: errorMessage,
    };
  }
}
