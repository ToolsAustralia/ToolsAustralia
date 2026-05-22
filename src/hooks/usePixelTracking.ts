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
import {
  mirrorMetaEventToCapi,
  generateMirrorEventId,
  type MirrorEventName,
} from "@/utils/tracking/meta-capi-mirror";

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

  /**
   * Fire a Meta funnel event via both browser Pixel (4-arg fbq with eventID) AND
   * server CAPI mirror (POST to /api/tracking/conversion with the SAME event_id).
   * Meta merges them in Events Manager via dedup. Recovers signal that ad blockers /
   * iOS ITP / Safari ETP would otherwise drop from the browser-only path.
   * See https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events/
   */
  const fireMetaFunnelEvent = (
    eventName: MirrorEventName,
    metaCustomData: Record<string, unknown>,
  ): void => {
    const eventId = generateMirrorEventId(eventName);
    // Browser Pixel — trackFacebookEvent uses 4-arg fbq when eventID is present
    trackFacebookEvent(eventName, { ...metaCustomData, eventID: eventId });
    // Server CAPI mirror via canonical sendConversion — fans out to FB CAPI today,
    // TikTok/Snap CAPI when those provider stubs are implemented.
    mirrorMetaEventToCapi({
      eventName,
      eventId,
      value: typeof metaCustomData.value === "number" ? metaCustomData.value : undefined,
      currency: typeof metaCustomData.currency === "string" ? metaCustomData.currency : undefined,
      customData: {
        ...(Array.isArray(metaCustomData.content_ids) && {
          contentIds: metaCustomData.content_ids as string[],
        }),
        ...(typeof metaCustomData.content_type === "string" && {
          contentType: metaCustomData.content_type,
        }),
        ...(typeof metaCustomData.content_name === "string" && {
          contentName: metaCustomData.content_name,
        }),
        ...(typeof metaCustomData.content_category === "string" && {
          contentCategory: metaCustomData.content_category,
        }),
        ...(typeof metaCustomData.num_items === "number" && {
          numItems: metaCustomData.num_items,
        }),
        ...(typeof metaCustomData.order_id === "string" && {
          orderId: metaCustomData.order_id,
        }),
      },
    });
  };

  // Add to cart — hybrid Pixel + CAPI mirror via shared event_id
  const trackAddToCart = useCallback((params: PixelEventParams, platforms?: ("facebook" | "tiktok")[]) => {
    const platformsToTrack = platforms || ["facebook", "tiktok"];

    platformsToTrack.forEach((platform) => {
      if (platform === "facebook") {
        fireMetaFunnelEvent("AddToCart", buildMetaCustomData(params, { content_type: "product" }));
      } else if (platform === "tiktok") {
        trackTikTokAddToCart(params.value || 0, params.currency || "AUD", params.productId);
      }
    });
  }, []);

  // Initiate checkout — hybrid Pixel + CAPI mirror
  const trackInitiateCheckout = useCallback((params: PixelEventParams, platforms?: ("facebook" | "tiktok")[]) => {
    const platformsToTrack = platforms || ["facebook", "tiktok"];

    platformsToTrack.forEach((platform) => {
      if (platform === "facebook") {
        fireMetaFunnelEvent("InitiateCheckout", buildMetaCustomData(params, { content_type: "product" }));
      } else if (platform === "tiktok") {
        trackTikTokInitiateCheckout(params.value || 0, params.currency || "AUD", params.numItems);
      }
    });
  }, []);

  // View content — hybrid Pixel + CAPI mirror. Custom params (content_category, content_name,
  // brand, page_type, user_type) flow through unchanged to support catalog matching and DPAs.
  const trackViewContent = useCallback((params: PixelEventParams, platforms?: ("facebook" | "tiktok")[]) => {
    const platformsToTrack = platforms || ["facebook", "tiktok"];

    platformsToTrack.forEach((platform) => {
      if (platform === "facebook") {
        fireMetaFunnelEvent(
          "ViewContent",
          buildMetaCustomData(params, {
            content_type: "product",
            platform: "tools-australia-website",
          }),
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

  // Lead tracking — hybrid Pixel + CAPI mirror
  const trackLead = useCallback((params: PixelEventParams, platforms?: ("facebook" | "tiktok")[]) => {
    const platformsToTrack = platforms || ["facebook", "tiktok"];

    platformsToTrack.forEach((platform) => {
      if (platform === "facebook") {
        fireMetaFunnelEvent("Lead", buildMetaCustomData(params, { content_type: "lead" }));
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

  // Add payment info tracking — hybrid Pixel + CAPI mirror.
  // Currently no caller (mock /checkout was removed). When the real shop ships,
  // fire this once on payment-form completion.
  const trackAddPaymentInfo = useCallback((params: PixelEventParams, platforms?: ("facebook" | "tiktok")[]) => {
    const platformsToTrack = platforms || ["facebook", "tiktok"];

    platformsToTrack.forEach((platform) => {
      if (platform === "facebook") {
        fireMetaFunnelEvent("AddPaymentInfo", buildMetaCustomData(params, { content_type: "product" }));
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
