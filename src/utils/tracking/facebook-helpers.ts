/**
 * Facebook Pixel Helper Utilities
 *
 * Provides utility functions for Facebook Pixel tracking including:
 * - Facebook Click ID (fbc) extraction from URL
 * - Facebook Browser ID (fbp) extraction from cookies
 * - Event ID generation for deduplication
 * - User data preparation for Conversions API
 *
 * @author Senior Full-Stack Developer
 * @version 1.0.0
 */

import { hashData } from "@/lib/facebook";

/**
 * Extract Facebook Click ID (fbc) from URL parameters
 * Format: fbclid=xxxxx or fbc parameter
 * @returns Facebook Click ID if found, undefined otherwise
 */
export function getFBCFromURL(): string | undefined {
  if (typeof window === "undefined") return undefined;

  try {
    const urlParams = new URLSearchParams(window.location.search);
    // Check for fbclid parameter (standard Facebook click ID)
    const fbclid = urlParams.get("fbclid");
    if (fbclid) {
      // Format: fb.1.{timestamp}.{click_id}
      const timestamp = Date.now();
      return `fb.1.${timestamp}.${fbclid}`;
    }

    // Check for fbc parameter (already formatted)
    const fbc = urlParams.get("fbc");
    if (fbc) {
      return fbc;
    }

    return undefined;
  } catch (error) {
    console.warn("Error extracting fbc from URL:", error);
    return undefined;
  }
}

/**
 * Extract Facebook Browser ID (fbp) from cookies
 * Facebook Pixel automatically sets _fbp cookie
 * @returns Facebook Browser ID if found, undefined otherwise
 */
export function getFBPFromCookie(): string | undefined {
  if (typeof window === "undefined") return undefined;

  try {
    // Get _fbp cookie value
    const cookies = document.cookie.split(";");
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split("=");
      if (name === "_fbp" && value) {
        return value;
      }
    }

    return undefined;
  } catch (error) {
    console.warn("Error extracting fbp from cookie:", error);
    return undefined;
  }
}

/**
 * Generate a unique event ID for Facebook Pixel deduplication
 * Format: {eventType}_{identifier}_{timestamp}
 *
 * @param eventType - Type of event (e.g., "purchase", "renewal", "payment_failed")
 * @param identifier - Unique identifier (e.g., orderId, subscriptionId, paymentIntentId)
 * @param timestamp - Optional timestamp (defaults to current time)
 * @returns Formatted event ID
 */
export function generateEventID(eventType: string, identifier: string, timestamp?: number): string {
  const ts = timestamp || Date.now();
  return `${eventType}_${identifier}_${ts}`;
}

/**
 * Prepare user data for Facebook Conversions API
 * Hashes PII data according to Facebook requirements
 *
 * @param userData - User data object with optional PII fields
 * @returns Hashed user data object ready for Conversions API
 */
export function prepareUserData(userData?: {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
}): Record<string, string> {
  const hashedData: Record<string, string> = {};

  if (!userData) return hashedData;

  // Hash email (required format: lowercase, trimmed, SHA-256)
  if (userData.email) {
    hashedData.em = hashData(userData.email);
  }

  // Hash phone (required format: digits only, no spaces/special chars, SHA-256)
  if (userData.phone) {
    // Remove all non-digit characters before hashing
    const phoneDigits = userData.phone.replace(/\D/g, "");
    if (phoneDigits) {
      hashedData.ph = hashData(phoneDigits);
    }
  }

  // Hash first name
  if (userData.firstName) {
    hashedData.fn = hashData(userData.firstName);
  }

  // Hash last name
  if (userData.lastName) {
    hashedData.ln = hashData(userData.lastName);
  }

  // Hash city
  if (userData.city) {
    hashedData.ct = hashData(userData.city);
  }

  // Hash state
  if (userData.state) {
    hashedData.st = hashData(userData.state);
  }

  // Hash zip code
  if (userData.zipCode) {
    hashedData.zp = hashData(userData.zipCode);
  }

  // Country (not hashed, just country code)
  if (userData.country) {
    hashedData.country = userData.country.toUpperCase();
  }

  return hashedData;
}

/**
 * Get current page URL for event_source_url
 * @returns Current page URL or undefined if not available
 */
export function getEventSourceURL(): string | undefined {
  if (typeof window === "undefined") return undefined;
  return window.location.href;
}
