/**
 * Klaviyo Revenue Service
 *
 * Service layer for tracking revenue events in Klaviyo.
 * Abstracts revenue tracking logic from payment processing for better separation of concerns.
 *
 * This service handles:
 * - "Placed Order" events (for purchases)
 * - "Refunded Order" events (for refunds)
 *
 * Benefits:
 * - Separates revenue tracking from payment processing logic
 * - Reusable across different contexts
 * - Easier to test and maintain
 * - Keeps payment-processing.ts focused and maintainable
 *
 * @module utils/integrations/klaviyo/klaviyo-revenue-service
 */

import type { IUser } from "@/models/User";
import { klaviyo } from "@/lib/klaviyo";
import { createPlacedOrderEvent, createRefundedOrderEvent } from "./klaviyo-events";
import { generateOrderId, type PackageType } from "./klaviyo-order-helpers";

/**
 * Track "Placed Order" event in Klaviyo
 *
 * This is the standard Klaviyo event required for revenue metrics to work correctly.
 * Fires alongside custom events (Subscription Started, One-Time Package Purchased, etc.)
 *
 * CRITICAL: Revenue is calculated ONLY from top-level `$value` property.
 * The event uses Klaviyo's strict schema requirements:
 * - $value: Top-level numeric property (REQUIRED for revenue)
 * - Currency: ISO currency code (e.g., "AUD")
 * - Order ID: Unique identifier for deduplication
 *
 * @param user - User model instance
 * @param orderData - Order data including purchase details
 * @returns Promise that resolves when event is queued (non-blocking)
 */
export async function trackPlacedOrder(
  user: IUser,
  orderData: {
    packageType: PackageType;
    packageId: string;
    packageName: string;
    value: number; // Purchase amount in dollars
    currency?: string; // Defaults to "AUD"
    paymentIntentId: string;
    entriesGranted?: number;
    pointsEarned?: number;
    /**
     * Stripe `invoice.billing_reason` when known
     * (e.g. "subscription_create", "subscription_cycle", "subscription_update", "manual").
     * Emitted as `billing_reason` on the event for debugging + segmentation.
     */
    billingReason?: string;
    /**
     * True only when this Placed Order is an automated subscription renewal
     * (Stripe `billing_reason === "subscription_cycle"`). Emitted as `is_renewal`
     * on the event so attribution reports can filter renewals out of
     * "true new revenue" calculations. Defaults to false.
     */
    isRenewal?: boolean;
  }
): Promise<void> {
  try {
    // Generate deterministic order ID (no timestamp — see generateOrderId for rationale)
    const orderId = generateOrderId(
      orderData.packageType,
      orderData.packageId,
      orderData.paymentIntentId
    );

    // Create and track "Placed Order" event
    const event = createPlacedOrderEvent(user, {
      orderId,
      value: orderData.value,
      currency: orderData.currency || "AUD",
      packageType: orderData.packageType,
      packageId: orderData.packageId,
      packageName: orderData.packageName,
      entriesGranted: orderData.entriesGranted,
      pointsEarned: orderData.pointsEarned,
      paymentIntentId: orderData.paymentIntentId,
      billingReason: orderData.billingReason,
      isRenewal: orderData.isRenewal ?? false,
    });

    // Track event non-blocking (fire-and-forget)
    klaviyo.trackEventBackground(event);

    if (process.env.NODE_ENV === "development") {
      console.log(
        `✅ Klaviyo "Placed Order" event tracked: ${orderId} - $${orderData.value} ${orderData.currency || "AUD"}`
      );
    }
  } catch (error) {
    // Log error but don't throw - revenue tracking shouldn't break payment processing
    console.error(`❌ Failed to track "Placed Order" event for user ${user.email}:`, error);
  }
}

