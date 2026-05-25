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
  trackTikTokSearch,
  trackTikTokCompleteRegistration,
  trackTikTokSubscribe,
  trackTikTokContact,
} from "@/components/TikTokPixel";
import {
  mirrorMetaEventToCapi,
  generateMirrorEventId,
  type MirrorEventName,
  type MirrorUserData,
} from "@/utils/tracking/meta-capi-mirror";
import { tiktokProvider } from "@/lib/tracking/providers";
import { eventTimeNow } from "@/lib/tracking/canonical-event";
import type { CanonicalEvent } from "@/lib/tracking/types";

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
   * Fire a funnel event on the requested platforms' browser pixels AND the server
   * CAPI / Events API, all sharing ONE event_id so each platform dedups its browser
   * event against its server copy. Recovers signal lost to ad blockers / iOS ITP /
   * Safari ETP.
   *
   * - Facebook: browser Pixel (4-arg fbq with eventID) + CAPI via the mirror.
   * - TikTok: browser Pixel (3rd-arg event_id, carrying content_id) + Events API via
   *   the mirror. Fired through `tiktokProvider.pixelTrack` (NOT the legacy
   *   `trackTikTok*` helpers) so it shares the mirror's event_id — fixing the prior
   *   double-count where the legacy pixel used a synthetic id the server never matched.
   *
   * The mirror POSTs to /api/tracking/conversion → sendConversion, which fans out to
   * every enabled provider's CAPI with the SAME event_id and server-enriched identity
   * (hashed email/phone/external_id + ttclid/ttp + IP/UA → high EMQ).
   * See https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events/
   */
  const fireFunnelEvent = (
    eventName: MirrorEventName,
    metaCustomData: Record<string, unknown>,
    platforms: ("facebook" | "tiktok")[] = ["facebook", "tiktok"],
    userData?: MirrorUserData,
  ): void => {
    const eventId = generateMirrorEventId(eventName);

    // Normalize Meta-format custom_data into the canonical shape once, reused by the
    // TikTok pixel and the server mirror so both surfaces carry identical parameters.
    const canonicalCustomData: NonNullable<CanonicalEvent["customData"]> = {
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
      ...(typeof metaCustomData.packageType === "string" && {
        packageType: metaCustomData.packageType,
      }),
    };
    const value = typeof metaCustomData.value === "number" ? metaCustomData.value : undefined;
    const currency = typeof metaCustomData.currency === "string" ? metaCustomData.currency : undefined;

    // Browser pixels — both fire with the SAME eventId for browser↔server dedup.
    if (platforms.includes("facebook")) {
      trackFacebookEvent(eventName, { ...metaCustomData, eventID: eventId });
    }
    if (platforms.includes("tiktok")) {
      tiktokProvider.pixelTrack({
        eventName,
        eventId,
        eventTime: eventTimeNow(),
        value,
        currency,
        customData: canonicalCustomData,
      });
    }

    // Server mirror — fans out to every enabled provider's CAPI/Events API with the
    // SAME eventId. (sendConversion does not filter by `platforms`; the browser-pixel
    // gates above scope per-platform browser coverage. A server-only event for a
    // platform whose browser pixel was skipped is harmless — there's nothing to dedup.)
    mirrorMetaEventToCapi({ eventName, eventId, value, currency, customData: canonicalCustomData, userData });
  };

  // Add to cart — hybrid Pixel + CAPI/Events API via shared event_id (FB + TikTok)
  const trackAddToCart = useCallback((params: PixelEventParams, platforms?: ("facebook" | "tiktok")[]) => {
    fireFunnelEvent("AddToCart", buildMetaCustomData(params, { content_type: "product" }), platforms);
  }, []);

  // Initiate checkout — hybrid Pixel + CAPI/Events API via shared event_id (FB + TikTok)
  const trackInitiateCheckout = useCallback((params: PixelEventParams, platforms?: ("facebook" | "tiktok")[], userData?: MirrorUserData) => {
    fireFunnelEvent("InitiateCheckout", buildMetaCustomData(params, { content_type: "product" }), platforms, userData);
  }, []);

  // View content — hybrid Pixel + CAPI/Events API. Custom params (content_category, content_name,
  // brand, page_type, user_type) flow through unchanged to support catalog matching and DPAs.
  const trackViewContent = useCallback((params: PixelEventParams, platforms?: ("facebook" | "tiktok")[]) => {
    fireFunnelEvent(
      "ViewContent",
      buildMetaCustomData(params, { content_type: "product", platform: "tools-australia-website" }),
      platforms,
    );
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

  // Lead tracking — hybrid Pixel + CAPI/Events API via shared event_id (FB + TikTok).
  // TikTok fires the "Lead" standard event (the current name; legacy "SubmitForm" was renamed).
  const trackLead = useCallback((params: PixelEventParams, platforms?: ("facebook" | "tiktok")[]) => {
    fireFunnelEvent("Lead", buildMetaCustomData(params, { content_type: "lead" }), platforms);
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
  // Fired by CardFormSection once the payment form is complete, with billing-derived
  // userData for CAPI identity matching.
  const trackAddPaymentInfo = useCallback((params: PixelEventParams, platforms?: ("facebook" | "tiktok")[], userData?: MirrorUserData) => {
    // AddPaymentInfo is a TikTok standard web event, so it flows through the unified
    // funnel path (browser pixel with content_id + shared event_id + Events API mirror).
    fireFunnelEvent("AddPaymentInfo", buildMetaCustomData(params, { content_type: "product" }), platforms, userData);
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
