/**
 * Centralized Package Icons Utility
 *
 * Single source of truth for all package icon imports and mappings.
 * This eliminates code duplication across 10+ files and ensures consistency.
 *
 * @module package-icons
 */

import type { StaticImageData } from "next/image";

// Import all package icons
import apprentice from "../../../public/images/packageIcons/apprentice.png";
import tradie from "../../../public/images/packageIcons/tradie.png";
import foreman from "../../../public/images/packageIcons/foreman.png";
import boss from "../../../public/images/packageIcons/boss.png";
import power from "../../../public/images/packageIcons/power.png";

/**
 * Type alias for package icon data (StaticImageData from Next.js)
 * Exported for use in components that need to type their icon props
 */
export type PackageIconData = StaticImageData;

/**
 * Centralized mapping of plan IDs to their corresponding package icons.
 *
 * Supports:
 * - One-time packages (apprentice-pack, tradie-pack, etc.)
 * - Additional packages (additional-*-pack, additional-*-pack-member)
 * - Subscription packages (tradie, foreman, boss)
 *
 * @example
 * PACKAGE_ICONS["tradie-pack"] // Returns tradie icon
 * PACKAGE_ICONS["boss"] // Returns boss icon
 */
export const PACKAGE_ICONS: Record<string, PackageIconData> = {
  // One-time packages
  "apprentice-pack": apprentice,
  "tradie-pack": tradie,
  "foreman-pack": foreman,
  "boss-pack": boss,
  "power-pack": power,

  // Additional packages (non-member)
  "additional-apprentice-pack": apprentice,
  "additional-tradie-pack": tradie,
  "additional-foreman-pack": foreman,
  "additional-boss-pack": boss,
  "additional-power-pack": power,

  // Additional packages (member exclusive)
  "additional-apprentice-pack-member": apprentice,
  "additional-tradie-pack-member": tradie,
  "additional-foreman-pack-member": foreman,
  "additional-boss-pack-member": boss,
  "additional-power-pack-member": power,

  // Subscription packages (using generated IDs from useMemberships hook)
  tradie: tradie,
  foreman: foreman,
  boss: boss,

  // Subscription package IDs (tradie-subscription, etc.)
  "tradie-subscription": tradie,
  "foreman-subscription": foreman,
  "boss-subscription": boss,
};

/**
 * Get package icon based on plan ID.
 *
 * This function provides a type-safe way to retrieve package icons.
 * Returns null if no matching icon is found.
 *
 * @param planId - The plan ID to look up (e.g., "tradie-pack", "boss", "additional-foreman-pack-member")
 * @returns The corresponding StaticImageData icon, or null if not found
 *
 * @example
 * const icon = getPackageIcon("tradie-pack"); // Returns tradie icon
 * const icon = getPackageIcon("unknown-plan"); // Returns null
 */
export function getPackageIcon(planId: string): PackageIconData | null {
  return PACKAGE_ICONS[planId] || null;
}

/**
 * Get package icon by package name (for backward compatibility).
 *
 * This function supports legacy code that uses package names instead of plan IDs.
 * It performs case-insensitive matching and handles both subscription and one-time packages.
 *
 * @param packageName - The package name to look up (e.g., "Boss", "Tradie Pack")
 * @param membershipType - Optional type hint ("subscription" or "one-time")
 * @returns The corresponding StaticImageData icon, or null if not found
 *
 * @example
 * const icon = getPackageIconByName("Boss", "subscription"); // Returns boss icon
 * const icon = getPackageIconByName("Tradie Pack", "one-time"); // Returns tradie icon
 */
export function getPackageIconByName(
  packageName: string,
  membershipType?: "subscription" | "one-time"
): PackageIconData | null {
  if (!packageName) return null;

  const lowerName = packageName.toLowerCase();
  const isSubscription = membershipType === "subscription";

  // For subscriptions, use simple names
  if (isSubscription) {
    if (lowerName.includes("boss")) return boss;
    if (lowerName.includes("foreman")) return foreman;
    if (lowerName.includes("tradie")) return tradie;
  }

  // For one-time packages, check for pack names
  if (!isSubscription || membershipType === undefined) {
    if (lowerName.includes("power pack") || lowerName.includes("power")) return power;
    if (lowerName.includes("boss pack") || lowerName.includes("boss")) return boss;
    if (lowerName.includes("foreman pack") || lowerName.includes("foreman")) return foreman;
    if (lowerName.includes("tradie pack") || lowerName.includes("tradie")) return tradie;
    if (lowerName.includes("apprentice pack") || lowerName.includes("apprentice")) return apprentice;
  }

  return null;
}

// Export individual icons for direct use (e.g., in MembershipPackagesChart)
export { apprentice, tradie, foreman, boss, power };
