import { FacebookEvent } from "@/lib/facebook";
import { getExperimentMetadata } from "./experiment-metadata";

/**
 * Enhance Facebook Pixel/CAPI event with experiment metadata
 */
export async function enhanceFacebookEvent(
  event: FacebookEvent,
  experimentId: string | null,
  variantId: string | null
): Promise<FacebookEvent> {
  if (!experimentId || !variantId) {
    return event;
  }

  // Fetch experiment and variant names
  const metadata = await getExperimentMetadata(experimentId, variantId);

  // Add experiment metadata to custom_data
  // Note: Facebook's custom_data type doesn't include experiment fields, but we can extend it
  return {
    ...event,
    custom_data: {
      ...event.custom_data,
      experiment_id: experimentId,
      variant_id: variantId,
      ...(metadata.experimentName && { experiment_name: metadata.experimentName }),
      ...(metadata.variantName && { variant_name: metadata.variantName }),
    } as typeof event.custom_data & {
      experiment_id?: string;
      variant_id?: string;
      experiment_name?: string;
      variant_name?: string;
    },
  };
}

/**
 * Enhance TikTok Pixel event with experiment metadata
 */
export function enhanceTikTokEvent(
  event: Record<string, unknown>,
  experimentId: string | null,
  variantId: string | null
): Record<string, unknown> {
  if (!experimentId || !variantId) {
    return event;
  }

  return {
    ...event,
    experiment_id: experimentId,
    variant_id: variantId,
    // Note: Names would need to be fetched async - for now just IDs
  };
}

/**
 * Enhance Klaviyo event with experiment metadata
 */
export function enhanceKlaviyoEvent(
  event: Record<string, unknown>,
  experimentId: string | null,
  variantId: string | null
): Record<string, unknown> {
  if (!experimentId || !variantId) {
    return event;
  }

  return {
    ...event,
    experiment_id: experimentId,
    variant_id: variantId,
    // Note: Names would need to be fetched async - for now just IDs
  };
}