/**
 * Track "Refunded Order" event in Klaviyo
 *
 * This ensures revenue metrics correctly subtract refunds from total revenue.
 * The originalOrderId MUST match the original "Placed Order" event's "Order ID".
 *
 * CRITICAL: Revenue is calculated ONLY from top-level `$value` property.
 * Negative $value subtracts from total revenue in Klaviyo.
 * The event uses Klaviyo's strict schema requirements:
 * - $value: Negative refund amount (REQUIRED for revenue deduction)
 * - Currency: ISO currency code (e.g., "AUD")
 * - Order ID: Must match original "Placed Order" event's "Order ID"
 *
 * @param user - User model instance
 * @param refundData - Refund data including original order ID and refund amount
 * @returns Promise that resolves when event is queued (non-blocking)
 */
export async function trackRefundedOrder(
  user: IUser,
  refundData: {
    originalOrderId: string; // MUST match the original "Placed Order" order_id
    refundAmount: number; // Refund amount in dollars
    currency?: string; // Defaults to "AUD"
    refundReason?: string; // Reason for refund
    packageType: PackageType;
  }
): Promise<void> {
  try {
    // Create and track "Refunded Order" event
    const event = createRefundedOrderEvent(user, {
      originalOrderId: refundData.originalOrderId,
      refundAmount: refundData.refundAmount,
      currency: refundData.currency || "AUD",
      refundReason: refundData.refundReason || "customer_request",
      packageType: refundData.packageType,
    });

    // Track event non-blocking (fire-and-forget)
    klaviyo.trackEventBackground(event);

    if (process.env.NODE_ENV === "development") {
      console.log(
        `✅ Klaviyo "Refunded Order" event tracked: ${refundData.originalOrderId} - $${refundData.refundAmount} ${
          refundData.currency || "AUD"
        }`
      );
    }
  } catch (error) {
    // Log error but don't throw - refund tracking shouldn't break refund processing
    console.error(`❌ Failed to track "Refunded Order" event for user ${user.email}:`, error);
  }
}


/**
 * `Placed Order` for a merchandise order.
 *
 * Separate from `trackPlacedOrder` on purpose. That one is package-shaped and
 * sends package_type / package_id / package_name, which for a garment would
 * write "Unknown Package" into Klaviyo on every merch sale — the exact
 * pollution the shop exclusion in payment-processing was added to prevent.
 *
 * The revenue keys are the frozen ones every existing Klaviyo report and flow
 * already reads: $value, Currency, Order ID, items[]. `order_type: "shop"` is
 * the discriminator segments need to include or exclude merch.
 *
 * NOTE for whoever wires the dashboard: a flow or segment currently filtering
 * `Placed Order` on package_type will NOT match these. That is a Klaviyo-side
 * decision, not a code one.
 */
export function trackShopPlacedOrder(params: {
  email?: string;
  userId?: string;
  orderNumber: string;
  totalAmount: number;
  items: {
    productId: string;
    sku?: string;
    name: string;
    quantity: number;
    price: number;
    imageUrl?: string;
    size?: string;
    colour?: string;
  }[];
}): void {
  if (!params.email) return; // Klaviyo cannot attach an event to nobody

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://toolsaustralia.com.au").replace(/\/$/, "");

  klaviyo.trackEventBackground({
    event: "Placed Order",
    customer_properties: { email: params.email },
    properties: {
      $value: params.totalAmount,
      Currency: "AUD",
      "Order ID": params.orderNumber,
      order_type: "shop",
      order_number: params.orderNumber,
      ...(params.userId ? { user_id: params.userId } : {}),
      items: params.items.map((line) => ({
        ProductID: line.sku ?? line.productId,
        SKU: line.sku ?? line.productId,
        ProductName: line.name,
        Quantity: line.quantity,
        ItemPrice: line.price,
        RowTotal: line.price * line.quantity,
        ...(line.imageUrl ? { ImageURL: line.imageUrl } : {}),
        URL: `${appUrl}/shop/${line.productId}`,
        ...(line.size ? { size: line.size } : {}),
        ...(line.colour ? { colour: line.colour } : {}),
      })),
    },
  });
}
