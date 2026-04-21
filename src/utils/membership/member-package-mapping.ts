/**
 * Member Package Mapping Utilities
 * Handles mapping between non-member and additional packages
 * Provides safety checks for users with access (subscription OR current draw entries)
 *
 * Note: Additional packages are now accessible to users with:
 * - Active subscription, OR
 * - Entries in the current major draw
 */

import { StaticMembershipPackage } from "@/data/membershipPackages";

/**
 * `useMemberships` builds synthetic `plan.id` as `${slug-from-package-name}-member` for member-only rows.
 * Static data / icons / UI flags use canonical ids (e.g. `additional-vip-pack`). Strip the suffix for comparisons.
 */
export function normalizeMembershipPlanId(planId: string): string {
  return planId.replace(/-member$/u, "");
}

/** VIP one-time tiers (canonical ids after normalization). */
export function isVipTierPlanId(planId: string): boolean {
  const n = normalizeMembershipPlanId(planId);
  return n === "vip-pack" || n === "additional-vip-pack";
}

/** Boss tier (subscriptions, boss-pack, additional-boss-pack, etc.). */
export function isBossTierPlanId(planId: string): boolean {
  return normalizeMembershipPlanId(planId).toLowerCase().includes("boss");
}

/** Boss subscription, or Power/VIP one-time (incl. additional * packs) — Best Value ribbon. */
export function isOneTimeBestValuePlanId(planId: string): boolean {
  const n = normalizeMembershipPlanId(planId);
  return (
    n === "vip-pack" ||
    n === "additional-vip-pack" ||
    n === "power-pack" ||
    n === "additional-power-pack"
  );
}

/** One-time packs shown on the public tab; used to filter/hide duplicates when user has additional-package access */
export const NON_MEMBER_ONE_TIME_PACKAGE_IDS: readonly string[] = [
  "apprentice-pack",
  "tradie-pack",
  "foreman-pack",
  "boss-pack",
  "power-pack",
  "vip-pack",
];

// Mapping from non-member packages to additional (member) packages — omit tiers with no active additional pack
export const NON_MEMBER_TO_MEMBER_PACKAGE_MAP: Record<string, string> = {
  "tradie-pack": "additional-tradie-pack",
  "foreman-pack": "additional-foreman-pack",
  "boss-pack": "additional-boss-pack",
  "power-pack": "additional-power-pack",
  "vip-pack": "additional-vip-pack",
};

/**
 * Get the corresponding member package for a non-member package
 * @param nonMemberPackageId - The non-member package ID
 * @returns The corresponding member package ID, or null if no mapping exists
 */
export const getMemberPackageForNonMember = (nonMemberPackageId: string): string | null => {
  return NON_MEMBER_TO_MEMBER_PACKAGE_MAP[nonMemberPackageId] || null;
};

/**
 * Check if a package is a non-member package
 * @param packageId - The package ID to check
 * @returns True if it's a non-member package
 */
export const isNonMemberPackage = (packageId: string): boolean => {
  return NON_MEMBER_ONE_TIME_PACKAGE_IDS.includes(packageId);
};

/**
 * Check if a package is a member-only package
 * @param pkg - The package to check
 * @returns True if it's a member-only package
 */
export const isMemberOnlyPackage = (pkg: StaticMembershipPackage): boolean => {
  return pkg.isMemberOnly === true;
};

/**
 * Get the appropriate package for a user based on their membership status
 * @param packageId - The requested package ID
 * @param isMember - Whether the user is a member
 * @param allPackages - All available packages
 * @returns The appropriate package ID for the user
 */
export const getAppropriatePackageForUser = (
  packageId: string,
  isMember: boolean,
  allPackages: StaticMembershipPackage[]
): string => {
  // If user is not a member, return the package as-is
  if (!isMember) {
    return packageId;
  }

  // If user is a member and requests a non-member package, map to member package
  if (isNonMemberPackage(packageId)) {
    const memberPackageId = getMemberPackageForNonMember(packageId);
    if (memberPackageId) {
      // Verify the member package exists
      const memberPackage = allPackages.find((pkg) => pkg._id === memberPackageId);
      if (memberPackage) {
        console.log(`🔄 Auto-adjusting package: ${packageId} → ${memberPackageId} (member upgrade)`);
        return memberPackageId;
      }
    }
  }

  // Return the original package ID if no adjustment needed
  return packageId;
};

/**
 * Filter packages based on user access (subscription OR current draw entries)
 * @param packages - All packages to filter
 * @param hasAccess - Whether the user has access to additional packages (subscription OR current draw entries)
 * @returns Filtered packages appropriate for the user
 */
export const filterPackagesForUser = (
  packages: StaticMembershipPackage[],
  hasAccess: boolean
): StaticMembershipPackage[] => {
  if (!hasAccess) {
    // Users without access can see all packages (they'll see regular packages)
    return packages;
  }

  // Users with access should not see non-member packages (they see additional packages)
  return packages.filter((pkg) => !isNonMemberPackage(pkg._id));
};

/**
 * Get a user-friendly message for package adjustment
 * @param originalPackageId - The original package ID
 * @param adjustedPackageId - The adjusted package ID
 * @param allPackages - All available packages
 * @returns A user-friendly message
 */
export const getPackageAdjustmentMessage = (
  originalPackageId: string,
  adjustedPackageId: string,
  allPackages: StaticMembershipPackage[]
): string => {
  const originalPackage = allPackages.find((pkg) => pkg._id === originalPackageId);
  const adjustedPackage = allPackages.find((pkg) => pkg._id === adjustedPackageId);

  if (originalPackage && adjustedPackage) {
    return `As a member, you've been upgraded from "${originalPackage.name}" to "${adjustedPackage.name}" with better benefits!`;
  }

  return "Package has been adjusted for your membership level.";
};
