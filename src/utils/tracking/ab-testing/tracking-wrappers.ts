import { trackFacebookEvent } from "@/components/FacebookPixel";
import { trackTikTokEvent } from "@/components/TikTokPixel";
import { trackKlaviyoEvent } from "@/utils/tracking/klaviyo-helpers";
import { sendFacebookEvent, type FacebookEvent } from "@/lib/facebook";
import { enhanceFacebookEvent } from "./pixel-integration";
import { attachExperimentMetadata } from "./experiment-metadata";

/**
 * Track page view with experiment metadata
 */
export async function trackPageViewWithExperiment(
  url: string,
  experimentId: string | null,
  variantId: string | null
): Promise<void> {
  if (!experimentId || !variantId) {
    return;
  }

  try {
    // Enhance event parameters
    const enhancedParams = attachExperimentMetadata({ url }, experimentId, variantId);

    // Track with existing pixel functions
    trackFacebookEvent("PageView", enhancedParams);
    trackTikTokEvent("ViewContent", enhancedParams);
    trackKlaviyoEvent("Page View", enhancedParams);
  } catch (error) {
    console.error("Error tracking page view with experiment:", error);
  }
}

/**
 * Track purchase with experiment metadata
 */
export async function trackPurchaseWithExperiment(
  params: {
    value: number;
    currency: string;
    orderId: string;
    [key: string]: unknown;
  },
  experimentId: string | null,
  variantId: string | null
): Promise<void> {
  if (!experimentId || !variantId) {
    return;
  }

  try {
    // Enhance event parameters
    const enhancedParams = attachExperimentMetadata(params, experimentId, variantId);

    // Track with existing pixel functions
    trackFacebookEvent("Purchase", enhancedParams);
    trackTikTokEvent("CompletePayment", enhancedParams);
    trackKlaviyoEvent("Placed Order", enhancedParams);

    // Also enhance and send to Facebook CAPI
    const facebookEvent = await enhanceFacebookEvent(
      {
        event_name: "Purchase",
        event_time: Math.floor(Date.now() / 1000),
        action_source: "website",
        user_data: {},
        custom_data: {
          currency: params.currency,
          value: params.value,
          order_id: params.orderId,
          ...enhancedParams,
        },
      } as FacebookEvent,
      experimentId,
      variantId
    );

    await sendFacebookEvent(facebookEvent);
  } catch (error) {
    console.error("Error tracking purchase with experiment:", error);
  }
}

/**
 * Track lead with experiment metadata
 */
export async function trackLeadWithExperiment(
  params: {
    [key: string]: unknown;
  },
  experimentId: string | null,
  variantId: string | null
): Promise<void> {
  if (!experimentId || !variantId) {
    return;
  }

  try {
    // Enhance event parameters
    const enhancedParams = attachExperimentMetadata(params, experimentId, variantId);

    // Track with existing pixel functions
    trackFacebookEvent("Lead", enhancedParams);
    trackTikTokEvent("CompleteRegistration", enhancedParams);
    trackKlaviyoEvent("Started Checkout", enhancedParams);
  } catch (error) {
    console.error("Error tracking lead with experiment:", error);
  }
}

