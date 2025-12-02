/**
 * Referrer Helper Utilities
 *
 * Provides utility functions for parsing referrer URLs and extracting domains.
 * Handles edge cases like empty referrers, same-origin referrers, and invalid URLs.
 *
 * @author Senior Full-Stack Developer
 * @version 1.0.0
 */

import type { ReferrerInfo } from "@/types/tracking";

/**
 * Parses referrer URL and extracts domain information
 *
 * @param referrer - The referrer URL string (e.g., "https://google.com/search?q=...")
 * @returns ReferrerInfo object with referrer URL and extracted domain
 *
 * @example
 * const info = parseReferrer("https://google.com/search?q=tools");
 * // Returns: { referrer: "https://google.com/search?q=tools", referrer_domain: "google.com" }
 *
 * @example
 * const info = parseReferrer("");
 * // Returns: { referrer: "", referrer_domain: "" }
 */
export function parseReferrer(referrer: string): ReferrerInfo {
  try {
    // Handle empty or missing referrer
    if (!referrer || referrer.trim() === "") {
      return {
        referrer: "",
        referrer_domain: "",
      };
    }

    // Try to parse as URL
    let referrerDomain = "";
    try {
      const url = new URL(referrer);
      referrerDomain = url.hostname;

      // Remove www. prefix for cleaner domain names
      if (referrerDomain.startsWith("www.")) {
        referrerDomain = referrerDomain.substring(4);
      }
    } catch {
      // If URL parsing fails, try to extract domain manually
      // This handles edge cases like malformed URLs
      const match = referrer.match(/^(?:https?:\/\/)?(?:www\.)?([^\/]+)/i);
      if (match && match[1]) {
        referrerDomain = match[1].toLowerCase();
      }
    }

    return {
      referrer: referrer,
      referrer_domain: referrerDomain,
    };
  } catch (error) {
    // Return safe defaults on error
    if (process.env.NODE_ENV === "development") {
      console.warn("Error parsing referrer:", error);
    }
    return {
      referrer: referrer || "",
      referrer_domain: "",
    };
  }
}
