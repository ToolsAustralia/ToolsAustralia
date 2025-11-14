/**
 * Member Package Mapping Utilities
 * Handles mapping between non-member and member packages
 * Provides safety checks for existing members
 */

import { StaticMembershipPackage } from "@/data/membershipPackages";

// Mapping from non-member packages to member packages
export const NON_MEMBER_TO_MEMBER_PACKAGE_MAP: Record<string, string> = {
  "apprentice-pack": "additional-apprentice-pack",
  "tradie-pack": "additional-tradie-pack",
  "foreman-pack": "additional-foreman-pack",
  "boss-pack": "additional-boss-pack",
  "power-pack": "additional-power-pack",
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
  return Object.keys(NON_MEMBER_TO_MEMBER_PACKAGE_MAP).includes(packageId);
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
 * Filter packages based on user membership status
 * @param packages - All packages to filter
 * @param isMember - Whether the user is a member
 * @returns Filtered packages appropriate for the user
 */
export const filterPackagesForUser = (
  packages: StaticMembershipPackage[],
  isMember: boolean
): StaticMembershipPackage[] => {
  if (!isMember) {
    // Non-members can see all packages
    return packages;
  }

  // Members should not see non-member packages
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
