/**
 * Payment State Preservation Utility
 * 
 * Centralized logic for preserving form state on errors.
 * Ensures seamless retry without modal reset.
 */

export interface PaymentState {
  setupIntentClientSecret: string | null;
  paymentIntentClientSecret: string | null;
  paymentMethodId: string | null;
  formData: Record<string, unknown>;
}

export interface StatePreservationStrategy {
  shouldPreserveSetupIntent: boolean;
  shouldPreservePaymentIntent: boolean;
  shouldPreservePaymentMethod: boolean;
  shouldPreserveFormData: boolean;
}

/**
 * Determine state preservation strategy for an error
 * State should ALWAYS be preserved unless recovery explicitly requires clearing
 */
export function preservePaymentState(
  error: unknown,
  currentState: Partial<PaymentState>
): StatePreservationStrategy {
  // Always preserve state by default
  // Only clear if recovery explicitly requires it (handled by recovery utilities)
  
  return {
    shouldPreserveSetupIntent: true, // Preserve SetupIntent - recovery will create new one if needed
    shouldPreservePaymentIntent: true, // Preserve PaymentIntent - recovery will create new one if needed
    shouldPreservePaymentMethod: true, // Always preserve payment method - user might want to retry with same method
    shouldPreserveFormData: true, // Always preserve form data - user shouldn't have to re-enter
  };
}

/**
 * Get state preservation instructions
 * This is used to guide components on what state to preserve
 */
export function getStatePreservationInstructions(
  error: unknown
): StatePreservationStrategy {
  return preservePaymentState(error, {});
}
