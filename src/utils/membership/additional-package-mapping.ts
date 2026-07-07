/**
 * Additional Package Mapping Utilities
 * Handles mapping between PUBLIC packages and their ADDITIONAL equivalents.
 * Provides safety checks for users with additional-package access (subscription OR
 * current major-draw entries — see hasAdditionalPackageAccess).
 *
 * Terminology: "Additional" packs (flagged `isAdditional`) were previously mislabelled
 * "member-only". They are NOT subscriber-only — access is granted to anyone entered in
 * the current major draw (subscriber OR someone who bought entries this cycle).
 *
 * ⚠️ FRONTEND COPY RULE: "Additional" is a BACKEND-ONLY term (this flag, the `additional-*`
 * ids). In any USER-FACING string these are always called "one-time packages / one-time packs"
 * — never "Additional packages". A member just sees better prices + the per-card % off badge.
 * See docs/subscription/package-terminology.md.
 */

import { StaticMembershipPackage } from "@/data/membershipPackages";

/**
 * `useMemberships` builds a synthetic `plan.id` as `${slug-from-package-name}-member`
 * for the Additional-pack UI rows. The `-member` suffix is an internal ROW DISAMBIGUATOR
 * only (kept for compatibility with icon-map keys, the Stripe webhook handler, and stored
 * A/B `hidePackages`/`orderMap` matching — do not repurpose it). Canonical ids
 * (e.g. `additional-vip-pack`) drop it; strip the suffix before any comparison.
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

/** One-time packs shown on the public tab; used to filter/hide duplicates when the user has additional-package access. */
export const PUBLIC_ONE_TIME_PACKAGE_IDS: readonly string[] = [
  "apprentice-pack",
  "tradie-pack",
  "foreman-pack",
  "boss-pack",
  "power-pack",
  "vip-pack",
];

// Mapping from public packages to their Additional equivalents — omit tiers with no active Additional pack.
export const PUBLIC_TO_ADDITIONAL_PACKAGE_MAP: Record<string, string> = {
  "tradie-pack": "additional-tradie-pack",
  "foreman-pack": "additional-foreman-pack",
  "boss-pack": "additional-boss-pack",
  "power-pack": "additional-power-pack",
  "vip-pack": "additional-vip-pack",
};

/**
 * Get the Additional package that corresponds to a public package.
 * @param publicPackageId - The public package ID
 * @returns The corresponding Additional package ID, or null if no mapping exists
 */
export const getAdditionalPackageForPublic = (publicPackageId: string): string | null => {
  return PUBLIC_TO_ADDITIONAL_PACKAGE_MAP[publicPackageId] || null;
};

/**
 * Check if a package is a public (non-Additional) one-time package.
 * @param packageId - The package ID to check
 * @returns True if it's a public package
 */
export const isPublicPackage = (packageId: string): boolean => {
  return PUBLIC_ONE_TIME_PACKAGE_IDS.includes(packageId);
};

/**
 * Check if a package is an Additional package (requires additional-package access).
 * @param pkg - The package to check
 * @returns True if it's an Additional package
 */
export const isAdditionalPackage = (pkg: StaticMembershipPackage): boolean => {
  return pkg.isAdditional === true;
};

/**
 * Map a requested package to the version appropriate for the user.
 * @param packageId - The requested package ID
 * @param isMember - Whether the user is a subscriber (active subscription)
 * @param allPackages - All available packages
 * @returns The appropriate package ID for the user
 */
export const getAppropriatePackageForUser = (
  packageId: string,
  isMember: boolean,
  allPackages: StaticMembershipPackage[]
): string => {
  // Non-subscribers get the package as-is.
  if (!isMember) {
    return packageId;
  }

  // A subscriber requesting a public pack is mapped up to its Additional equivalent.
  if (isPublicPackage(packageId)) {
    const additionalPackageId = getAdditionalPackageForPublic(packageId);
    if (additionalPackageId) {
      // Verify the Additional package exists.
      const additionalPackage = allPackages.find((pkg) => pkg._id === additionalPackageId);
      if (additionalPackage) {
        console.log(`🔄 Auto-adjusting package: ${packageId} → ${additionalPackageId} (member upgrade)`);
        return additionalPackageId;
      }
    }
  }

  // Return the original package ID if no adjustment needed.
  return packageId;
};

/**
 * Filter packages based on additional-package access (subscription OR current draw entries).
 * @param packages - All packages to filter
 * @param hasAccess - Whether the user has additional-package access
 * @returns Filtered packages appropriate for the user
 */
export const filterPackagesForUser = (
  packages: StaticMembershipPackage[],
  hasAccess: boolean
): StaticMembershipPackage[] => {
  if (!hasAccess) {
    // Users without access see all packages (they'll see the public packs).
    return packages;
  }

  // Users with access should not see the public packs (they see the Additional packs).
  return packages.filter((pkg) => !isPublicPackage(pkg._id));
};

/**
 * Select which one-time packs the "Not subscribing?" drawer shows.
 * Mirrors the control MembershipSection's member behavior so an A/B treatment can
 * reach OFFER PARITY: a member (additional-package access) sees the Additional packs;
 * everyone else sees the public ladder. `includeAdditional` is the opt-in — when off,
 * behavior is the historical /membership one (public ladder for all).
 */
export function selectOneTimeDrawerPackages<T extends { isAdditional?: boolean }>(
  packages: T[],
  opts: { hasAdditionalAccess: boolean; includeAdditional: boolean }
): T[] {
  const showAdditional = opts.includeAdditional && opts.hasAdditionalAccess;
  return showAdditional
    ? packages.filter((p) => p.isAdditional === true)
    : packages.filter((p) => !p.isAdditional);
}

/**
 * Get a user-friendly message for package adjustment.
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
