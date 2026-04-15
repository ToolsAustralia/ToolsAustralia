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
import { getPackageById } from "@/data/membershipPackages";
import { extractBrandFromSlug } from "./brand-extraction";
import { calculateDrawSpecificPropertiesForUser, calculateDrawSpecificProperties, type DrawSpecificProperties } from "./klaviyo-draw-calculator";
import { getRenewalEntriesPreviewForProfile } from "./klaviyo-renewal-entries-preview";
import type { IMajorDraw } from "@/models/MajorDraw";

/**
 * Calculate entry breakdown by source
 * Returns total entries from each purchase type for Klaviyo segmentation
 */
export function calculateEntryBreakdown(user: IUser): {
  memberEntries: number;
  oneTimeEntries: number;
  upsellEntries: number;
  miniDrawEntries: number;
} {
  // Calculate member entries from subscription
  let memberEntries = 0;
  if (user.subscription?.isActive && user.subscription?.packageId && user.subscription?.startDate) {
    try {
      const subscriptionPackage = getPackageById(user.subscription.packageId);
      if (subscriptionPackage && subscriptionPackage.entriesPerMonth) {
        const startDate = new Date(user.subscription.startDate);
        const endDate = user.subscription.endDate ? new Date(user.subscription.endDate) : new Date();
        const now = new Date();

        // Calculate months between start and end (or now if no end date)
        const endDateToUse = endDate > now ? now : endDate;
        const monthsDiff = Math.max(
          0,
          Math.floor((endDateToUse.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 30))
        );

        // Add 1 month for the current month if subscription is active
        const totalMonths = monthsDiff + (user.subscription.isActive ? 1 : 0);
        memberEntries = subscriptionPackage.entriesPerMonth * totalMonths;
      }
    } catch (error) {
      console.error(`Error calculating member entries for user ${user._id}:`, error);
    }
  }

  // Calculate one-time entries
  const oneTimeEntries = user.oneTimePackages?.reduce((sum, pkg) => sum + (pkg.entriesGranted || 0), 0) || 0;

  // Calculate upsell entries
  const upsellPurchases = user.upsellPurchases || [];
  const upsellEntries = upsellPurchases.reduce((sum, purchase) => sum + (purchase.entriesAdded || 0), 0);

  if (upsellPurchases.length > 0 && upsellEntries === 0) {
    // console.warn(
    //   `⚠️ User ${user.email} has ${upsellPurchases.length} upsell purchase(s) but total entries is 0. Check entriesAdded values.`
    // );
  }

  // Calculate mini-draw entries
  const miniDrawEntries = user.miniDrawPackages?.reduce((sum, pkg) => sum + (pkg.entriesGranted || 0), 0) || 0;

  return {
    memberEntries,
    oneTimeEntries,
    upsellEntries,
    miniDrawEntries,
  };
}

/**
 * Determine if user has made any purchase
 * Checks for subscriptions, one-time packages, mini-draw packages, or upsells
 *
 * @param user - User model instance
 * @returns true if user has made any purchase (subscription, one-time, mini-draw, or upsell)
 */
export function hasUserMadePurchase(user: IUser): boolean {
  const hasSubscription = user.subscription?.isActive || false;
  const hasOneTimePackages = (user.oneTimePackages?.length || 0) > 0;
  const hasMiniDrawPackages = (user.miniDrawPackages?.length || 0) > 0;
  const hasUpsells = (user.upsellPurchases?.length || 0) > 0;

  return hasSubscription || hasOneTimePackages || hasMiniDrawPackages || hasUpsells;
}

/**
 * Convert User model to Klaviyo profile
 * Transforms MongoDB user data to Klaviyo format
 * Includes only strategic fields for segmentation and email automation
 *
 * @param user - User model instance
 * @param brandInterestFromSignup - Optional brand interest from signup (e.g., "milwaukee", "dewalt", "makita")
 *                                   Only used if user hasn't made any purchases yet
 * @param targetDraw - Optional cached target draw (for performance optimization in bulk operations)
 * @param cutoffDate - Optional cached cutoff date (for performance optimization in bulk operations)
 */
