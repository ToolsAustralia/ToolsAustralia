/**
 * Upsell Entries Calculator
 *
 * This module handles dynamic calculation of upsell entries based on the original package
 * and active promo multipliers. Upsells should always grant twice the entries of the
 * triggering package (including any active promo multipliers).
 *
 * Formula: upsellEntries = 2 × (packageBaseEntries × activePromoMultiplier)
 *
 * Example:
 * - Package: Tradie subscription (15 base entries)
 * - Active promo: 10x multiplier
 * - Package grants: 15 × 10 = 150 entries
 * - Upsell grants: 2 × 150 = 300 entries
 */

import { getPackageById, type StaticMembershipPackage } from "@/data/membershipPackages";
import { getMiniDrawPackageById, type MiniDrawPackage } from "@/data/miniDrawPackages";

export interface CalculateUpsellEntriesParams {
  baseEntries: number;
  packageType: "membership" | "one-time" | "mini-draw";
  promoMultiplier: number;
}

export interface PackageBaseEntriesParams {
  packageId: string;
  packageType: "membership" | "one-time" | "mini-draw";
}

/**
 * Get base entries from package definition
 * Looks up the package and extracts base entries based on package type
 *
 * @param params - Package identification parameters
 * @returns Base entries count, or 0 if package not found
 */
export function getPackageBaseEntries(params: PackageBaseEntriesParams): number {
  const { packageId, packageType } = params;

  try {
    if (packageType === "mini-draw") {
      const miniPackage = getMiniDrawPackageById(packageId);
      if (!miniPackage) {
        console.warn(`⚠️ Mini-draw package not found: ${packageId}`);
        return 0;
      }
      // For mini-draw packages, use originalEntries if promo was applied, otherwise use entries
      return miniPackage.originalEntries ?? miniPackage.entries ?? 0;
    } else {
      // For membership and one-time packages
      const membershipPackage = getPackageById(packageId);
      if (!membershipPackage) {
        console.warn(`⚠️ Package not found: ${packageId}`);
        return 0;
      }

      // Use originalEntries if promo was applied, otherwise use the appropriate field
      if (membershipPackage.originalEntries !== undefined) {
        return membershipPackage.originalEntries;
      }

      // Extract base entries based on package type
      if (membershipPackage.type === "subscription") {
        return membershipPackage.entriesPerMonth ?? 0;
      } else {
        // One-time package
        return membershipPackage.totalEntries ?? 0;
      }
    }
  } catch (error) {
    console.error(`❌ Error getting base entries for package ${packageId}:`, error);
    return 0;
  }
}

/**
 * Calculate upsell entries based on original package and promo multiplier
 *
 * Formula: upsellEntries = 2 × (baseEntries × promoMultiplier)
 *
 * @param params - Calculation parameters
 * @returns Calculated upsell entries count
 */
export function calculateUpsellEntries(params: CalculateUpsellEntriesParams): number {
  const { baseEntries, promoMultiplier } = params;

  // Validate inputs
  if (baseEntries < 0) {
    console.warn(`⚠️ Invalid baseEntries: ${baseEntries}, defaulting to 0`);
    return 0;
  }

  if (promoMultiplier < 1) {
    console.warn(`⚠️ Invalid promoMultiplier: ${promoMultiplier}, defaulting to 1`);
    return 2 * baseEntries; // Fallback to 2x base entries without promo
  }

  // Calculate: 2 × (baseEntries × promoMultiplier)
  const packageEntriesWithPromo = baseEntries * promoMultiplier;
  const upsellEntries = 2 * packageEntriesWithPromo;

  return Math.floor(upsellEntries); // Ensure integer result
}

/**
 * Calculate upsell entries from original purchase context
 * This is a convenience function that combines lookup and calculation
 *
 * @param originalPurchaseContext - Original purchase context with package info
 * @param promoMultiplier - Active promo multiplier
 * @returns Calculated upsell entries count
 */
export function calculateUpsellEntriesFromContext(
  originalPurchaseContext: {
    packageId: string;
    packageType: "membership" | "one-time" | "mini-draw";
    baseEntries?: number;
  },
  promoMultiplier: number
): number {
  // Use baseEntries from context if available, otherwise look up from package
  const baseEntries =
    originalPurchaseContext.baseEntries ??
    getPackageBaseEntries({
      packageId: originalPurchaseContext.packageId,
      packageType: originalPurchaseContext.packageType,
    });

  if (baseEntries === 0) {
    console.warn(
      `⚠️ Could not determine base entries for package ${originalPurchaseContext.packageId}, returning 0`
    );
    return 0;
  }

  return calculateUpsellEntries({
    baseEntries,
    packageType: originalPurchaseContext.packageType,
    promoMultiplier,
  });
}


