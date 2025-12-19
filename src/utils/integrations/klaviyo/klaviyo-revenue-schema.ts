/**
 * Klaviyo Revenue Schema Helpers
 *
 * Centralized utilities for building Klaviyo revenue event properties.
 * Follows Klaviyo's strict schema requirements for revenue metrics.
 *
 * CRITICAL: Revenue is ONLY calculated from top-level `$value` property.
 * Any other property name (value, amount, price) is ignored for revenue.
 *
 * This module provides:
 * - Type-safe builders for revenue properties
 * - Consistent field naming (Currency, Order ID, etc.)
 * - Subscription-specific property builders
 * - Product items array builders
 *
 * Benefits:
 * - Single source of truth for Klaviyo revenue schema
 * - Easy to maintain and update if Klaviyo changes requirements
 * - Prevents common mistakes (wrong field names, missing $value)
 * - Reusable across all revenue events
 *
 * @module utils/integrations/klaviyo/klaviyo-revenue-schema
 */

// ============================================================
// TYPE DEFINITIONS
// ============================================================

/**
 * Revenue properties for Klaviyo events
 * These are the REQUIRED fields for revenue metrics to work
 */
export interface KlaviyoRevenueProperties {
  /** REQUIRED: Top-level numeric property - ONLY field Klaviyo uses for revenue calculation */
  $value: number;
  /** REQUIRED: Currency code in ISO format (e.g., "AUD", "USD") */
  Currency: string;
  /** REQUIRED: Unique order identifier for deduplication */
  "Order ID": string;
}

/**
 * Product item in revenue event items array
 * Used for product-level analytics (does not affect total revenue)
 */
export interface KlaviyoRevenueItem {
  product_id: string;
  product_name: string;
  price: number; // Note: Use "price" not "value" in items array
  quantity: number;
}

/**
 * Subscription-specific properties for membership purchases
 * Enables subscription segmentation and recurring revenue analysis
 */
export interface KlaviyoSubscriptionProperties {
  "Billing Type": "subscription";
  "Billing Interval": "monthly" | "yearly";
  "Is Recurring": boolean;
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Build core revenue properties for Klaviyo events
 *
 * Creates the REQUIRED fields for revenue metrics:
 * - $value: Top-level numeric property (CRITICAL - only field used for revenue)
 * - Currency: ISO currency code (e.g., "AUD")
 * - Order ID: Unique identifier for deduplication
 *
 * @param orderId - Unique order identifier
 * @param value - Revenue amount (positive for purchases, negative for refunds)
 * @param currency - ISO currency code (defaults to "AUD")
 * @returns Revenue properties object
 *
 * @example
 * ```typescript
 * const revenueProps = buildRevenueProperties("order_123", 20.00, "AUD");
 * // Returns: { $value: 20.00, Currency: "AUD", "Order ID": "order_123" }
 * ```
 */
export function buildRevenueProperties(
  orderId: string,
  value: number,
  currency: string = "AUD"
): KlaviyoRevenueProperties {
  return {
    $value: value, // CRITICAL: Must be $value (with dollar sign) for Klaviyo to recognize revenue
    Currency: currency, // Capital C - Klaviyo best practice
    "Order ID": orderId, // Space and capital letters - Klaviyo best practice
  };
}

/**
 * Build product item for revenue event items array
 *
 * Items array enables product-level analytics:
 * - Product revenue reports
 * - Best sellers tracking
 * - Cross-sell / upsell flows
 *
 * Note: Items array does NOT affect total revenue calculation.
 * Total revenue is calculated ONLY from top-level $value property.
 *
 * @param productId - Product identifier
 * @param productName - Product name
 * @param price - Product price (use "price" not "value" in items)
 * @param quantity - Quantity purchased (defaults to 1)
 * @returns Product item object
 *
 * @example
 * ```typescript
 * const item = buildRevenueItem("tradie-subscription", "Tradie", 20.00, 1);
 * // Returns: { product_id: "tradie-subscription", product_name: "Tradie", price: 20.00, quantity: 1 }
 * ```
 */
export function buildRevenueItem(
  productId: string,
  productName: string,
  price: number,
  quantity: number = 1
): KlaviyoRevenueItem {
  return {
    product_id: productId,
    product_name: productName,
    price: price, // Use "price" not "value" in items array
    quantity: quantity,
  };
}

/**
 * Build subscription-specific properties for membership purchases
 *
 * These properties enable:
 * - Subscription segmentation
 * - Recurring revenue analysis
 * - Subscription-based email flows
 *
 * @param billingInterval - Billing interval ("monthly" or "yearly")
 * @returns Subscription properties object
 *
 * @example
 * ```typescript
 * const subProps = buildSubscriptionProperties("monthly");
 * // Returns: { "Billing Type": "subscription", "Billing Interval": "monthly", "Is Recurring": true }
 * ```
 */
export function buildSubscriptionProperties(billingInterval: "monthly" | "yearly"): KlaviyoSubscriptionProperties {
  return {
    "Billing Type": "subscription",
    "Billing Interval": billingInterval,
    "Is Recurring": true,
  };
}

/**
 * Validate revenue value
 *
 * Ensures revenue value is a valid number.
 * Useful for runtime validation before sending events.
 *
 * @param value - Revenue value to validate
 * @returns True if valid, false otherwise
 */
export function isValidRevenueValue(value: number): boolean {
  return typeof value === "number" && !isNaN(value) && isFinite(value);
}

/**
 * Validate currency code
 *
 * Ensures currency code follows ISO format (3 uppercase letters).
 *
 * @param currency - Currency code to validate
 * @returns True if valid, false otherwise
 */
export function isValidCurrencyCode(currency: string): boolean {
  return /^[A-Z]{3}$/.test(currency);
}

/**
 * Normalize currency code
 *
 * Converts currency code to uppercase ISO format.
 *
 * @param currency - Currency code to normalize
 * @returns Normalized currency code (uppercase, 3 letters)
 */
export function normalizeCurrencyCode(currency: string): string {
  return currency.toUpperCase().trim().substring(0, 3);
}