export async function userToKlaviyoProfile(
  user: IUser,
  brandInterestFromSignup?: string | null,
  targetDraw?: IMajorDraw,
  cutoffDate?: Date
): Promise<KlaviyoProfile> {
  // ✅ DEBUG: Log user data structure to identify sync issues
  // console.log(`🔍 userToKlaviyoProfile called for ${user.email}:`, {
  //   hasSubscription: !!user.subscription,
  //   subscriptionIsActive: user.subscription?.isActive,
  //   subscriptionPackageId: user.subscription?.packageId,
  //   upsellPurchasesLength: user.upsellPurchases?.length || 0,
  //   upsellPurchases: user.upsellPurchases ? JSON.stringify(user.upsellPurchases) : "undefined",
  //   oneTimePackagesLength: user.oneTimePackages?.length || 0,
  //   miniDrawPackagesLength: user.miniDrawPackages?.length || 0,
  //   accumulatedEntries: user.accumulatedEntries,
  //   rewardsPoints: user.rewardsPoints,
  // });

  // Format phone number - ensure it starts with +61 for Australian numbers
  const phone = user.mobile
    ? user.mobile.startsWith("+")
      ? user.mobile
      : `+61${user.mobile.replace(/^0/, "")}`
    : undefined;

  // Helper function to safely convert date to ISO string
  const safeDateToISO = (date: Date | undefined | null): string | undefined => {
    if (!date) return undefined;
    try {
      return date instanceof Date ? date.toISOString() : new Date(date).toISOString();
    } catch (error) {
      console.error(`Error converting date to ISO string for user ${user._id}:`, error);
      return undefined;
    }
  };

  // Calculate strategic metrics using helper functions
  const lifetimeValue = calculateLifetimeValue(user);
  const partnerDiscountStatus = calculatePartnerDiscountStatus(user);
  const upsellMetrics = calculateUpsellMetrics(user);
  const entryBreakdown = calculateEntryBreakdown(user);

  // Calculate draw-specific properties (non-blocking - use defaults if fails)
  let drawSpecificProperties: Partial<DrawSpecificProperties> & {
    current_draw_subscription_active: boolean;
    current_draw_one_time_packages: number;
    current_draw_entries: number;
  } = {
    current_draw_subscription_active: false,
    current_draw_one_time_packages: 0,
    current_draw_entries: 0,
  };

  try {
    // Use cached draw data if provided (performance optimization for bulk operations)
    // Otherwise fetch it (for single user operations)
    let drawProps: DrawSpecificProperties | null = null;
    
    if (targetDraw && cutoffDate) {
      // Use cached draw data - no database query needed
      drawProps = await calculateDrawSpecificProperties(user, targetDraw, cutoffDate);
    } else {
      // Fetch draw data (for single user operations)
      drawProps = await calculateDrawSpecificPropertiesForUser(user);
    }
    
    if (drawProps) {
      drawSpecificProperties = drawProps;
    } else {
      // If drawProps is null, log a warning for debugging
      // This happens when no active draw is found
      if (process.env.NODE_ENV === "development") {
        console.warn(`⚠️ No draw-specific properties calculated for ${user.email} - no active draw found`);
      }
    }
  } catch (error) {
    // Log error but don't fail profile sync - use safe defaults
    console.error(`Error calculating draw-specific properties for user ${user._id}:`, error);
  }

  // Determine brand interest
  // If user has made purchases, explicitly set to null to remove tag from Klaviyo
  // If no purchases, use brand from signup or default to "milwaukee"
  const userHasPurchases = hasUserMadePurchase(user);
  let brandInterest: string | null | undefined;

  if (userHasPurchases) {
    // User has made purchases - explicitly set to null to remove tag from Klaviyo
    brandInterest = null;
    // console.log(
    //   `🏷️ User ${user.email} has purchases - removing brand_interest tag. Has subscription: ${!!user.subscription
    //     ?.isActive}, upsells: ${user.upsellPurchases?.length || 0}, one-time: ${
    //     user.oneTimePackages?.length || 0
    //   }, mini-draw: ${user.miniDrawPackages?.length || 0}`
    // );
  } else {
    // User hasn't purchased yet - set brand interest
    if (brandInterestFromSignup) {
      brandInterest = extractBrandFromSlug(brandInterestFromSignup);
    } else {
      // Default to milwaukee if no brand provided
      brandInterest = "milwaukee";
    }
    // console.log(`🏷️ User ${user.email} has no purchases - setting brand_interest to: ${brandInterest}`);
  }

  const klaviyoProfile = {
    email: user.email,
    first_name: user.firstName,
    last_name: user.lastName,
    phone_number: phone,
    // Note: email_consent and sms_consent are NOT valid fields in profile attributes
    // Email consent should be handled by subscribing users to email lists
    // SMS consent is handled separately via subscribeToSMSList method
    // Both will be handled via list subscriptions to ensure proper consent tracking
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
      app_accepts_promotional_email: user.acceptsPromotionalEmail !== false,

      // Subscription details
      has_active_subscription: user.subscription?.isActive || false,
      subscription_tier:
        user.subscription?.packageId && user.subscription.packageId.trim() !== ""
          ? user.subscription.packageId
          : undefined, // Handle empty string and undefined
      subscription_start_date: safeDateToISO(user.subscription?.startDate),
      subscription_end_date: safeDateToISO(user.subscription?.endDate),
      subscription_auto_renew: user.subscription?.autoRenew ?? undefined,
      subscription_status:
        user.subscription?.status && user.subscription.status.trim() !== "" ? user.subscription.status : undefined,

      past_due_renewal_entries: getRenewalEntriesPreviewForProfile(user) ?? null,

      // Subscription lifecycle tracking
      subscription_has_pending_upgrade: !!user.subscription?.pendingChange,
      subscription_previous_tier:
        user.subscription?.previousSubscription?.packageId &&
        user.subscription.previousSubscription.packageId.trim() !== ""
          ? user.subscription.previousSubscription.packageId
          : undefined,
      subscription_last_upgrade_date: safeDateToISO(user.subscription?.lastUpgradeDate),
      subscription_last_downgrade_date: safeDateToISO(user.subscription?.lastDowngradeDate),

      // Entries and points
      accumulated_entries: user.accumulatedEntries || 0,
      rewards_points: user.rewardsPoints || 0,

      // Purchase history
      total_one_time_packages: user.oneTimePackages?.length || 0,
      total_mini_draw_packages: user.miniDrawPackages?.length || 0,
      last_purchase_date: getLastPurchaseDate(user),
      first_purchase_date: getFirstPurchaseDate(user),

      // Lifetime value & spending
      lifetime_value: lifetimeValue,
      total_spent: lifetimeValue, // Alias for clarity

      // Upsell data
      total_upsells_purchased: (user.upsellPurchases?.length || 0) > 0 ? user.upsellPurchases!.length : 0,
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

      // Brand interest tracking (removed when user makes any purchase)
      brand_interest: brandInterest,

      // Entry breakdown by source (for advanced segmentation)
      member_entries: entryBreakdown.memberEntries,
      one_time_entries: entryBreakdown.oneTimeEntries,
      upsell_entries: entryBreakdown.upsellEntries,
      mini_draw_entries: entryBreakdown.miniDrawEntries,

      // Draw-specific properties (reset when new draw activates)
      // Always include boolean/number properties (never undefined) - these will always be sent to Klaviyo
      // String properties can be undefined (will be filtered by cleanProperties if no draw found)
      current_draw_id: drawSpecificProperties.current_draw_id,
      current_draw_name: drawSpecificProperties.current_draw_name,
      current_draw_start_date: drawSpecificProperties.current_draw_start_date,
      current_draw_subscription_active: drawSpecificProperties.current_draw_subscription_active ?? false,
      current_draw_one_time_packages: drawSpecificProperties.current_draw_one_time_packages ?? 0,
      current_draw_entries: drawSpecificProperties.current_draw_entries ?? 0,
    },
  };

  // ✅ DEBUG: Log the profile data being sent to Klaviyo
  // console.log(`📊 Klaviyo Profile Data for ${user.email}:`, {
  //   accumulated_entries: klaviyoProfile.properties.accumulated_entries,
  //   rewards_points: klaviyoProfile.properties.rewards_points,
  //   subscription: {
  //     has_active_subscription: klaviyoProfile.properties.has_active_subscription,
  //     subscription_tier: klaviyoProfile.properties.subscription_tier,
  //     subscription_start_date: klaviyoProfile.properties.subscription_start_date,
  //     subscription_end_date: klaviyoProfile.properties.subscription_end_date,
  //     subscription_status: klaviyoProfile.properties.subscription_status,
  //     subscription_auto_renew: klaviyoProfile.properties.subscription_auto_renew,
  //     subscription_has_pending_upgrade: klaviyoProfile.properties.subscription_has_pending_upgrade,
  //     subscription_previous_tier: klaviyoProfile.properties.subscription_previous_tier,
  //     subscription_last_upgrade_date: klaviyoProfile.properties.subscription_last_upgrade_date,
  //     subscription_last_downgrade_date: klaviyoProfile.properties.subscription_last_downgrade_date,
  //   },
  //   lifetime_value: klaviyoProfile.properties.lifetime_value,
  //   total_spent: klaviyoProfile.properties.total_spent,
  //   brand_interest: klaviyoProfile.properties.brand_interest,
  //   has_purchases: hasUserMadePurchase(user),
  //   referral_code: klaviyoProfile.properties.referral_code,
  //   partner_discount_active: klaviyoProfile.properties.partner_discount_active,
  //   entry_breakdown: {
  //     member_entries: klaviyoProfile.properties.member_entries,
  //     one_time_entries: klaviyoProfile.properties.one_time_entries,
  //     upsell_entries: klaviyoProfile.properties.upsell_entries,
  //     mini_draw_entries: klaviyoProfile.properties.mini_draw_entries,
  //   },
  // });

  return klaviyoProfile;
}

