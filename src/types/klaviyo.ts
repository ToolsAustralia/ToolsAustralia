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

  /** Total entries on next successful renewal; set when subscription is past_due / unpaid; null clears in Klaviyo */
  past_due_renewal_entries?: number | null;

  // Entries and points
  accumulated_entries: number;
  rewards_points: number;

  // Purchase history (detailed)
  total_one_time_packages: number;
  total_mini_draw_packages: number;
  last_purchase_date?: string;
  first_purchase_date?: string;

  // Upsell data
  total_upsells_purchased: number;
  /**
   * RETIRED 2026-08-26 — always written as `null` to CLEAR them in Klaviyo.
   *
   * Their only writer (`POST /api/upsell/track`, called from `UpsellManager.tsx`) is mounted
   * nowhere, so they read 0 for all 56,360 users while 2,290 had real upsell purchases.
   * `null` clears; `undefined` is stripped by `cleanProperties` and would leave stale zeros.
   */
  upsell_total_shown?: number | null;
  upsell_total_accepted?: number | null;
  upsell_total_declined?: number | null;
  upsell_conversion_rate?: number | null;
  upsell_last_interaction?: string | null;

  // Referral program
  referral_code?: string;
  referral_successful_conversions?: number;
  referral_total_entries_awarded?: number;

  // Lifetime value & spending
  lifetime_value?: number;
  total_spent?: number;

  // Profile completion
  profile_setup_completed?: boolean;

  /** Mirrors app User.acceptsPromotionalEmail; Klaviyo subscription object is source of truth for deliverability */
  app_accepts_promotional_email?: boolean;

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

  // Newsletter signup
  newsletter_subscriber?: boolean;
  newsletter_subscribed_at?: string;
  source?: string;

  // Brand interest tracking (for users who signed up but haven't purchased)
  brand_interest?: string | null; // Brand name (e.g., "milwaukee", "dewalt", "makita") - set to null when user makes any purchase to remove tag

  // Entry breakdown by source (for advanced segmentation)
  member_entries?: number; // Total entries from subscriptions
  one_time_entries?: number; // Total entries from one-time packages
  upsell_entries?: number; // Total entries from upsell purchases
  mini_draw_entries?: number; // Total entries from mini-draw packages

  // Draw-specific properties (reset when new draw activates)
  current_draw_id?: string; // ID of current active major draw
  current_draw_name?: string; // Name of current active major draw (human-readable)
  current_draw_start_date?: string; // activationDate of current draw (ISO string)
  current_draw_subscription_active: boolean; // Subscribed DURING current draw period
  current_draw_one_time_packages: number; // One-time packages purchased DURING current draw
  current_draw_entries: number; // Total entries allocated to current draw

  // Canonical profile properties (added 2026-05-28).
  // See docs/tracking/KLAVIYO_INTEGRATION.md "Canonical property names" for the full schema.
  // These coexist with legacy `subscription_status` (which keeps raw Stripe values) —
  // existing Klaviyo flows / segments / templates wired against the legacy property
  // continue to work; new work uses these canonical names.
  /** Coerced membership lifecycle state for segment filters. Profile-only — not an event property. */
  membership_status?: "active" | "past_due" | "canceled" | "paused" | "never_subscribed";
  /** Lifetime entry count across all sources (member + one-time + upsell + mini-draw). */
  entries_purchased?: number;
  /** Count of distinct draws (Major + Mini) the user has at least one entry in. */
  giveaways_entered?: number;
  /** Months elapsed since subscription start date (date-fns differenceInMonths). null when never subscribed. */
  membership_active_duration_months?: number | null;
  /** ISO 8601 string of the next renewal date when an active subscription has auto-renew on. null otherwise. */
  next_renewal_date?: string | null;
}

export interface KlaviyoProfile {
  email: string;
  first_name?: string;
  last_name?: string;
  phone_number?: string;
  // Note: email_consent and sms_consent are NOT valid fields in profile attributes
  // Both email and SMS consent must be handled via list subscriptions
  // Use subscribeToSMSList for SMS and subscribe to email lists for email consent
  properties?: Partial<KlaviyoProfileProperties>;
}

/**
 * Klaviyo event properties
 *
 * Supports Klaviyo's special field names including:
 * - $value: Top-level numeric property for revenue calculation (REQUIRED for revenue metrics)
 * - Currency: ISO currency code (e.g., "AUD")
 * - Order ID: Unique order identifier with space (for deduplication)
 * - Any other custom properties
 *
 * The index signature allows flexible property names including special characters
 * and spaces, which are required for Klaviyo's revenue schema.
 */
export interface KlaviyoEventProperties {
  // user_id is OPTIONAL because canonical events (added 2026-05-28) may fire for
  // anonymous users — e.g. `Viewed Giveaway` from a never-cookied visitor lands as
  // anonymous in Klaviyo until they later identify. All legacy events continue to
  // emit user_id; new canonical events emit it when available and omit it when not
  // (per the no-sentinel rule in docs/tracking/KLAVIYO_INTEGRATION.md).
  user_id?: string;
  [key: string]: string | number | boolean | undefined | null | unknown[] | Record<string, unknown>;
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
  /**
   * Optional idempotency key for the Klaviyo Events API. `"timeout"` is
   * explicitly retryable (MAX_RETRIES = 5 in src/lib/klaviyo.ts), so an
   * accepted-but-slow POST can otherwise be delivered multiple times. Omitted
   * entirely from the outbound payload when unset — never sent as
   * undefined/null — to keep every existing event byte-identical.
   */
  unique_id?: string;
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
