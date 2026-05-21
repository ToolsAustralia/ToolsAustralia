"use client";

import { useCallback } from "react";
import {
  trackFacebookEvent,
  trackPurchase as fbTrackPurchase,
  trackSearch as fbTrackSearch,
  trackCompleteRegistration as fbTrackCompleteRegistration,
  trackSubscribe as fbTrackSubscribe,
  trackRemoveFromCart as fbTrackRemoveFromCart,
} from "@/components/FacebookPixel";
import {
  trackTikTokEvent,
  trackTikTokPurchase,
  trackTikTokAddToCart,
  trackTikTokInitiateCheckout,
  trackTikTokViewContent,
  trackTikTokSearch,
  trackTikTokCompleteRegistration,
  trackTikTokLead,
  trackTikTokSubscribe,
  trackTikTokContact,
} from "@/components/TikTokPixel";
import { fireMetaHybridEvent } from "@/utils/tracking/meta-hybrid";

export interface PixelEventParams {
  value?: number;
  currency?: string;
  productId?: string;
  orderId?: string;
  numItems?: number;
  method?: string;
  contentName?: string;
  contentIds?: string[];
  [key: string]: unknown;
}

export function usePixelTracking() {
  // Generic event tracking
  const trackEvent = useCallback(
    (eventName: string, parameters?: PixelEventParams, platforms?: ("facebook" | "tiktok")[]) => {
      const platformsToTrack = platforms || ["facebook", "tiktok"];

      console.log(`🎯 Tracking event: ${eventName}`, parameters);

      platformsToTrack.forEach((platform) => {
        if (platform === "facebook") {
          console.log(`📘 Sending to Facebook: ${eventName}`, parameters);
          trackFacebookEvent(eventName, parameters);
        } else if (platform === "tiktok") {
          console.log(`📱 Sending to TikTok: ${eventName}`, parameters);
          trackTikTokEvent(eventName, parameters);
        }
      });
    },
    []
  );

  // Purchase tracking
  const trackPurchase = useCallback((params: PixelEventParams, platforms?: ("facebook" | "tiktok")[]) => {
    const platformsToTrack = platforms || ["facebook", "tiktok"];

    platformsToTrack.forEach((platform) => {
      if (platform === "facebook") {
        fbTrackPurchase(params.value || 0, params.currency || "AUD", params.orderId);
      } else if (platform === "tiktok") {
        trackTikTokPurchase(params.value || 0, params.currency || "AUD", params.orderId);
      }
    });
  }, []);

  // Normalize PixelEventParams into Meta-format custom_data.
  // Handles both camelCase convenience fields (productId, contentName, contentIds, numItems)
  // AND callers that pass snake_case Meta-native keys directly (content_ids, content_type,
  // num_items, etc.) through the index signature. Snake-case keys win when both are present.
  const buildMetaCustomData = (params: PixelEventParams, defaults: Record<string, unknown> = {}): Record<string, unknown> => {
    const { productId, contentName, contentIds, numItems, method: _method, orderId: _orderId, ...rest } = params;
    const fromCamel: Record<string, unknown> = {
      ...(productId && { content_ids: [productId] }),
      ...(contentName && { content_name: contentName }),
      ...(contentIds && { content_ids: contentIds }),
      ...(numItems != null && { num_items: numItems }),
    };
    return {
      currency: "AUD",
      ...defaults,
      ...fromCamel,
      ...rest, // snake_case + extras override (caller's explicit values win)
    };
  };

  // Add to cart tracking — Meta side fires hybrid Pixel + CAPI for ad-blocker recovery
  const trackAddToCart = useCallback((params: PixelEventParams, platforms?: ("facebook" | "tiktok")[]) => {
    const platformsToTrack = platforms || ["facebook", "tiktok"];

    platformsToTrack.forEach((platform) => {
      if (platform === "facebook") {
        fireMetaHybridEvent({
          eventName: "AddToCart",
          customData: buildMetaCustomData(params, { content_type: "product" }),
        });
      } else if (platform === "tiktok") {
        trackTikTokAddToCart(params.value || 0, params.currency || "AUD", params.productId);
      }
    });
  }, []);

  // Initiate checkout tracking — hybrid Pixel + CAPI on Meta side
  const trackInitiateCheckout = useCallback((params: PixelEventParams, platforms?: ("facebook" | "tiktok")[]) => {
    const platformsToTrack = platforms || ["facebook", "tiktok"];

    platformsToTrack.forEach((platform) => {
      if (platform === "facebook") {
        fireMetaHybridEvent({
          eventName: "InitiateCheckout",
          customData: buildMetaCustomData(params, { content_type: "product" }),
        });
      } else if (platform === "tiktok") {
        trackTikTokInitiateCheckout(params.value || 0, params.currency || "AUD", params.numItems);
      }
    });
  }, []);

  // View content tracking — hybrid Pixel + CAPI on Meta side. Custom params
  // (content_category, content_name, brand, page_type, user_type) flow through
  // unchanged to support catalog matching and dynamic product ads.
  const trackViewContent = useCallback((params: PixelEventParams, platforms?: ("facebook" | "tiktok")[]) => {
    const platformsToTrack = platforms || ["facebook", "tiktok"];

    platformsToTrack.forEach((platform) => {
      if (platform === "facebook") {
        fireMetaHybridEvent({
          eventName: "ViewContent",
          customData: buildMetaCustomData(params, {
            content_type: "product",
            platform: "tools-australia-website",
          }),
        });
      } else if (platform === "tiktok") {
        trackTikTokViewContent(params.value || 0, params.currency || "AUD", params.productId);
      }
    });
  }, []);

  // Search tracking
  const trackSearch = useCallback((searchString: string, platforms?: ("facebook" | "tiktok")[]) => {
    const platformsToTrack = platforms || ["facebook", "tiktok"];

    platformsToTrack.forEach((platform) => {
      if (platform === "facebook") {
        fbTrackSearch(searchString);
      } else if (platform === "tiktok") {
        trackTikTokSearch(searchString);
      }
    });
  }, []);

  // Registration tracking
  const trackCompleteRegistration = useCallback((params: PixelEventParams, platforms?: ("facebook" | "tiktok")[]) => {
    const platformsToTrack = platforms || ["facebook", "tiktok"];

    platformsToTrack.forEach((platform) => {
      if (platform === "facebook") {
        // Pass all parameters (removed registration_method and content_type as per requirements)
        fbTrackCompleteRegistration(
          params as {
            source?: string;
            referrer?: string;
            referrer_domain?: string;
            utm_source?: string;
            utm_medium?: string;
            utm_campaign?: string;
            signup_flow?: string;
            initial_interest?: string;
            platform?: string;
            user_type?: "guest" | "member";
            [key: string]: unknown;
          }
        );
      } else if (platform === "tiktok") {
        trackTikTokCompleteRegistration(params.method);
      }
    });
  }, []);

  // Lead tracking — hybrid Pixel + CAPI on Meta side. Lead conversions don't
  // have a natural primary key (no orderId/paymentIntentId), so the helper
  // generates a per-fire UUID — both Pixel and CAPI use the same value for dedup.
  const trackLead = useCallback((params: PixelEventParams, platforms?: ("facebook" | "tiktok")[]) => {
    const platformsToTrack = platforms || ["facebook", "tiktok"];

    platformsToTrack.forEach((platform) => {
      if (platform === "facebook") {
        fireMetaHybridEvent({
          eventName: "Lead",
          customData: buildMetaCustomData(params, { content_type: "lead" }),
        });
      } else if (platform === "tiktok") {
        trackTikTokLead(params.value, params.currency || "AUD");
      }
    });
  }, []);

  // Subscribe tracking
  const trackSubscribe = useCallback((params: PixelEventParams, platforms?: ("facebook" | "tiktok")[]) => {
    const platformsToTrack = platforms || ["facebook", "tiktok"];

    platformsToTrack.forEach((platform) => {
      if (platform === "facebook") {
        fbTrackSubscribe(params.value, params.currency || "AUD");
      } else if (platform === "tiktok") {
        trackTikTokSubscribe(params.value, params.currency || "AUD");
      }
    });
  }, []);

  // Contact tracking (TikTok specific)
  const trackContact = useCallback((platforms?: ("facebook" | "tiktok")[]) => {
    const platformsToTrack = platforms || ["tiktok"];

    platformsToTrack.forEach((platform) => {
      if (platform === "facebook") {
        trackFacebookEvent("Contact", { content_type: "contact" });
      } else if (platform === "tiktok") {
        trackTikTokContact();
      }
    });
  }, []);

  // Add payment info tracking — hybrid Pixel + CAPI on Meta side.
  // Currently no caller (mock /checkout was removed in Phase 4). When the real
  // shop ships, fire this once on the Pay button hover/focus or on payment
  // form completion.
  const trackAddPaymentInfo = useCallback((params: PixelEventParams, platforms?: ("facebook" | "tiktok")[]) => {
    const platformsToTrack = platforms || ["facebook", "tiktok"];

    platformsToTrack.forEach((platform) => {
      if (platform === "facebook") {
        fireMetaHybridEvent({
          eventName: "AddPaymentInfo",
          customData: buildMetaCustomData(params, { content_type: "product" }),
        });
      } else if (platform === "tiktok") {
        // TikTok doesn't have a specific AddPaymentInfo event, use custom event
        trackTikTokEvent("AddPaymentInfo", {
          value: params.value || 0,
          currency: params.currency || "AUD",
          content_ids: params.contentIds,
          num_items: params.numItems,
        });
      }
    });
  }, []);

  // Remove from cart tracking
  const trackRemoveFromCart = useCallback((params: PixelEventParams, platforms?: ("facebook" | "tiktok")[]) => {
    const platformsToTrack = platforms || ["facebook", "tiktok"];

    platformsToTrack.forEach((platform) => {
      if (platform === "facebook") {
        fbTrackRemoveFromCart(params.value || 0, params.currency || "AUD", params.productId, params.contentName);
      } else if (platform === "tiktok") {
        // TikTok doesn't have a specific RemoveFromCart event, use custom event
        trackTikTokEvent("RemoveFromCart", {
          value: params.value || 0,
          currency: params.currency || "AUD",
          content_ids: params.productId ? [params.productId] : undefined,
          content_name: params.contentName,
        });
      }
    });
  }, []);

  // Custom event tracking
  const trackCustomEvent = useCallback(
    (eventName: string, parameters?: PixelEventParams, platforms?: ("facebook" | "tiktok")[]) => {
      const platformsToTrack = platforms || ["facebook", "tiktok"];

      platformsToTrack.forEach((platform) => {
        if (platform === "facebook") {
          trackFacebookEvent(eventName, parameters);
        } else if (platform === "tiktok") {
          trackTikTokEvent(eventName, parameters);
        }
      });
    },
    []
  );

  return {
    trackEvent,
    trackPurchase,
    trackAddToCart,
    trackInitiateCheckout,
    trackViewContent,
    trackSearch,
    trackCompleteRegistration,
    trackLead,
    trackSubscribe,
    trackContact,
    trackAddPaymentInfo,
    trackRemoveFromCart,
    trackCustomEvent,
  };
}