/**
 * Calculate user's lifetime value from purchases
 * Includes subscriptions, one-time packages, mini-draws, and upsells
 */
export function calculateLifetimeValue(user: IUser): number {
  let total = 0;

  // Add mini-draw package prices (stored in user model)
  user.miniDrawPackages?.forEach((pkg) => {
    total += pkg.price || 0;
  });

  // Add upsell purchase amounts (stored in user model)
  const upsellPurchases = user.upsellPurchases || [];
  if (upsellPurchases.length > 0) {
    upsellPurchases.forEach((purchase) => {
      const amount = purchase.amountPaid || 0;
      total += amount;
      // console.log(`💰 Adding upsell to lifetime value: ${purchase.offerTitle || purchase.offerId} - $${amount}`);
    });
  } else {
    // console.log(
    //   `⚠️ No upsell purchases found for user ${user.email} (upsellPurchases: ${user.upsellPurchases?.length || 0})`
    // );
  }

  // Add subscription prices (need to look up package and calculate based on duration)
  if (user.subscription?.isActive && user.subscription?.packageId && user.subscription?.startDate) {
    try {
      const subscriptionPackage = getPackageById(user.subscription.packageId);
      if (subscriptionPackage && subscriptionPackage.price) {
        const startDate = new Date(user.subscription.startDate);
        const endDate = user.subscription.endDate ? new Date(user.subscription.endDate) : new Date();
        const now = new Date();

        // Calculate months between start and end (or now if no end date)
        const endDateToUse = endDate > now ? now : endDate;
        const monthsDiff = Math.max(
          0,
          Math.floor((endDateToUse.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24 * 30))
        );

        // Add 1 month for the current month if subscription is active
        const totalMonths = monthsDiff + (user.subscription.isActive ? 1 : 0);
        const subscriptionTotal = subscriptionPackage.price * totalMonths;
        total += subscriptionTotal;
        // console.log(
        //   `💰 Adding subscription to lifetime value: ${subscriptionPackage.name} - $${subscriptionPackage.price}/month × ${totalMonths} months = $${subscriptionTotal}`
        // );
      } else {
        // console.warn(
        //   `⚠️ Subscription package not found or has no price: ${user.subscription.packageId} for user ${user.email}`
        // );
      }
    } catch (error) {
      console.error(`Error calculating subscription lifetime value for user ${user._id}:`, error);
    }
  } else {
    // console.log(
    //   `ℹ️ No active subscription for lifetime value calculation: isActive=${user.subscription?.isActive}, packageId=${user.subscription?.packageId}`
    // );
  }

  // Add one-time package prices (need to look up package price)
  if (user.oneTimePackages && user.oneTimePackages.length > 0) {
    try {
      user.oneTimePackages.forEach((pkg) => {
        if (pkg.packageId) {
          const oneTimePackage = getPackageById(pkg.packageId);
          if (oneTimePackage && oneTimePackage.price) {
            total += oneTimePackage.price;
          }
        }
      });
    } catch (error) {
      console.error(`Error calculating one-time package lifetime value for user ${user._id}:`, error);
    }
  }

  // console.log(`💰 Total lifetime value calculated for ${user.email}: $${total.toFixed(2)}`);
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
  packageType: "membership" | "one-time" | "upsell" | "mini-draw";
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
