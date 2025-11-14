import { IUser } from "@/models/User";
import { getPackageById } from "@/data/membershipPackages";
import { calculateActivePartnerDiscountPeriod } from "@/utils/partner-discounts/partner-discount-queue";

/**
 * Smart benefit resolution that preserves previous subscription benefits during downgrade periods
 *
 * NEW APPROACH:
 * - When user downgrades, Stripe subscription updates immediately with new price
 * - But we store previousSubscription with cached benefits
 * - User keeps old benefits until previousSubscription.endDate
 * - Much simpler than pendingChange approach!
 *
 * @param user - The user object with subscription data
 * @returns The effective package benefits the user should receive
 */
export function getEffectiveBenefits(user: IUser) {
  // If no subscription, return null
  if (!user.subscription) {
    return null;
  }

  // 🎯 KEY CHANGE: Check if there's a previousSubscription with active benefits
  const previousSubscription = user.subscription.previousSubscription;

  if (previousSubscription?.endDate) {
    const now = new Date();
    const endDate = new Date(previousSubscription.endDate);

    // If we're still within the previous subscription's benefit period
    if (now < endDate) {
      console.log(
        `🔄 Using PREVIOUS subscription benefits for user ${user._id}: ${
          previousSubscription.packageName
        } (expires ${endDate.toISOString()})`
      );

      // 🔧 FIX: Look up the full package data for the previous subscription
      // This ensures frontend components get complete package info including name, type, etc.
      const previousPackageData = getPackageById(previousSubscription.packageId);

      // Return cached benefits from previousSubscription with full package data
      return {
        packageId: previousSubscription.packageId,
        packageName: previousSubscription.packageName,
        entriesPerMonth: previousSubscription.benefits.entriesPerMonth,
        discountPercentage: previousSubscription.benefits.discountPercentage,
        price: previousPackageData?.price || 0,
        preservedUntil: endDate,
        isPreservedBenefit: true, // Flag to indicate this is a preserved benefit
        benefits: previousPackageData, // ✅ Full package object for frontend components
      };
    } else {
      // Previous subscription has expired - clear it from user model
      console.log(`✅ Previous subscription benefits expired for user ${user._id}, using current subscription`);
    }
  }

  // Normal case: use current subscription package
  const currentPackage = getPackageById(user.subscription.packageId);
  if (currentPackage) {
    return {
      packageId: currentPackage._id,
      packageName: currentPackage.name,
      entriesPerMonth: currentPackage.entriesPerMonth || 0,
      discountPercentage: currentPackage.shopDiscountPercent || 0,
      price: currentPackage.price,
      benefits: currentPackage,
      isPreservedBenefit: false,
    };
  }

  return null;
}

/**
 * Get the effective package ID for a user
 * This is a convenience function that returns just the package ID
 *
 * @param user - The user object with subscription data
 * @returns The effective package ID
 */
export function getEffectivePackageId(user: IUser): string | null {
  const effectiveBenefits = getEffectiveBenefits(user);
  return effectiveBenefits?.packageId || null;
}

/**
 * Get the effective package name for a user
 * This is a convenience function that returns just the package name
 *
 * @param user - The user object with subscription data
 * @returns The effective package name
 */
export function getEffectivePackageName(user: IUser): string | null {
  const effectiveBenefits = getEffectiveBenefits(user);
  return effectiveBenefits?.packageName || null;
}

/**
 * Check if a user has preserved benefits from a previous subscription
 *
 * @param user - The user object with subscription data
 * @returns True if user has preserved benefits
 */
export function hasPreservedBenefits(user: Partial<IUser>): boolean {
  const previousSubscription = user.subscription?.previousSubscription;
  if (!previousSubscription?.endDate) return false;

  const now = new Date();
  const endDate = new Date(previousSubscription.endDate);
  return now < endDate;
}

/**
 * Get the end date for preserved benefits
 *
 * @param user - The user object with subscription data
 * @returns The end date or null if no preserved benefits
 */
export function getPreservedBenefitsEndDate(user: Partial<IUser>): Date | null {
  if (hasPreservedBenefits(user)) {
    return new Date(user.subscription!.previousSubscription!.endDate);
  }
  return null;
}

/**
 * Get days until preserved benefits expire
 *
 * @param user - The user object with subscription data
 * @returns Number of days until benefits expire, or null if no preserved benefits
 */
