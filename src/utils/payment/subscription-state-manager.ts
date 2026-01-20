/**
 * Subscription State Manager
 *
 * Utilities for managing subscription-related state updates.
 * Separates state update logic from component code.
 *
 * Best Practices:
 * - Pure functions (no side effects)
 * - Explicit return types
 * - Clear naming
 * - Single responsibility
 *
 * @module subscription-state-manager
 */

import { SubscriptionResponseData } from "./subscription-response-handler";

/**
 * State update object for subscription-related React state
 */
export interface SubscriptionStateUpdate {
  clientSecret: string | null;
  subscriptionId: string | null;
  status: string;
}

/**
 * Creates state update object from subscription response data
 *
 * This function transforms API response data into a format suitable
 * for React state updates. It handles null/undefined values gracefully.
 *
 * @param responseData - Extracted subscription response data
 * @returns State update object ready for React setState calls
 *
 * @example
 * ```typescript
 * const subscriptionData = extractSubscriptionData(response);
 * if (subscriptionData) {
 *   const stateUpdate = createSubscriptionStateUpdate(subscriptionData);
 *   setPaymentIntentClientSecret(stateUpdate.clientSecret);
 *   setSubscriptionId(stateUpdate.subscriptionId);
 * }
 * ```
 */
export function createSubscriptionStateUpdate(
  responseData: SubscriptionResponseData
): SubscriptionStateUpdate {
  return {
    clientSecret: responseData.clientSecret || null,
    subscriptionId: responseData.subscriptionId || null,
    status: responseData.status || "unknown",
  };
}

/**
 * Checks if state update has all required fields for payment confirmation
 *
 * @param stateUpdate - State update object to validate
 * @returns True if state update is ready for payment confirmation
 */
export function isStateUpdateReadyForPayment(stateUpdate: SubscriptionStateUpdate): boolean {
  return (
    stateUpdate.subscriptionId !== null &&
    stateUpdate.clientSecret !== null &&
    stateUpdate.clientSecret !== "pending"
  );
}
