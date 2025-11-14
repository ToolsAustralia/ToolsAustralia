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
        fbTrackPurchase(params.value || 0, params.currency || "USD", params.orderId);
      } else if (platform === "tiktok") {
        trackTikTokPurchase(params.value || 0, params.currency || "USD", params.orderId);
      }
    });
  }, []);

  // Add to cart tracking
  const trackAddToCart = useCallback((params: PixelEventParams, platforms?: ("facebook" | "tiktok")[]) => {
    const platformsToTrack = platforms || ["facebook", "tiktok"];

    platformsToTrack.forEach((platform) => {
      if (platform === "facebook") {
        fbTrackAddToCart(params.value || 0, params.currency || "USD", params.productId);
      } else if (platform === "tiktok") {
        trackTikTokAddToCart(params.value || 0, params.currency || "USD", params.productId);
      }
    });
  }, []);

  // Initiate checkout tracking
  const trackInitiateCheckout = useCallback((params: PixelEventParams, platforms?: ("facebook" | "tiktok")[]) => {
    const platformsToTrack = platforms || ["facebook", "tiktok"];

    platformsToTrack.forEach((platform) => {
      if (platform === "facebook") {
        fbTrackInitiateCheckout(params.value || 0, params.currency || "USD", params.numItems);
      } else if (platform === "tiktok") {
        trackTikTokInitiateCheckout(params.value || 0, params.currency || "USD", params.numItems);
      }
    });
  }, []);

  // View content tracking
  const trackViewContent = useCallback((params: PixelEventParams, platforms?: ("facebook" | "tiktok")[]) => {
    const platformsToTrack = platforms || ["facebook", "tiktok"];

    platformsToTrack.forEach((platform) => {
      if (platform === "facebook") {
        fbTrackViewContent(params.value || 0, params.currency || "USD", params.productId);
      } else if (platform === "tiktok") {
        trackTikTokViewContent(params.value || 0, params.currency || "USD", params.productId);
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
        fbTrackCompleteRegistration(params.method);
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
        fbTrackLead(params.value, params.currency || "USD");
      } else if (platform === "tiktok") {
        trackTikTokLead(params.value, params.currency || "USD");
      }
    });
  }, []);

  // Subscribe tracking
  const trackSubscribe = useCallback((params: PixelEventParams, platforms?: ("facebook" | "tiktok")[]) => {
    const platformsToTrack = platforms || ["facebook", "tiktok"];

    platformsToTrack.forEach((platform) => {
      if (platform === "facebook") {
        fbTrackSubscribe(params.value, params.currency || "USD");
      } else if (platform === "tiktok") {
        trackTikTokSubscribe(params.value, params.currency || "USD");
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
    trackCustomEvent,
  };
}
