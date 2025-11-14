/**
 * Klaviyo Helper Utilities
 *
 * Reusable utility functions for Klaviyo integration.
 * DRY principle - avoid code duplication.
 *
 * @module utils/klaviyoHelpers
 */

import type { IUser } from "@/models/User";
import type { KlaviyoProfile } from "@/types/klaviyo";
import { getStateByCode } from "@/data/australianStates";

/**
 * Convert User model to Klaviyo profile
 * Transforms MongoDB user data to Klaviyo format
 */
export async function userToKlaviyoProfile(user: IUser): Promise<KlaviyoProfile> {
  const phone = user.mobile
    ? user.mobile.startsWith("+")
      ? user.mobile
      : `+61${user.mobile.replace(/^0/, "")}`
    : undefined;

  // ✅ OPTION 1: Calculate major draw entries from majordraws collection (single source of truth)
  const { getUserTotalAccumulatedEntries } = await import("../../database/queries/major-draw-queries");
  const totalMajorDrawEntries = await getUserTotalAccumulatedEntries(user._id);

  // For Klaviyo, we'll use a simplified breakdown since we're moving to single source of truth
  const majorDrawEntriesFromSubscription = user.subscription?.isActive ? (user.accumulatedEntries || 0) * 0.7 : 0; // Estimate 70% from subscription
  const majorDrawEntriesFromOneTime = (user.accumulatedEntries || 0) * 0.3; // Estimate 30% from one-time
  const majorDrawEntriesFromUpsell = 0; // Will be calculated from actual data when needed
  const majorDrawEntriesFromMiniDraw = 0; // Will be calculated from actual data when needed

  // No need to calculate days since registration (redundant with created_at)

  // No need to calculate upsell entries total anymore

  // Get current major draw info (from the most recent major draw entry)
  // Note: This will be updated to use the new helper functions when needed
  // For now, we'll use the majorDrawId and let the frontend handle the name lookup

  const klaviyoProfile = {
    email: user.email,
    first_name: user.firstName,
    last_name: user.lastName,
    phone_number: phone,
    properties: {
      // Basic user info
      user_id: user._id.toString(),
      created_at: user.createdAt.toISOString(),
      last_login: user.lastLogin?.toISOString(),
      is_active: user.isActive,
      role: user.role,
      state: user.state ? getStateByCode(user.state)?.name : undefined,

      // Verification status
      is_email_verified: user.isEmailVerified || false,
      is_mobile_verified: user.isMobileVerified || false,

      // Subscription details
      has_active_subscription: user.subscription?.isActive || false,
      subscription_tier: user.subscription?.packageId,
      subscription_start_date: user.subscription?.startDate?.toISOString(),
      subscription_end_date: user.subscription?.endDate?.toISOString(),
      subscription_auto_renew: user.subscription?.autoRenew,
      subscription_status: user.subscription?.status,

      // Entries and points
      accumulated_entries: user.accumulatedEntries || 0,
      rewards_points: user.rewardsPoints || 0,

      // Major draw entries (detailed)
      total_major_draw_entries: totalMajorDrawEntries,
      major_draw_entries_from_subscription: majorDrawEntriesFromSubscription,
      major_draw_entries_from_one_time: majorDrawEntriesFromOneTime,
      major_draw_entries_from_upsell: majorDrawEntriesFromUpsell,
      major_draw_entries_from_mini_draw: majorDrawEntriesFromMiniDraw,

      // Purchase history (detailed)
      total_one_time_packages: user.oneTimePackages?.length || 0,
      total_mini_draw_packages: user.miniDrawPackages?.length || 0,
      last_purchase_date: getLastPurchaseDate(user),
      first_purchase_date: getFirstPurchaseDate(user),

      // Upsell data (simplified)
      total_upsells_purchased: user.upsellPurchases?.length || 0,

      // Engagement metrics - removed days_since_registration (redundant with created_at)

      // Major draw participation - simplified for single source of truth
      major_draw_id: undefined, // Will be populated from majordraws collection when needed
    },
  };

  // ✅ DEBUG: Log the profile data being sent to Klaviyo
  console.log(`📊 Klaviyo Profile Data for ${user.email}:`, {
    accumulated_entries: klaviyoProfile.properties.accumulated_entries,
    rewards_points: klaviyoProfile.properties.rewards_points,
    total_major_draw_entries: klaviyoProfile.properties.total_major_draw_entries,
    major_draw_entries_from_subscription: klaviyoProfile.properties.major_draw_entries_from_subscription,
    has_active_subscription: klaviyoProfile.properties.has_active_subscription,
    subscription_status: klaviyoProfile.properties.subscription_status,
  });

  return klaviyoProfile;
}

/**
 * Calculate user's lifetime value from purchases
 */
