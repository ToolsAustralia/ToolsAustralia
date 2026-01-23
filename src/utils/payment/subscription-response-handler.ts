/**
 * Subscription Response Handler
 *
 * Pure functions for extracting and validating subscription response data.
 * Follows single responsibility principle - only handles data transformation.
 *
 * Best Practices:
 * - Pure functions (no side effects)
 * - Explicit return types
 * - Comprehensive error handling
 * - JSDoc documentation
 *
 * @module subscription-response-handler
 */

/**
 * Extracted subscription data from API response
 */
export interface SubscriptionResponseData {
  subscriptionId: string;
  clientSecret: string | null;
  status: string;
  customerId?: string;
  userId?: string;
  warning?: string; // Optional warning message when PaymentIntent is not immediately available
}

/**
 * Extracts subscription data from API response
 *
 * Handles multiple response formats for backward compatibility:
 * - New format: result.data.subscriptionId, result.data.clientSecret
 * - Existing user format: result.subscription.id, result.subscription.clientSecret
 * - Nested format: result.data.subscription.id, result.data.subscription.clientSecret
 *
 * @param response - Raw API response (unknown type for safety)
 * @returns Extracted subscription data or null if extraction fails
 *
 * @example
 * ```typescript
 * const result = await createSubscriptionExistingUser({...});
 * const subscriptionData = extractSubscriptionData(result);
 * if (subscriptionData) {
 *   // Use subscriptionData.subscriptionId and subscriptionData.clientSecret
 * }
 * ```
 */
export function extractSubscriptionData(response: unknown): SubscriptionResponseData | null {
  if (!response || typeof response !== "object") {
    console.error("❌ Invalid response type - expected object");
    return null;
  }

  const responseObj = response as Record<string, unknown>;

  // Check if response has success flag
  if (responseObj.success === false) {
    console.error("❌ API returned unsuccessful response");
    return null;
  }

  let subscriptionId: string | null = null;
  let clientSecret: string | null = null;
  let status: string | null = null;
  let customerId: string | undefined;
  let userId: string | undefined;

  // Format 1: Existing user format - result.subscription.id
  if (
    responseObj.subscription &&
    typeof responseObj.subscription === "object" &&
    "id" in responseObj.subscription
  ) {
    const subscription = responseObj.subscription as { id: string; status?: string; clientSecret?: string };
    subscriptionId = subscription.id;
    status = subscription.status || "unknown";
    clientSecret = subscription.clientSecret || null;

    // Also check data.subscription for nested format
    if (responseObj.data && typeof responseObj.data === "object") {
      const data = responseObj.data as Record<string, unknown>;
      if (data.subscription && typeof data.subscription === "object") {
        const nestedSubscription = data.subscription as { id?: string; clientSecret?: string };
        if (nestedSubscription.id) {
          subscriptionId = nestedSubscription.id;
        }
        if (nestedSubscription.clientSecret) {
          clientSecret = nestedSubscription.clientSecret;
        }
      }
    }
  }

  // Format 2: New user format - result.data.subscriptionId or result.data.subscription.id
  if (responseObj.data && typeof responseObj.data === "object") {
    const data = responseObj.data as Record<string, unknown>;

    // Check for subscriptionId directly
    if (typeof data.subscriptionId === "string") {
      subscriptionId = data.subscriptionId;
    }

    // Check for nested subscription object
    if (data.subscription && typeof data.subscription === "object") {
      const subscription = data.subscription as { id?: string; status?: string; clientSecret?: string };
      if (subscription.id) {
        subscriptionId = subscription.id;
      }
      if (subscription.status) {
        status = subscription.status;
      }
      if (subscription.clientSecret) {
        clientSecret = subscription.clientSecret;
      }
    }

    // Check for clientSecret directly in data
    if (typeof data.clientSecret === "string") {
      clientSecret = data.clientSecret;
    }

    // Check for status directly in data
    if (typeof data.status === "string") {
      status = data.status;
    }

    // Extract additional fields
    if (typeof data.customerId === "string") {
      customerId = data.customerId;
    }
    if (typeof data.userId === "string") {
      userId = data.userId;
    }
  }

  // Validate that we have at least subscriptionId
  if (!subscriptionId) {
    console.error("❌ Could not extract subscriptionId from response:", responseObj);
    return null;
  }

  // Status is optional but should have a default
  const finalStatus = status || "unknown";

  // Extract warning if present
  let warning: string | undefined;
  if (responseObj.data && typeof responseObj.data === "object") {
    const data = responseObj.data as Record<string, unknown>;
    if (typeof data.warning === "string") {
      warning = data.warning;
    }
  }

  return {
    subscriptionId,
    clientSecret,
    status: finalStatus,
    customerId,
    userId,
    warning,
  };
}

/**
 * Validates subscription response has required fields
 *
 * @param data - Subscription response data to validate
 * @returns True if data is valid, false otherwise
 *
 * @example
 * ```typescript
 * const data = extractSubscriptionData(response);
 * if (data && validateSubscriptionResponse(data)) {
 *   // Data is valid and ready to use
 * }
 * ```
 */
export function validateSubscriptionResponse(data: SubscriptionResponseData): boolean {
  if (!data) {
    return false;
  }

  if (!data.subscriptionId || typeof data.subscriptionId !== "string") {
    console.error("❌ Invalid subscriptionId:", data.subscriptionId);
    return false;
  }

  if (!data.status || typeof data.status !== "string") {
    console.error("❌ Invalid status:", data.status);
    return false;
  }

  // clientSecret can be null initially (PaymentIntent might not be ready yet)
  // But if it exists, it should be a string
  if (data.clientSecret !== null && typeof data.clientSecret !== "string") {
    console.error("❌ Invalid clientSecret type:", typeof data.clientSecret);
    return false;
  }

  return true;
}

/**
 * Checks if subscription response indicates PaymentIntent is ready
 *
 * @param data - Subscription response data
 * @returns True if PaymentIntent client_secret is available
 */
export function isPaymentIntentReady(data: SubscriptionResponseData): boolean {
  return data.clientSecret !== null && data.clientSecret !== undefined && data.clientSecret !== "pending";
}
