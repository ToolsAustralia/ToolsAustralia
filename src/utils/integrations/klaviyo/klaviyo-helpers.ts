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
 * Includes only strategic fields for segmentation and email automation
 */
export async function userToKlaviyoProfile(user: IUser): Promise<KlaviyoProfile> {
  // Format phone number - ensure it starts with +61 for Australian numbers
  const phone = user.mobile
    ? user.mobile.startsWith("+")
      ? user.mobile
      : `+61${user.mobile.replace(/^0/, "")}`
    : undefined;

  // Calculate major draw entries from majordraws collection (single source of truth)
  let totalMajorDrawEntries = 0;
  try {
    const { getUserTotalAccumulatedEntries } = await import("../../database/queries/major-draw-queries");
    totalMajorDrawEntries = (await getUserTotalAccumulatedEntries(user._id)) || 0;
  } catch (error) {
    console.error(`Error calculating major draw entries for user ${user._id}:`, error);
    // Default to 0 if calculation fails
    totalMajorDrawEntries = 0;
  }

  // Calculate strategic metrics using helper functions
  const lifetimeValue = calculateLifetimeValue(user);
  const partnerDiscountStatus = calculatePartnerDiscountStatus(user);
  const upsellMetrics = calculateUpsellMetrics(user);

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
      profession: user.profession || undefined,

      // Verification status
      is_email_verified: user.isEmailVerified || false,
      is_mobile_verified: user.isMobileVerified || false,

      // Profile completion
      profile_setup_completed: user.profileSetupCompleted || false,

      // Subscription details
      has_active_subscription: user.subscription?.isActive || false,
      subscription_tier: user.subscription?.packageId,
      subscription_start_date: user.subscription?.startDate?.toISOString(),
      subscription_end_date: user.subscription?.endDate?.toISOString(),
      subscription_auto_renew: user.subscription?.autoRenew ?? undefined,
      subscription_status: user.subscription?.status,

      // Subscription lifecycle tracking
      subscription_has_pending_upgrade: !!user.subscription?.pendingChange,
      subscription_previous_tier: user.subscription?.previousSubscription?.packageId,
      subscription_last_upgrade_date: user.subscription?.lastUpgradeDate?.toISOString(),
      subscription_last_downgrade_date: user.subscription?.lastDowngradeDate?.toISOString(),

      // Entries and points
      accumulated_entries: user.accumulatedEntries || 0,
      rewards_points: user.rewardsPoints || 0,

      // Major draw entries (accurate from database - single source of truth)
      total_major_draw_entries: totalMajorDrawEntries,

      // Purchase history
      total_one_time_packages: user.oneTimePackages?.length || 0,
      total_mini_draw_packages: user.miniDrawPackages?.length || 0,
      last_purchase_date: getLastPurchaseDate(user),
      first_purchase_date: getFirstPurchaseDate(user),

      // Lifetime value & spending
      lifetime_value: lifetimeValue,
      total_spent: lifetimeValue, // Alias for clarity

      // Upsell data
      total_upsells_purchased: user.upsellPurchases?.length || 0,
      upsell_total_shown: upsellMetrics.totalShown,
      upsell_total_accepted: upsellMetrics.totalAccepted,
      upsell_total_declined: upsellMetrics.totalDeclined,
      upsell_conversion_rate: upsellMetrics.conversionRate,
      upsell_last_interaction: upsellMetrics.lastInteraction,

      // Referral program
      referral_code: user.referral?.code,
      referral_successful_conversions: user.referral?.successfulConversions || 0,
      referral_total_entries_awarded: user.referral?.totalEntriesAwarded || 0,

      // Partner discount status
      partner_discount_active: partnerDiscountStatus.active,
      partner_discount_queued_count: partnerDiscountStatus.queuedCount,
      partner_discount_total_days: partnerDiscountStatus.totalDays,
      partner_discount_next_activation_date: partnerDiscountStatus.nextActivationDate,
    },
  };

  // ✅ DEBUG: Log the profile data being sent to Klaviyo
  console.log(`📊 Klaviyo Profile Data for ${user.email}:`, {
    accumulated_entries: klaviyoProfile.properties.accumulated_entries,
    rewards_points: klaviyoProfile.properties.rewards_points,
    total_major_draw_entries: klaviyoProfile.properties.total_major_draw_entries,
    has_active_subscription: klaviyoProfile.properties.has_active_subscription,
    subscription_status: klaviyoProfile.properties.subscription_status,
    lifetime_value: klaviyoProfile.properties.lifetime_value,
    referral_code: klaviyoProfile.properties.referral_code,
    partner_discount_active: klaviyoProfile.properties.partner_discount_active,
  });

  return klaviyoProfile;
}

