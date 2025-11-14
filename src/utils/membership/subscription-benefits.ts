import { getPackageById } from "@/data/membershipPackages";
import {
  getEffectiveBenefits,
  hasPreservedBenefits,
  getDaysUntilBenefitsExpire,
  getPreservedBenefitsEndDate,
} from "@/utils/membership/benefit-resolution";
import type { IUser } from "@/models/User";

export interface UserBenefits {
  entriesPerMonth: number;
  shopDiscountPercent: number;
  partnerDiscountDays: number;
  packageName: string;
  packageId: string;
  isPendingChange: boolean;
  pendingChange?: {
    newPackageId: string;
    newPackageName: string;
    effectiveDate: Date;
    changeType: "upgrade" | "downgrade";
  };
}

/**
 * Calculate current user benefits considering pending subscription changes
 * This handles the smart logic for upgrades/downgrades using the new benefit resolution system
 *
 * 🔄 UPDATED: Now works with previousSubscription instead of pendingChange
 */
export function getCurrentUserBenefits(user: Partial<IUser>): UserBenefits | null {
  if (!user?.subscription?.isActive || !user.subscription.packageId) {
    return null;
  }

  // Use smart benefit resolution to get effective benefits
  const effectiveBenefits = getEffectiveBenefits(user as IUser);
  if (!effectiveBenefits) {
    return null;
  }

  // 🔧 NEW: Check if user has preserved benefits from a previous subscription (downgrade)
  const hasPreserved = hasPreservedBenefits(user as IUser);

  if (hasPreserved && user.subscription.previousSubscription) {
    // User has downgraded but is still enjoying previous benefits
    const currentPackage = getPackageById(user.subscription.packageId);
    const endDate = getPreservedBenefitsEndDate(user as IUser);

    if (currentPackage && endDate) {
      return {
        entriesPerMonth: effectiveBenefits.entriesPerMonth,
        shopDiscountPercent: effectiveBenefits.discountPercentage,
        partnerDiscountDays: effectiveBenefits.benefits?.partnerDiscountDays || 0,
        packageName: effectiveBenefits.packageName, // This will be the PREVIOUS package name
        packageId: effectiveBenefits.packageId, // This will be the PREVIOUS package ID
        isPendingChange: true, // Yes, there's a pending change (downgrade)
        pendingChange: {
          newPackageId: currentPackage._id,
          newPackageName: currentPackage.name,
          effectiveDate: endDate,
          changeType: "downgrade",
        },
      };
    }
  }

  // Note: pendingChange now only handles UPGRADES, not downgrades
  // Downgrades are handled via previousSubscription above

  // Normal case - return effective benefits (no downgrade pending)
  return {
    entriesPerMonth: effectiveBenefits.entriesPerMonth,
    shopDiscountPercent: effectiveBenefits.discountPercentage,
    partnerDiscountDays: effectiveBenefits.benefits?.partnerDiscountDays || 0,
    packageName: effectiveBenefits.packageName,
    packageId: effectiveBenefits.packageId,
    isPendingChange: false,
  };
}

/**
 * Get available upgrade options for a user
 */
export function getAvailableUpgrades(user: Partial<IUser>): Array<{
  packageId: string;
  name: string;
  price: number;
  entriesPerMonth: number;
  shopDiscountPercent: number;
  partnerDiscountDays: number;
  description: string;
}> {
  if (!user?.subscription?.isActive || !user.subscription.packageId) {
    return [];
  }

  const currentPackageId = user.subscription.packageId as string;
  const currentPackage = getPackageById(currentPackageId);

  if (!currentPackage) {
    return [];
  }

  // Get all subscription packages that cost more than current package
  const allPackages = [
    getPackageById("tradie-subscription"),
    getPackageById("foreman-subscription"),
    getPackageById("boss-subscription"),
  ].filter(Boolean);

  return allPackages
    .filter((pkg) => pkg && pkg.price > currentPackage.price && pkg.isActive)
    .map((pkg) => ({
      packageId: pkg!._id,
      name: pkg!.name,
      price: pkg!.price,
      entriesPerMonth: pkg!.entriesPerMonth || 0,
      shopDiscountPercent: pkg!.shopDiscountPercent || 0,
      partnerDiscountDays: pkg!.partnerDiscountDays || 0,
      description: pkg!.description,
    }))
    .sort((a, b) => a.price - b.price); // Sort by price ascending
}

/**
 * Get available downgrade options for a user
 * 🔄 UPDATED: Now uses effective benefits to get the correct "current" package
 */
export function getAvailableDowngrades(user: Partial<IUser>): Array<{
  packageId: string;
  name: string;
  price: number;
  entriesPerMonth: number;
  shopDiscountPercent: number;
  partnerDiscountDays: number;
  description: string;
}> {
  if (!user?.subscription?.isActive || !user.subscription.packageId) {
    return [];
  }

  // 🔧 Use effective benefits to get the actual current package
  // This ensures we compare against the package user is ACTUALLY enjoying
  const effectiveBenefits = getEffectiveBenefits(user as IUser);
  if (!effectiveBenefits) {
    return [];
  }

  const currentPackage = effectiveBenefits.benefits || getPackageById(effectiveBenefits.packageId);
  if (!currentPackage) {
    return [];
  }

  // Get all subscription packages that cost less than current package
  const allPackages = [
    getPackageById("tradie-subscription"),
    getPackageById("foreman-subscription"),
    getPackageById("boss-subscription"),
  ].filter(Boolean);

  return allPackages
    .filter((pkg) => pkg && pkg.price < currentPackage.price && pkg.isActive)
    .map((pkg) => ({
      packageId: pkg!._id,
      name: pkg!.name,
      price: pkg!.price,
      entriesPerMonth: pkg!.entriesPerMonth || 0,
      shopDiscountPercent: pkg!.shopDiscountPercent || 0,
      partnerDiscountDays: pkg!.partnerDiscountDays || 0,
      description: pkg!.description,
    }))
    .sort((a, b) => b.price - a.price); // Sort by price descending
}

/**
 * Calculate days until pending change takes effect
 * 🔄 UPDATED: Now supports both previousSubscription and legacy pendingChange
 */
export function getDaysUntilChange(user: Partial<IUser>): number | null {
  // 🔧 NEW: Check previousSubscription first
  if (hasPreservedBenefits(user as IUser)) {
    return getDaysUntilBenefitsExpire(user as IUser);
  }

  // Note: pendingChange now only handles UPGRADES which don't have a future effective date
  // They activate immediately after payment. So we return null for pending upgrades.
  return null;
}

/**
 * Format pending change message for display
 * 🔄 UPDATED: Now supports both previousSubscription and legacy pendingChange
 */
export function getPendingChangeMessage(user: Partial<IUser>): string | null {
  // 🔧 NEW: Check for preserved benefits first (downgrade via previousSubscription)
  if (hasPreservedBenefits(user as IUser) && user?.subscription?.previousSubscription) {
    const daysUntil = getDaysUntilBenefitsExpire(user as IUser);
    const newPackage = getPackageById(user.subscription.packageId!);

    if (!newPackage || !daysUntil) {
      return null;
    }

    if (daysUntil > 0) {
      return `Your ${newPackage.name} membership starts in ${daysUntil} day${
        daysUntil === 1 ? "" : "s"
      }. You'll keep your current ${user.subscription.previousSubscription.packageName} benefits until then.`;
    } else {
      return `Your ${newPackage.name} membership is now active!`;
    }
  }

  // Note: pendingChange now only handles UPGRADES which activate immediately
  // No future-dated pending changes for upgrades, so no message needed
  return null;
}
