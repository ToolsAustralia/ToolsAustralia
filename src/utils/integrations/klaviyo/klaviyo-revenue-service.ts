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
