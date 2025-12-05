/**
 * UTM Parameter Helper Utilities
 *
 * Provides utility functions for extracting UTM parameters from URLs.
 * Works for both client-side (URL string) and server-side (URLSearchParams) usage.
 *
 * @author Senior Full-Stack Developer
 * @version 1.0.0
 */

import type { UTMParams } from "@/types/tracking";

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
          // If it fails, treat as empty
          return {};
        }
      }
    } else {
      searchParams = urlOrParams;
    }

    const params: UTMParams = {};

    // Extract UTM parameters
    const utmSource = searchParams.get("utm_source");
    const utmMedium = searchParams.get("utm_medium");
    const utmCampaign = searchParams.get("utm_campaign");

    if (utmSource) params.utm_source = utmSource;
    if (utmMedium) params.utm_medium = utmMedium;
    if (utmCampaign) params.utm_campaign = utmCampaign;

    return params;
  } catch (error) {
    // Return empty object on error (graceful degradation)
    if (process.env.NODE_ENV === "development") {
      // console.warn("Error extracting UTM parameters:", error);
    }
    return {};
  }
}
