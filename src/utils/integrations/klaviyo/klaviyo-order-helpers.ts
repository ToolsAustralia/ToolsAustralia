/**
 * Klaviyo Order ID Helpers
 *
 * Centralized utilities for generating and managing order IDs for Klaviyo events.
 * Ensures consistent order ID format across all purchase types for proper revenue tracking.
 *
 * Order IDs are used to:
 * - Link "Placed Order" and "Refunded Order" events
 * - Enable deduplication in Klaviyo
 * - Track revenue metrics accurately
 *
 * @module utils/integrations/klaviyo/klaviyo-order-helpers
 */

export type PackageType = "subscription" | "one-time" | "mini-draw" | "upsell";

/**
 * Generate a unique order ID for Klaviyo events
 *
 * Order ID format ensures:
 * - Uniqueness across all purchase types
 * - Traceability back to original payment
 * - Consistency for refund linking
 *
 * Format:
 * - Subscriptions: `sub_{paymentIntentId}_{timestamp}`
 * - One-time: `onetime_{packageId}_{timestamp}`
 * - Mini-draw: `minidraw_{packageId}_{timestamp}`
 * - Upsell: `upsell_{packageId}_{timestamp}`
 *
 * @param packageType - Type of package being purchased
 * @param packageId - Package identifier (required for non-subscription types)
 * @param paymentIntentId - Stripe payment intent ID (required for subscriptions)
 * @param timestamp - Optional timestamp (defaults to current time)
 * @returns Unique order ID string
 */
export function generateOrderId(
  packageType: PackageType,
  packageId: string,
  paymentIntentId: string,
  timestamp?: number
): string {
  const ts = timestamp || Date.now();

  switch (packageType) {
    case "subscription":
      // Subscriptions use payment intent ID as primary identifier
      return `sub_${paymentIntentId}_${ts}`;

    case "one-time":
      return `onetime_${packageId}_${ts}`;

    case "mini-draw":
      return `minidraw_${packageId}_${ts}`;

    case "upsell":
      return `upsell_${packageId}_${ts}`;

    default:
      // Fallback format
      return `order_${paymentIntentId}_${ts}`;
  }
}

/**
 * Extract order ID from payment intent ID
 *
 * For subscriptions, we may need to reconstruct the order ID
 * from the payment intent. This helper ensures consistency.
 *
 * @param paymentIntentId - Stripe payment intent ID
 * @param packageType - Type of package
 * @param packageId - Package identifier (for non-subscription types)
 * @param purchaseTimestamp - Original purchase timestamp (if available)
 * @returns Order ID string
 */
export function extractOrderIdFromPaymentIntent(
  paymentIntentId: string,
  packageType: PackageType,
  packageId?: string,
  purchaseTimestamp?: number
): string {
  // For subscriptions, use payment intent directly
  if (packageType === "subscription") {
    return generateOrderId(packageType, "", paymentIntentId, purchaseTimestamp);
  }

  // For other types, require package ID
  if (!packageId) {
    throw new Error(`Package ID required for ${packageType} order ID extraction`);
  }

  return generateOrderId(packageType, packageId, paymentIntentId, purchaseTimestamp);
}

/**
 * Normalize order ID format
 *
 * Ensures order IDs follow consistent format.
 * Useful for validation and comparison.
 *
 * @param orderId - Order ID to normalize
 * @returns Normalized order ID
 */
export function normalizeOrderId(orderId: string): string {
  // Remove any whitespace and convert to lowercase for consistency
  return orderId.trim().toLowerCase();
}

/**
 * Validate order ID format
 *
 * Checks if an order ID follows the expected format.
 *
 * @param orderId - Order ID to validate
 * @returns True if valid, false otherwise
 */
export function isValidOrderId(orderId: string): boolean {
  const normalized = normalizeOrderId(orderId);

  // Check for valid prefixes
  const validPrefixes = ["sub_", "onetime_", "minidraw_", "upsell_", "order_"];

  return validPrefixes.some((prefix) => normalized.startsWith(prefix));
}

/**
 * Parse order ID to extract components
 *
 * Extracts package type and identifier from order ID.
 * Useful for refund processing and order lookup.
 *
 * @param orderId - Order ID to parse
 * @returns Object with package type and identifier, or null if invalid
 */
export function parseOrderId(orderId: string): {
  packageType: PackageType | "unknown";
  identifier: string;
  timestamp: number | null;
} | null {
  const normalized = normalizeOrderId(orderId);

  // Match order ID pattern: prefix_identifier_timestamp
  const match = normalized.match(/^(sub|onetime|minidraw|upsell|order)_(.+?)_(\d+)$/);

  if (!match) {
    return null;
  }

  const [, prefix, identifier, timestampStr] = match;

  // Map prefix to package type
  const packageTypeMap: Record<string, PackageType | "unknown"> = {
    sub: "subscription",
    onetime: "one-time",
    minidraw: "mini-draw",
    upsell: "upsell",
    order: "unknown",
  };

  return {
    packageType: packageTypeMap[prefix] || "unknown",
    identifier,
    timestamp: parseInt(timestampStr, 10) || null,
  };
}
