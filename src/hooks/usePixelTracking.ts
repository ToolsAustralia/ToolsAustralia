"use client";

import { useCallback } from "react";
import {
  trackFacebookEvent,
  trackPurchase as fbTrackPurchase,
  trackAddToCart as fbTrackAddToCart,
  trackInitiateCheckout as fbTrackInitiateCheckout,
  trackViewContent as fbTrackViewContent,
  trackSearch as fbTrackSearch,
  trackCompleteRegistration as fbTrackCompleteRegistration,
  trackLead as fbTrackLead,
  trackSubscribe as fbTrackSubscribe,
  trackAddPaymentInfo as fbTrackAddPaymentInfo,
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

  // Add to cart tracking
  const trackAddToCart = useCallback((params: PixelEventParams, platforms?: ("facebook" | "tiktok")[]) => {
    const platformsToTrack = platforms || ["facebook", "tiktok"];

    platformsToTrack.forEach((platform) => {
      if (platform === "facebook") {
        fbTrackAddToCart(params.value || 0, params.currency || "AUD", params.productId);
      } else if (platform === "tiktok") {
        trackTikTokAddToCart(params.value || 0, params.currency || "AUD", params.productId);
      }
    });
  }, []);

  // Initiate checkout tracking
  const trackInitiateCheckout = useCallback((params: PixelEventParams, platforms?: ("facebook" | "tiktok")[]) => {
    const platformsToTrack = platforms || ["facebook", "tiktok"];

    platformsToTrack.forEach((platform) => {
      if (platform === "facebook") {
        fbTrackInitiateCheckout(params.value || 0, params.currency || "AUD", params.numItems);
      } else if (platform === "tiktok") {
        trackTikTokInitiateCheckout(params.value || 0, params.currency || "AUD", params.numItems);
      }
    });
  }, []);

  // View content tracking
  const trackViewContent = useCallback((params: PixelEventParams, platforms?: ("facebook" | "tiktok")[]) => {
    const platformsToTrack = platforms || ["facebook", "tiktok"];

    platformsToTrack.forEach((platform) => {
      if (platform === "facebook") {
        // Pass all parameters including custom ones (content_category, content_name, brand, page_type, user_type)
        fbTrackViewContent(
          params.value || 0,
          params.currency || "AUD",
          params.productId,
          params as {
            content_category?: string;
            content_name?: string;
            brand?: string;
            page_type?: string;
            user_type?: "guest" | "member";
            platform?: string;
            [key: string]: unknown;
          }
        );
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

  // Lead tracking
  const trackLead = useCallback((params: PixelEventParams, platforms?: ("facebook" | "tiktok")[]) => {
    const platformsToTrack = platforms || ["facebook", "tiktok"];

    platformsToTrack.forEach((platform) => {
      if (platform === "facebook") {
        fbTrackLead(params.value, params.currency || "AUD");
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

  // Add payment info tracking
  const trackAddPaymentInfo = useCallback((params: PixelEventParams, platforms?: ("facebook" | "tiktok")[]) => {
    const platformsToTrack = platforms || ["facebook", "tiktok"];

    platformsToTrack.forEach((platform) => {
      if (platform === "facebook") {
        fbTrackAddPaymentInfo(params.value || 0, params.currency || "AUD", params.contentIds, params.numItems);
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

  // Payment failed tracking (server-side function, but exposed for client-side use if needed)
  const trackPaymentFailed = useCallback((params: PixelEventParams, platforms?: ("facebook" | "tiktok")[]) => {
    const platformsToTrack = platforms || ["facebook", "tiktok"];

    platformsToTrack.forEach((platform) => {
      if (platform === "facebook") {
        trackFacebookEvent("PaymentFailed", {
          value: params.value || 0,
          currency: params.currency || "AUD",
          order_id: params.orderId,
          error_message: params.errorMessage as string | undefined,
          error_code: params.errorCode as string | undefined,
        });
      } else if (platform === "tiktok") {
        trackTikTokEvent("PaymentFailed", {
          value: params.value || 0,
          currency: params.currency || "AUD",
          order_id: params.orderId,
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
    trackPaymentFailed,
    trackCustomEvent,
  };
}
