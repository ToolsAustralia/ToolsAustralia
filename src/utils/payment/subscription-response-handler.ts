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
    const subscription = responseObj.subscription as {
      id: string;
      status?: string;
      clientSecret?: string | { client_secret?: string };
      invoicePaymentIntentClientSecret?: string | { client_secret?: string };
    };
    subscriptionId = subscription.id;
    status = subscription.status || "unknown";
    const rawSubSecret = subscription.invoicePaymentIntentClientSecret ?? subscription.clientSecret;
    if (typeof rawSubSecret === "string") {
      clientSecret = rawSubSecret;
    } else if (rawSubSecret && typeof rawSubSecret === "object" && typeof rawSubSecret.client_secret === "string") {
      clientSecret = rawSubSecret.client_secret;
    }

    // Also check data.subscription for nested format
    if (responseObj.data && typeof responseObj.data === "object") {
      const data = responseObj.data as Record<string, unknown>;
      if (data.subscription && typeof data.subscription === "object") {
        const nestedSubscription = data.subscription as { id?: string; clientSecret?: string | { client_secret?: string } };
        if (nestedSubscription.id) {
          subscriptionId = nestedSubscription.id;
        }
        const nestedSecret = nestedSubscription.clientSecret;
        if (typeof nestedSecret === "string") {
          clientSecret = nestedSecret;
        } else if (nestedSecret && typeof nestedSecret === "object" && typeof nestedSecret.client_secret === "string") {
          clientSecret = nestedSecret.client_secret;
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
      const subscription = data.subscription as { id?: string; status?: string; clientSecret?: string | { client_secret?: string } };
      if (subscription.id) {
        subscriptionId = subscription.id;
      }
      if (subscription.status) {
        status = subscription.status;
      }
      const subSecret = subscription.clientSecret;
      if (typeof subSecret === "string") {
        clientSecret = subSecret;
      } else if (subSecret && typeof subSecret === "object" && typeof subSecret.client_secret === "string") {
        clientSecret = subSecret.client_secret;
      }
    }

    // Check for invoicePaymentIntentClientSecret (Option A) or clientSecret (string or { client_secret, type })
    const rawInvoiceSecret = data.invoicePaymentIntentClientSecret;
    const rawClientSecret = data.clientSecret;
    if (typeof rawInvoiceSecret === "string") {
      clientSecret = rawInvoiceSecret;
    } else if (rawInvoiceSecret && typeof rawInvoiceSecret === "object" && typeof (rawInvoiceSecret as { client_secret?: string }).client_secret === "string") {
      clientSecret = (rawInvoiceSecret as { client_secret: string }).client_secret;
    }
    if (!clientSecret && typeof rawClientSecret === "string") {
      clientSecret = rawClientSecret;
    } else if (!clientSecret && rawClientSecret && typeof rawClientSecret === "object" && typeof (rawClientSecret as { client_secret?: string }).client_secret === "string") {
      clientSecret = (rawClientSecret as { client_secret: string }).client_secret;
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

  return {
    subscriptionId,
    clientSecret,
    status: finalStatus,
    customerId,
    userId,
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
