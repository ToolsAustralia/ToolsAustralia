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
import { MEMBERSHIP_PACKAGES_QUERY_PARAM, parseMembershipPackagesTab } from "@/utils/membership/packagesTabParam";

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
      // A BARE query string — "?utm_source=…", exactly what window.location.search returns.
      // This case must be tested BEFORE the includes("?") branch below: it contains a "?", so
      // it used to fall into the full-URL branch, where `new URL("?utm_source=…")` throws on a
      // relative string, the outer try swallowed it, and the function returned {}.
      //
      // That silently broke every client-side UTM capture: `useUTMPersistence` passes
      // `window.location.search` verbatim, so `_ta_attr`, `_ta_attr_last` and the sessionStorage
      // UTM copy were NEVER written — confirmed absent on production after landing with UTMs
      // (2026-08-10). It failed closed and without an error, so nothing surfaced it.
      // `URLSearchParams` strips the leading "?" itself, so it is the right parser here.
      if (urlOrParams.startsWith("?")) {
        searchParams = new URLSearchParams(urlOrParams);
      } else if (urlOrParams.includes("?")) {
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

    // Landing-URL packages focus. Reuse the canonical parser; membership is the
    // default (expressed by absence) so only "one-time" is ever captured.
    const packagesTab = parseMembershipPackagesTab(searchParams.get(MEMBERSHIP_PACKAGES_QUERY_PARAM));
    if (packagesTab === "one-time") params.packages_focus = "one-time";

    return params;
  } catch {
    return {};
  }
}
