/**
 * TypeScript interfaces and types for Facebook Pixel tracking
 * Centralized type definitions for consistent tracking across the application
 *
 * @author Senior Full-Stack Developer
 * @version 1.0.0
 */

/**
 * User type for tracking - indicates authentication status
 */
export type UserType = "guest" | "member";

/**
 * Page metadata extracted from route information
 */
export interface PageMetadata {
  page_type: string;
  page_name: string;
  page_url: string;
}

/**
 * UTM parameters extracted from URL
 */
export interface UTMParams {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
}

/**
 * Extended attribution parameters including UTM and platform-specific IDs.
 * Used for payment attribution to track revenue by source (facebook, klaviyo, tiktok, etc.)
 * and optionally by campaign/adset/ad level.
 *
 * @see docs/PAYMENT_ATTRIBUTION.md
 */
export interface AttributionParams extends UTMParams {
  utm_content?: string;
  utm_term?: string;
  campaign_id?: string;
  adset_id?: string;
  ad_id?: string;
}

/**
 * Referrer information parsed from referrer URL
 */
export interface ReferrerInfo {
  referrer: string;
  referrer_domain: string;
}

/**
 * Base interface for tracking parameters
 * All tracking events should extend or include these common parameters
 */
export interface TrackingParams {
  user_type?: UserType;
  platform?: string;
  page_type?: string;
  page_url?: string;
  [key: string]: unknown;
}


