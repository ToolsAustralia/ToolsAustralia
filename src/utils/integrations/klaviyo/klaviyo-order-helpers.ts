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

export type PackageType = "membership" | "one-time" | "mini-draw" | "upsell";

/**
 * Generate a deterministic order ID for Klaviyo events.
 *
 * **Critical:** Klaviyo links `Refunded Order` to `Placed Order` only when the
 * `Order ID` matches exactly. The previous version of this helper included
 * `Date.now()`, which guaranteed that the refund flow (called weeks later) would
 * never reproduce the same ID — silently breaking refund-to-order linking and
 * inflating customer lifetime value in Klaviyo.
 *
 * The fix: use `paymentIntentId` (always unique per Stripe payment) as the
 * uniqueness key. No timestamps. The same `(packageType, packageId, paymentIntentId)`
 * tuple always produces the same Order ID, so the refund flow recovers it cleanly.
 *
 * Format:
 * - Memberships: `sub_{paymentIntentId}`
 * - One-time:    `onetime_{packageId}_{paymentIntentId}`
 * - Mini-draw:   `minidraw_{packageId}_{paymentIntentId}`
 * - Upsell:      `upsell_{packageId}_{paymentIntentId}`
 *
 * @param packageType - Type of package being purchased
 * @param packageId - Package identifier (required for non-membership types)
 * @param paymentIntentId - Stripe payment intent ID (required for all types)
 * @returns Deterministic order ID string
 */
export function generateOrderId(
  packageType: PackageType,
  packageId: string,
  paymentIntentId: string
): string {
  switch (packageType) {
    case "membership":
      // paymentIntentId alone is unique per payment — no need for packageId
      return `sub_${paymentIntentId}`;

    case "one-time":
      return `onetime_${packageId}_${paymentIntentId}`;

    case "mini-draw":
      return `minidraw_${packageId}_${paymentIntentId}`;

    case "upsell":
      return `upsell_${packageId}_${paymentIntentId}`;

    default:
      // Fallback format
      return `order_${paymentIntentId}`;
  }
}

/**
 * Reconstruct the original Order ID from payment data for refund linking.
 * Same inputs → same output as the original `generateOrderId` call at purchase time.
 *
 * @param paymentIntentId - Stripe payment intent ID
 * @param packageType - Type of package
 * @param packageId - Package identifier (for non-membership types)
 * @returns Order ID string matching the original Placed Order event
 */
export function extractOrderIdFromPaymentIntent(
  paymentIntentId: string,
  packageType: PackageType,
  packageId?: string
): string {
  // For memberships, packageId is not used by generateOrderId
  if (packageType === "membership") {
    return generateOrderId(packageType, "", paymentIntentId);
  }

  // For other types, require package ID
  if (!packageId) {
    throw new Error(`Package ID required for ${packageType} order ID extraction`);
  }

  return generateOrderId(packageType, packageId, paymentIntentId);
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
 * Parse order ID to extract components.
 *
 * Order IDs no longer contain timestamps (see `generateOrderId`). This parser
 * supports the current format AND legacy timestamped IDs (so historical events
 * can still be queried during the transition period).
 *
 * @param orderId - Order ID to parse
 * @returns Object with package type and identifier, or null if invalid
 */
export function parseOrderId(orderId: string): {
  packageType: PackageType | "unknown";
  identifier: string;
  /** Legacy timestamped IDs only — null for new deterministic IDs */
  timestamp: number | null;
} | null {
  const normalized = normalizeOrderId(orderId);

  // Try legacy format first: prefix_identifier_timestamp (purely numeric trailing segment)
  const legacyMatch = normalized.match(/^(sub|onetime|minidraw|upsell|order)_(.+)_(\d+)$/);
  if (legacyMatch) {
    const [, prefix, identifier, timestampStr] = legacyMatch;
    const packageTypeMap: Record<string, PackageType | "unknown"> = {
      sub: "membership",
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

  // Current format: prefix_identifier (no trailing timestamp)
  const currentMatch = normalized.match(/^(sub|onetime|minidraw|upsell|order)_(.+)$/);
  if (!currentMatch) return null;

  const [, prefix, identifier] = currentMatch;
  const packageTypeMap: Record<string, PackageType | "unknown"> = {
    sub: "membership",
    onetime: "one-time",
    minidraw: "mini-draw",
    upsell: "upsell",
    order: "unknown",
  };
  return {
    packageType: packageTypeMap[prefix] || "unknown",
    identifier,
    timestamp: null,
  };
}