export function getDaysUntilBenefitsExpire(user: Partial<IUser>): number | null {
  const endDate = getPreservedBenefitsEndDate(user);
  if (endDate) {
    const now = new Date();
    const diffTime = endDate.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
  return null;
}

/**
 * LEGACY: Check if a user has a pending downgrade (for backwards compatibility)
 * This now checks previousSubscription instead of pendingChange
 *
 * @param user - The user object with subscription data
 * @returns True if user has preserved benefits (equivalent to pending downgrade)
 */
export function hasPendingDowngrade(user: Partial<IUser>): boolean {
  return hasPreservedBenefits(user);
}

/**
 * LEGACY: Get the effective date for a pending downgrade (for backwards compatibility)
 *
 * @param user - The user object with subscription data
 * @returns The effective date or null
 */
export function getDowngradeEffectiveDate(user: Partial<IUser>): Date | null {
  return getPreservedBenefitsEndDate(user);
}

/**
 * LEGACY: Get days until downgrade takes effect (for backwards compatibility)
 *
 * @param user - The user object with subscription data
 * @returns Number of days until downgrade
 */
export function getDaysUntilDowngrade(user: Partial<IUser>): number | null {
  return getDaysUntilBenefitsExpire(user);
}

/**
 * Check if a user has active partner discount access
 *
 * This function checks the partner discount queue to determine if the user
 * currently has active partner discount access from any source:
 * - Active subscription (recurring 30-day access)
 * - One-time package purchase
 * - Mini-draw package
 * - Upsell offer
 *
 * @param user - The user object with partner discount queue
 * @returns True if user has active partner discount access
 */
export function hasActivePartnerDiscountAccess(user: IUser): boolean {
  // Check if user has active subscription (immediate access)
  if (user.subscription?.isActive) {
    return true;
  }

  // Check partner discount queue for active non-subscription periods
  const activePeriod = calculateActivePartnerDiscountPeriod(user);
  return activePeriod.isActive;
}

/**
 * Get partner discount access info for display
 *
 * Returns detailed information about the user's current partner discount access:
 * - Whether they have access
 * - Source of access (subscription, one-time, mini-draw, upsell)
 * - When access expires
 * - Days/hours remaining
 *
 * @param user - The user object with partner discount queue
 * @returns Partner discount access information
 */
export function getPartnerDiscountAccessInfo(user: IUser): {
  hasAccess: boolean;
  source: "subscription" | "one-time" | "mini-draw" | "upsell" | null;
  packageName: string | null;
  expiresAt: Date | null;
  daysRemaining: number;
  hoursRemaining: number;
  isRecurring: boolean;
} {
  const activePeriod = calculateActivePartnerDiscountPeriod(user);

  return {
    hasAccess: activePeriod.isActive,
    source: activePeriod.source,
    packageName: activePeriod.packageName,
    expiresAt: activePeriod.endsAt,
    daysRemaining: activePeriod.daysRemaining,
    hoursRemaining: activePeriod.hoursRemaining,
    isRecurring: activePeriod.source === "subscription", // Subscriptions are recurring
  };
}

/**
 * Check if a user can access partner discounts for a specific product/brand
 *
 * This is the main function to call when determining if a user should see
 * partner discounts in the shop or on product pages.
 *
 * @param user - The user object
 * @param brand - Optional brand filter (for brand-specific discounts)
 * @returns True if user can access partner discounts
 */
export function canAccessPartnerDiscounts(user: IUser, brand?: string): boolean {
  // First check if they have any active access
  if (!hasActivePartnerDiscountAccess(user)) {
    return false;
  }

  // If brand filtering is needed, you can add brand-specific logic here
  // For now, all active access grants access to all partner discounts
  // Future enhancement: filter by brand
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _brand = brand; // Placeholder for future brand-specific logic
  return true;
}

/**
 * Get user's total partner discount access days (active + queued)
 *
 * Useful for displaying total value of purchased benefits
 *
 * @param user - The user object with partner discount queue
 * @returns Total days of access (current + queued)
 */
export function getTotalPartnerDiscountDays(user: IUser): number {
  const activePeriod = calculateActivePartnerDiscountPeriod(user);

  // Add active days
  let totalDays = activePeriod.daysRemaining;

  // Add queued days
  if (user.partnerDiscountQueue) {
    const queuedDays = user.partnerDiscountQueue
      .filter((item) => item.status === "queued")
      .reduce((sum, item) => sum + item.discountDays, 0);

    totalDays += queuedDays;
  }

  return totalDays;
}
