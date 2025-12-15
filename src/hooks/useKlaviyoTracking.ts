"use client";

import { useCallback } from "react";
import { identifyKlaviyoUser, trackKlaviyoEvent, trackKlaviyoPageView } from "@/utils/tracking/klaviyo-helpers";

/**
 * Klaviyo Event Parameters Interface
 * Defines the structure for Klaviyo event tracking parameters.
 */
export interface KlaviyoEventParams {
  value?: number;
  currency?: string;
  productId?: string;
  productName?: string;
  orderId?: string;
  numItems?: number;
  method?: string;
  contentName?: string;
  contentIds?: string[];
  [key: string]: unknown;
}

/**
 * Klaviyo User Identification Parameters Interface
 * Defines the structure for identifying users in Klaviyo.
 */
export interface KlaviyoIdentifyParams {
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  [key: string]: unknown;
}

/**
 * useKlaviyoTracking Hook
 *
 * React hook for Klaviyo client-side tracking.
 * Provides methods for user identification and event tracking.
 *
 * Follows the same pattern as usePixelTracking for consistency.
 *
 * @example
 * ```tsx
 * const { identify, trackPurchase, trackAddToCart } = useKlaviyoTracking();
 *
 * // Identify user after login
 * identify({
 *   email: user.email,
 *   firstName: user.firstName,
 *   lastName: user.lastName
 * });
 *
 * // Track purchase
 * trackPurchase({
 *   value: 99.99,
 *   currency: "AUD",
 *   orderId: "order_123",
 *   productId: "prod_123"
 * });
 * ```
 */
export function useKlaviyoTracking() {
  /**
   * Identify a user in Klaviyo
   * Links the browser session to a user profile.
   *
   * @param params - User identification parameters (email, firstName, lastName, etc.)
   */
  const identify = useCallback((params: KlaviyoIdentifyParams) => {
    try {
      const { email, ...traits } = params;
      identifyKlaviyoUser(email, traits);
    } catch (error) {
      // Silently fail - don't break user experience
      if (process.env.NODE_ENV === "development") {
        console.error("❌ Klaviyo: Error in identify", error);
      }
    }
  }, []);

  /**
   * Track a custom event in Klaviyo
   * Generic event tracking for any Klaviyo event.
   *
   * @param eventName - Name of the event
   * @param params - Optional event parameters
   */
  const track = useCallback((eventName: string, params?: KlaviyoEventParams) => {
    try {
      trackKlaviyoEvent(eventName, params);
    } catch (error) {
      // Silently fail - don't break user experience
      if (process.env.NODE_ENV === "development") {
        console.error(`❌ Klaviyo: Error tracking ${eventName}`, error);
      }
    }
  }, []);

  /**
   * Track a purchase event in Klaviyo
   * Standard Klaviyo event for completed purchases.
   *
   * @param params - Purchase event parameters (value, currency, orderId, productId, etc.)
   */
  const trackPurchase = useCallback((params: KlaviyoEventParams) => {
    try {
      trackKlaviyoEvent("Placed Order", {
        value: params.value,
        currency: params.currency || "AUD",
        order_id: params.orderId,
        item_count: params.numItems || 1,
        items: params.productId
          ? [
              {
                product_id: params.productId,
                product_name: params.productName,
                value: params.value,
                quantity: params.numItems || 1,
              },
            ]
          : [],
        ...params,
      });
    } catch (error) {
      // Silently fail - don't break user experience
      if (process.env.NODE_ENV === "development") {
        console.error("❌ Klaviyo: Error tracking purchase", error);
      }
    }
  }, []);

  /**
   * Track an "Add to Cart" event in Klaviyo
   * Standard Klaviyo event for when users add items to cart.
   *
   * @param params - Add to cart event parameters (value, currency, productId, etc.)
   */
  const trackAddToCart = useCallback((params: KlaviyoEventParams) => {
    try {
      trackKlaviyoEvent("Added to Cart", {
        value: params.value,
        currency: params.currency || "AUD",
        item_count: params.numItems || 1,
        items: params.productId
          ? [
              {
                product_id: params.productId,
                product_name: params.productName,
                value: params.value,
                quantity: params.numItems || 1,
              },
            ]
          : [],
        ...params,
      });
    } catch (error) {
      // Silently fail - don't break user experience
      if (process.env.NODE_ENV === "development") {
        console.error("❌ Klaviyo: Error tracking add to cart", error);
      }
    }
  }, []);

  /**
   * Track a "Remove from Cart" event in Klaviyo
   * Standard Klaviyo event for when users remove items from cart.
   *
   * @param params - Remove from cart event parameters (value, currency, productId, etc.)
   */
  const trackRemoveFromCart = useCallback((params: KlaviyoEventParams) => {
    try {
      trackKlaviyoEvent("Removed from Cart", {
        value: params.value,
        currency: params.currency || "AUD",
        item_count: params.numItems || 1,
        items: params.productId
          ? [
              {
                product_id: params.productId,
                product_name: params.productName,
                value: params.value,
                quantity: params.numItems || 1,
              },
            ]
          : [],
        ...params,
      });
    } catch (error) {
      // Silently fail - don't break user experience
      if (process.env.NODE_ENV === "development") {
        console.error("❌ Klaviyo: Error tracking remove from cart", error);
      }
    }
  }, []);

  /**
   * Track a "View Content" event in Klaviyo
   * Standard Klaviyo event for when users view products or pages.
   *
   * @param params - View content event parameters (value, currency, productId, etc.)
   */
  const trackViewContent = useCallback((params: KlaviyoEventParams) => {
    try {
      trackKlaviyoEvent("Viewed Product", {
        value: params.value,
        currency: params.currency || "AUD",
        product_id: params.productId,
        product_name: params.productName || params.contentName,
        ...params,
      });
    } catch (error) {
      // Silently fail - don't break user experience
      if (process.env.NODE_ENV === "development") {
        console.error("❌ Klaviyo: Error tracking view content", error);
      }
    }
  }, []);

  /**
   * Track an "Initiate Checkout" event in Klaviyo
   * Standard Klaviyo event for when users start checkout.
   *
   * @param params - Initiate checkout event parameters (value, currency, numItems, etc.)
   */
  const trackInitiateCheckout = useCallback((params: KlaviyoEventParams) => {
    try {
      trackKlaviyoEvent("Started Checkout", {
        value: params.value,
        currency: params.currency || "AUD",
        item_count: params.numItems || 1,
        ...params,
      });
    } catch (error) {
      // Silently fail - don't break user experience
      if (process.env.NODE_ENV === "development") {
        console.error("❌ Klaviyo: Error tracking initiate checkout", error);
      }
    }
  }, []);

  /**
   * Track a "Complete Registration" event in Klaviyo
   * Standard Klaviyo event for when users complete registration.
   *
   * @param params - Complete registration event parameters (method, etc.)
   */
  const trackCompleteRegistration = useCallback((params?: KlaviyoEventParams) => {
    try {
      trackKlaviyoEvent("Placed Order", {
        method: params?.method || "email",
        ...params,
      });
    } catch (error) {
      // Silently fail - don't break user experience
      if (process.env.NODE_ENV === "development") {
        console.error("❌ Klaviyo: Error tracking complete registration", error);
      }
    }
  }, []);

  return {
    identify,
    track,
    trackPurchase,
    trackAddToCart,
    trackRemoveFromCart,
    trackViewContent,
    trackInitiateCheckout,
    trackCompleteRegistration,
  };
}