export function calculateLifetimeValue(user: IUser): number {
  let total = 0;

  user.miniDrawPackages?.forEach((pkg) => {
    total += pkg.price || 0;
  });

  user.upsellPurchases?.forEach((purchase) => {
    total += purchase.amountPaid || 0;
  });

  return total;
}

/**
 * Get last purchase date from user
 */
export function getLastPurchaseDate(user: IUser): string | undefined {
  const dates: Date[] = [];

  if (user.oneTimePackages) {
    dates.push(...user.oneTimePackages.map((p) => p.purchaseDate));
  }

  if (user.miniDrawPackages) {
    dates.push(...user.miniDrawPackages.map((p) => p.purchaseDate));
  }

  if (user.upsellPurchases) {
    dates.push(...user.upsellPurchases.map((p) => p.purchaseDate));
  }

  if (dates.length === 0) return undefined;

  const latestDate = new Date(Math.max(...dates.map((d) => d.getTime())));
  return latestDate.toISOString();
}

/**
 * Get first purchase date from user
 */
export function getFirstPurchaseDate(user: IUser): string | undefined {
  const dates: Date[] = [];

  if (user.oneTimePackages) {
    dates.push(...user.oneTimePackages.map((p) => p.purchaseDate));
  }

  if (user.miniDrawPackages) {
    dates.push(...user.miniDrawPackages.map((p) => p.purchaseDate));
  }

  if (user.upsellPurchases) {
    dates.push(...user.upsellPurchases.map((p) => p.purchaseDate));
  }

  if (dates.length === 0) return undefined;

  const earliestDate = new Date(Math.min(...dates.map((d) => d.getTime())));
  return earliestDate.toISOString();
}

/**
 * Extract customer properties from user for events
 */
/**
 * Format customer properties for Klaviyo with proper data formatting
 */
export function getCustomerProperties(user: IUser) {
  // Format phone number - ensure it starts with +61 for Australian numbers
  const phone = user.mobile
    ? user.mobile.startsWith("+")
      ? user.mobile
      : `+61${user.mobile.replace(/^0/, "")}`
    : undefined;

  return {
    email: user.email?.trim().toLowerCase() || "",
    first_name: user.firstName?.trim() || "",
    last_name: user.lastName?.trim() || "",
    phone_number: phone || "",
  };
}

/**
 * Format invoice data for Klaviyo with proper formatting
 */
export function formatInvoiceDataForKlaviyo(invoiceData: {
  invoiceId: string;
  invoiceNumber: string;
  packageType: "subscription" | "one-time" | "upsell" | "mini-draw";
  packageId: string;
  packageName: string;
  packageTier?: string;
  totalAmount: number;
  paymentIntentId: string;
  billingReason?: string;
  entries_gained: number;
  items: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    total_price: number;
  }>;
}) {
  // Format date to readable format (e.g., "December 22, 2025")
  const invoiceDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Format total amount as string with 2 decimal places (already in dollars)
  const formattedTotalAmount = invoiceData.totalAmount.toFixed(2);

  // Format package name - ensure it's properly formatted
  const formattedPackageName = invoiceData.packageName?.trim() || "Unknown Package";

  // Format items with proper decimal formatting
  const formattedItems = invoiceData.items.map((item) => ({
    description: item.description,
    quantity: item.quantity,
    unit_price: item.unit_price.toFixed(2),
    total_price: item.total_price.toFixed(2),
  }));

  return {
    invoice_id: invoiceData.invoiceId,
    invoice_number: invoiceData.invoiceNumber,
    invoice_date: invoiceDate, // Formatted as "December 22, 2025"
    package_type: invoiceData.packageType,
    package_id: invoiceData.packageId,
    package_name: formattedPackageName,
    package_tier: invoiceData.packageTier?.trim() || "",
    total_amount: formattedTotalAmount, // Formatted as "49.99"
    payment_intent_id: invoiceData.paymentIntentId,
    billing_reason: invoiceData.billingReason || "",
    entries_gained: invoiceData.entries_gained,
    items: formattedItems, // Array for Klaviyo template looping
    payment_status: "paid",
    created_at: new Date().toISOString(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any; // Type assertion needed for array items support in Klaviyo properties
}

/**
 * Format package data for Klaviyo events with consistent formatting
 */
export function formatPackageDataForKlaviyo(packageData: {
  packageId: string;
  packageName: string;
  tier?: string;
  price: number;
}) {
  return {
    package_id: packageData.packageId,
    package_name: packageData.packageName?.trim() || "Unknown Package",
    tier: packageData.tier?.trim() || "",
    price: packageData.price.toFixed(2), // Format as "49.99"
  };
}

/**
 * Format date for Klaviyo events
 */
export function formatDateForKlaviyo(date?: Date): string {
  const dateToFormat = date || new Date();
  return dateToFormat.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Format timestamp for Klaviyo events
 */
export function formatTimestampForKlaviyo(date?: Date): string {
  const dateToFormat = date || new Date();
  return dateToFormat.toISOString();
}