/**
 * Calculate user's lifetime value from purchases
 * Includes subscriptions, one-time packages, mini-draws, and upsells
 */
export function calculateLifetimeValue(user: IUser): number {
  let total = 0;

  // Add mini-draw package prices
  user.miniDrawPackages?.forEach((pkg) => {
    total += pkg.price || 0;
  });

  // Add upsell purchase amounts
  user.upsellPurchases?.forEach((purchase) => {
    total += purchase.amountPaid || 0;
  });

  // Note: Subscription prices would need to be calculated from package data
  // One-time packages don't store price in user model, would need package lookup
  // For now, this covers mini-draws and upsells which are the main additional purchases

  return total;
}

/**
 * Calculate partner discount status summary
 * Returns active status, queued count, total days, and next activation date
 */
export function calculatePartnerDiscountStatus(user: IUser): {
  active: boolean;
  queuedCount: number;
  totalDays: number;
  nextActivationDate?: string;
} {
  const queue = user.partnerDiscountQueue || [];
  
  // Find active discount (status === "active")
  const activeDiscount = queue.find((item) => item.status === "active");
  const isActive = !!activeDiscount;

  // Count queued discounts (status === "queued")
  const queuedCount = queue.filter((item) => item.status === "queued").length;

  // Calculate total days (active + queued)
  let totalDays = 0;
  queue.forEach((item) => {
    if (item.status === "active" || item.status === "queued") {
      totalDays += item.discountDays || 0;
      // Add hours converted to days (24 hours = 1 day)
      totalDays += (item.discountHours || 0) / 24;
    }
  });

  // Find next activation date (earliest startDate from queued items)
  const queuedItems = queue.filter((item) => item.status === "queued" && item.startDate);
  let nextActivationDate: string | undefined;
  if (queuedItems.length > 0) {
    const sortedQueued = queuedItems.sort(
      (a, b) => new Date(a.startDate!).getTime() - new Date(b.startDate!).getTime()
    );
    nextActivationDate = sortedQueued[0].startDate?.toISOString();
  }

  return {
    active: isActive,
    queuedCount,
    totalDays: Math.round(totalDays * 100) / 100, // Round to 2 decimal places
    nextActivationDate,
  };
}

/**
 * Extract upsell engagement metrics from user
 * Returns upsell stats for Klaviyo segmentation
 */
export function calculateUpsellMetrics(user: IUser): {
  totalShown: number;
  totalAccepted: number;
  totalDeclined: number;
  conversionRate: number;
  lastInteraction?: string;
} {
  const stats = user.upsellStats;

  const totalShown = stats?.totalShown || 0;
  const totalAccepted = stats?.totalAccepted || 0;
  const totalDeclined = stats?.totalDeclined || 0;
  
  // Calculate conversion rate (accepted / shown, or 0 if no shows)
  const conversionRate = totalShown > 0 ? (totalAccepted / totalShown) * 100 : 0;

  return {
    totalShown,
    totalAccepted,
    totalDeclined,
    conversionRate: Math.round(conversionRate * 100) / 100, // Round to 2 decimal places
    lastInteraction: stats?.lastInteraction?.toISOString(),
  };
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
