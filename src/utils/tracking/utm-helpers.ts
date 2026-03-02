/**
 * UTM Parameter Helper Utilities
 *
 * Extracts UTM parameters from URLs or URLSearchParams.
 * Used by utm-storage, register API, promo tracking, and Facebook CAPI.
 *
 * @see docs/UTM_ATTRIBUTION.md
 * @see docs/PAYMENT_ATTRIBUTION.md
 */

import type { UTMParams, AttributionParams } from "@/types/tracking";

/**
 * Extracts UTM parameters from URL or URLSearchParams
 *
 * @param urlOrParams - Either a URL string or URLSearchParams object
 * @returns UTMParams object with utm_source, utm_medium, utm_campaign (all optional)
 *
 * @example
 * // Client-side usage
 * const params = extractUTMParams("https://example.com?utm_source=facebook&utm_medium=cpc");
 * // Returns: { utm_source: "facebook", utm_medium: "cpc" }
 *
 * @example
 * // Server-side usage
 * const searchParams = new URLSearchParams(request.url.split("?")[1]);
 * const params = extractUTMParams(searchParams);
 * // Returns: { utm_source: "facebook", utm_medium: "cpc" }
 */
export function extractUTMParams(urlOrParams: string | URLSearchParams): UTMParams {
  const attribution = extractAttributionParams(urlOrParams);
  return {
    utm_source: attribution.utm_source,
    utm_medium: attribution.utm_medium,
    utm_campaign: attribution.utm_campaign,
  };
}

/**
 * Extracts full attribution parameters including UTM and platform-specific IDs
 * (campaign_id, adset_id, ad_id) from URL or URLSearchParams.
 * Used for payment attribution to track revenue by source and campaign/adset/ad level.
 *
 * @param urlOrParams - Either a URL string or URLSearchParams object
 * @returns AttributionParams object
 *
 * @example
 * const params = extractAttributionParams("https://site.com?utm_source=facebook&campaign_id=123");
 * // Returns: { utm_source: "facebook", campaign_id: "123" }
 */
export function extractAttributionParams(urlOrParams: string | URLSearchParams): AttributionParams {
  try {
    let searchParams: URLSearchParams;

    // Handle both URL string and URLSearchParams
    if (typeof urlOrParams === "string") {
      // If it's a full URL, extract search params
      if (urlOrParams.includes("?")) {
        const url = new URL(urlOrParams);
        searchParams = url.searchParams;
      } else if (urlOrParams.includes("=")) {
        // If it's just query string, parse it directly
        searchParams = new URLSearchParams(urlOrParams);
      } else {
        // Try to parse as URL
        try {
          const url = new URL(urlOrParams);
          searchParams = url.searchParams;
        } catch {
          return {};
        }
      }
    } else {
      searchParams = urlOrParams;
    }

    const params: AttributionParams = {};

    const utmSource = searchParams.get("utm_source");
    const utmMedium = searchParams.get("utm_medium");
    const utmCampaign = searchParams.get("utm_campaign");
    const utmContent = searchParams.get("utm_content");
    const utmTerm = searchParams.get("utm_term");
    const campaignId = searchParams.get("campaign_id");
    const adsetId = searchParams.get("adset_id");
    const adId = searchParams.get("ad_id");

    if (utmSource) params.utm_source = utmSource;
    if (utmMedium) params.utm_medium = utmMedium;
    if (utmCampaign) params.utm_campaign = utmCampaign;
    if (utmContent) params.utm_content = utmContent;
    if (utmTerm) params.utm_term = utmTerm;
    if (campaignId) params.campaign_id = campaignId;
    if (adsetId) params.adset_id = adsetId;
    if (adId) params.ad_id = adId;

    return params;
  } catch {
    return {};
  }
}
