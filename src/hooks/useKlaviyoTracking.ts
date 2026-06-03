"use client";

import { useCallback } from "react";
import { identifyKlaviyoUser, trackKlaviyoEvent } from "@/utils/tracking/klaviyo-helpers";

/**
 * Klaviyo Event Parameters Interface.
 *
 * All keys are snake_case to match Klaviyo's profile-property and event-property
 * conventions. This avoids creating duplicate camelCase custom properties on the
 * profile when an event spreads its params over time.
 */
export interface KlaviyoEventParams {
  value?: number;
  currency?: string;
  product_id?: string;
  product_name?: string;
  order_id?: string;
  num_items?: number;
  method?: string;
  content_name?: string;
  content_ids?: string[];
  [key: string]: unknown;
}

/**
 * Klaviyo User Identification Parameters Interface.
 *
 * Trait keys are snake_case so they merge with the server-side `upsertProfile`
 * standard fields (`first_name`, `last_name`, `phone_number`) instead of
 * creating shadow camelCase custom properties.
 */
export interface KlaviyoIdentifyParams {
  email: string;
  first_name?: string;
  last_name?: string;
  phone_number?: string;
  user_id?: string;
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
 * // Identify user after login (snake_case keys match Klaviyo standard fields)
 * identify({
 *   email: user.email,
 *   first_name: user.firstName,
 *   last_name: user.lastName,
 * });
 *
 * // Track purchase (event params are snake_case)
 * trackPurchase({
 *   value: 99.99,
 *   currency: "AUD",
 *   order_id: "order_123",
 *   product_id: "prod_123",
 * });
 * ```
 */
export function useKlaviyoTracking() {
  /**
   * Identify a user in Klaviyo
   * Links the browser session to a user profile.
   *
   * @param params - User identification parameters (email, first_name, last_name, etc.)
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
   * @param params - Purchase event parameters (value, currency, order_id, product_id, etc.)
   */
  const trackPurchase = useCallback((params: KlaviyoEventParams) => {
    try {
      const items = params.product_id
        ? [
            {
              product_id: params.product_id,
              product_name: params.product_name,
              value: params.value,
              quantity: params.num_items ?? 1,
            },
          ]
        : [];
      trackKlaviyoEvent("Placed Order", {
        ...params,
        currency: params.currency || "AUD",
        item_count: params.num_items ?? 1,
        items,
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
   * @param params - Add to cart event parameters (value, currency, product_id, etc.)
   */
  const trackAddToCart = useCallback((params: KlaviyoEventParams) => {
    try {
      const items = params.product_id
        ? [
            {
              product_id: params.product_id,
              product_name: params.product_name,
              value: params.value,
              quantity: params.num_items ?? 1,
            },
          ]
        : [];
      trackKlaviyoEvent("Added to Cart", {
        ...params,
        currency: params.currency || "AUD",
        item_count: params.num_items ?? 1,
        items,
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
   * @param params - Remove from cart event parameters (value, currency, product_id, etc.)
   */
  const trackRemoveFromCart = useCallback((params: KlaviyoEventParams) => {
    try {
      const items = params.product_id
        ? [
            {
              product_id: params.product_id,
              product_name: params.product_name,
              value: params.value,
              quantity: params.num_items ?? 1,
            },
          ]
        : [];
      trackKlaviyoEvent("Removed from Cart", {
        ...params,
        currency: params.currency || "AUD",
        item_count: params.num_items ?? 1,
        items,
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
   * @param params - View content event parameters (value, currency, product_id, etc.)
   */
  const trackViewContent = useCallback((params: KlaviyoEventParams) => {
    try {
      trackKlaviyoEvent("Viewed Product", {
        ...params,
        currency: params.currency || "AUD",
        product_name: params.product_name || params.content_name,
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
   * @param params - Initiate checkout event parameters (value, currency, num_items, etc.)
   */
  const trackInitiateCheckout = useCallback((params: KlaviyoEventParams) => {
    try {
      trackKlaviyoEvent("Started Checkout", {
        ...params,
        currency: params.currency || "AUD",
        item_count: params.num_items ?? 1,
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
      trackKlaviyoEvent("Completed Registration", {
        ...params,
        method: params?.method || "email",
      });
    } catch (error) {
      // Silently fail - don't break user experience
      if (process.env.NODE_ENV === "development") {
        console.error("❌ Klaviyo: Error tracking complete registration", error);
      }
    }
  }, []);

  /**
   * Track a "Viewed Giveaway" event in Klaviyo (canonical schema, added 2026-05-28).
   *
   * Fires from `/promotions/<slug>` pages via `PromoViewTracking.tsx`. Uses the
   * canonical property names defined in docs/tracking/KLAVIYO_INTEGRATION.md —
   * `viewed_at` (ISO), `is_authenticated` (boolean), optional properties omitted
   * rather than nulled. The cookied-profile auto-attach is handled by Klaviyo's
   * onsite snippet.
   *
   * @param params - Promo metadata: slug, optional id, title, prize name, optional
   *   prize image URL, full promo URL, is_authenticated flag.
   */
  const trackViewedGiveaway = useCallback(
    (params: {
      promo_slug: string;
      promo_id?: string;
      promo_title: string;
      prize_name: string;
      prize_image_url?: string;
      promo_url: string;
      is_authenticated: boolean;
    }) => {
      try {
        trackKlaviyoEvent("Viewed Giveaway", {
          promo_slug: params.promo_slug,
          ...(params.promo_id ? { promo_id: params.promo_id } : {}),
          promo_title: params.promo_title,
          prize_name: params.prize_name,
          ...(params.prize_image_url ? { prize_image_url: params.prize_image_url } : {}),
          promo_url: params.promo_url,
          is_authenticated: params.is_authenticated,
          viewed_at: new Date().toISOString(),
        });
      } catch (error) {
        if (process.env.NODE_ENV === "development") {
          console.error("❌ Klaviyo: Error tracking Viewed Giveaway", error);
        }
      }
    },
    []
  );

  /**
   * Track a canonical "Started Checkout" event in Klaviyo (added 2026-05-28, revised Phase-7).
   *
   * Fires from two callsites (the third Started Checkout path is server-side):
   *
   *   1. AUTHED user clicks "Enter Now" on a package card (MembershipSection.handlePlanSelect)
   *      — fires at the moment of intent, BEFORE the modal renders the card form.
   *      Captures abandoners who close the modal mid-flow. `is_authenticated: true`.
   *
   *   2. GUEST reaches payment-submit when `guestUserData` persisted across modal
   *      close/reopen (handleRegistration didn't run this session → no server-side fire).
   *      Gated by `if (!isAuthenticated)` in MembershipModal:handleSubmit so authed
   *      users don't double-fire with #1. `is_authenticated: false`.
   *
   * `step` is the funnel position; `is_authenticated` is the real session state
   * — NOT derived. In this codebase, step-1 registration does NOT auto-login
   * (see docs/auth/gotchas.md "registration ≠ authenticated session"). A guest
   * can fire this event with `step="viewed"` AND `is_authenticated=false` when
   * they reach payment-submit without ever logging in.
   *
   * Schema: `price` as NUMBER, lowercase `currency`, `$value` alongside for
   * Klaviyo revenue-template compat, `tier` (not `package_tier`), ISO
   * `started_at`, optionals omitted when absent.
   */
  const trackKlaviyoStartedCheckout = useCallback(
    (params: {
      package_id: string;
      package_name: string;
      package_type: "membership" | "one-time" | "mini-draw" | "upsell";
      tier?: string;
      /** AUD as a NUMBER. */
      price: number;
      num_entries?: number;
      checkout_url: string;
      promo_slug?: string;
      /** Real NextAuth session state — NOT derived from step. */
      is_authenticated: boolean;
    }) => {
      try {
        trackKlaviyoEvent("Started Checkout", {
          package_id: params.package_id,
          package_name: params.package_name,
          package_type: params.package_type,
          ...(params.tier ? { tier: params.tier } : {}),
          price: params.price,
          $value: params.price, // Klaviyo revenue-template compat
          currency: "aud",
          ...(params.num_entries !== undefined ? { num_entries: params.num_entries } : {}),
          checkout_url: params.checkout_url,
          ...(params.promo_slug ? { promo_slug: params.promo_slug } : {}),
          step: "viewed", // client-side fire — either Enter-Now click (authed, MembershipSection.handlePlanSelect) or Pay-submit (guest second-open fallback). Both are the "viewed" funnel step (pre-Placed-Order).
          is_authenticated: params.is_authenticated,
          started_at: new Date().toISOString(),
        });
      } catch (error) {
        if (process.env.NODE_ENV === "development") {
          console.error("❌ Klaviyo: Error tracking Started Checkout (viewed)", error);
        }
      }
    },
    []
  );

  return {
    identify,
    track,
    trackPurchase,
    trackAddToCart,
    trackRemoveFromCart,
    trackViewContent,
    trackInitiateCheckout,
    trackCompleteRegistration,
    trackViewedGiveaway,
    trackKlaviyoStartedCheckout,
  };
}
