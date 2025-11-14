/**
 * Klaviyo Type Definitions
 *
 * Centralized type definitions for all Klaviyo integrations.
 * Follow the factory pattern - easy to add new events without changing core logic.
 *
 * @module types/klaviyo
 */

// ============================================================
// CORE TYPES
// ============================================================

/**
 * Klaviyo profile properties (user attributes)
 * Used for customer segmentation and personalization
 */
export interface KlaviyoProfileProperties {
  // Basic user info
  user_id: string;
  created_at: string;
  last_login?: string;
  is_active: boolean;
  role: string;
  state?: string; // Australian state/territory

  // Verification status
  is_email_verified: boolean;
  is_mobile_verified: boolean;

  // Subscription details
  has_active_subscription: boolean;
  subscription_tier?: string;
  subscription_start_date?: string;
  subscription_end_date?: string;
  subscription_auto_renew?: boolean;
  subscription_status?: string;

  // Entries and points
  accumulated_entries: number;
  rewards_points: number;

  // Major draw entries (detailed - totals, not counts)
  total_major_draw_entries: number; // Sum of all entryCount values
  major_draw_entries_from_subscription: number; // Sum of entryCount from membership
  major_draw_entries_from_one_time: number; // Sum of entryCount from one-time packages
  major_draw_entries_from_upsell: number; // Sum of entryCount from upsell purchases
  major_draw_entries_from_mini_draw: number; // Sum of entryCount from mini-draw packages

  // Purchase history (detailed)
  total_one_time_packages: number;
  total_mini_draw_packages: number;
  last_purchase_date?: string;
  first_purchase_date?: string;

  // Upsell data (simplified)
  total_upsells_purchased: number;

  // Engagement metrics - removed days_since_registration (redundant with created_at)

  // Major draw participation
  major_draw_id?: string; // Current major draw ID user is participating in
}

export interface KlaviyoProfile {
  email: string;
  first_name?: string;
  last_name?: string;
  phone_number?: string;
  properties?: Partial<KlaviyoProfileProperties>;
}

export interface KlaviyoEventProperties {
  user_id: string;
  [key: string]: string | number | boolean | undefined | null;
}

export interface KlaviyoEvent {
  event: string;
  customer_properties: {
    email: string;
    first_name?: string;
    last_name?: string;
    phone_number?: string;
  };
  properties: KlaviyoEventProperties;
  time?: number;
}

export interface KlaviyoApiResponse {
  success: boolean;
  error?: string;
  data?: unknown;
}

export interface KlaviyoProfileResponse extends KlaviyoApiResponse {
  profile_id?: string;
}

export interface KlaviyoEventResponse extends KlaviyoApiResponse {
  event_id?: string;
}

export interface TrackEventOptions {
  skipIfDisabled?: boolean;
  retryOnFailure?: boolean;
  logToConsole?: boolean;
}
