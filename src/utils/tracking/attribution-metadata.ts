/**
 * Utilities to convert AttributionParams to Stripe metadata format.
 * Uses attr_ prefix for attribution keys (Stripe allows 50 keys, 500 chars/value).
 *
 * @see docs/PAYMENT_ATTRIBUTION.md
 */

import type { AttributionParams } from "@/types/tracking";

/**
 * Build Stripe metadata object with attr_* keys from attribution params.
 * Only includes non-empty values.
 */
export function buildAttributionMetadata(attribution?: AttributionParams | null): Record<string, string> {
  if (!attribution || typeof attribution !== "object") return {};

  const meta: Record<string, string> = {};
  if (attribution.utm_source) meta.attr_utm_source = attribution.utm_source;
  if (attribution.utm_medium) meta.attr_utm_medium = attribution.utm_medium;
  if (attribution.utm_campaign) meta.attr_utm_campaign = attribution.utm_campaign;
  if (attribution.utm_content) meta.attr_utm_content = attribution.utm_content;
  if (attribution.utm_term) meta.attr_utm_term = attribution.utm_term;
  if (attribution.campaign_id) meta.attr_campaign_id = attribution.campaign_id;
  if (attribution.adset_id) meta.attr_adset_id = attribution.adset_id;
  if (attribution.ad_id) meta.attr_ad_id = attribution.ad_id;

  return meta;
}
