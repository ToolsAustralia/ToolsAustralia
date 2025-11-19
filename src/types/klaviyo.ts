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
  profession?: string; // User's profession

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

  // Major draw entries (accurate from database - single source of truth)
  total_major_draw_entries: number; // Sum of all entryCount values from majordraws collection

  // Purchase history (detailed)
  total_one_time_packages: number;
  total_mini_draw_packages: number;
  last_purchase_date?: string;
  first_purchase_date?: string;

  // Upsell data
  total_upsells_purchased: number;
  upsell_total_shown?: number;
  upsell_total_accepted?: number;
  upsell_total_declined?: number;
  upsell_conversion_rate?: number;
  upsell_last_interaction?: string;

  // Referral program
  referral_code?: string;
  referral_successful_conversions?: number;
  referral_total_entries_awarded?: number;

  // Lifetime value & spending
  lifetime_value?: number;
  total_spent?: number;

  // Profile completion
  profile_setup_completed?: boolean;

  // Partner discount status
  partner_discount_active?: boolean;
  partner_discount_queued_count?: number;
  partner_discount_total_days?: number;
  partner_discount_next_activation_date?: string;

  // Subscription lifecycle tracking
  subscription_has_pending_upgrade?: boolean;
  subscription_previous_tier?: string;
  subscription_last_upgrade_date?: string;
  subscription_last_downgrade_date?: string;
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
