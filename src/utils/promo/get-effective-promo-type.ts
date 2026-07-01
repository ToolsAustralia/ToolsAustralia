/**
 * Resolve which promo type (and thus which multiplier) applies to a package for a given user.
 * Member-only one-time packages use the membership promo when the user is a member.
 */

import { getPackageById, type StaticMembershipPackage } from "@/data/membershipPackages";

export type EffectivePromoType = "membership-packages" | "one-time-packages" | "mini-packages";

/**
 * Resolve package for promo lookup. Handles both canonical ids (e.g. "additional-apprentice-pack")
 * and useMemberships-style ids with "-member" suffix (e.g. "additional-apprentice-pack-member").
 */
function resolvePackageForPromo(packageId: string): StaticMembershipPackage | undefined {
  const pkg = getPackageById(packageId);
  if (pkg) return pkg;
  if (packageId.endsWith("-member")) {
    return getPackageById(packageId.slice(0, -7));
  }
  return undefined;
}

/**
 * Get the effective promo type for multiplier resolution.
 * - Subscription packages → membership-packages
 * - One-time member-only package + member → membership-packages
 * - One-time (regular or member-only + non-member) → one-time-packages
 *
 * @param packageId - Package ID (e.g. "additional-tradie-pack", "tradie-pack")
 * @param packageKind - "one-time" or "subscription"
 * @param isMember - User has active subscription
 */
export function getEffectivePromoType(
  packageId: string,
  packageKind: "one-time" | "subscription",
  isMember: boolean
): EffectivePromoType {
  if (packageKind === "subscription") {
    return "membership-packages";
  }

  if (packageKind === "one-time") {
    const pkg = resolvePackageForPromo(packageId);
    if (isMember && pkg?.isAdditional === true) {
      return "membership-packages";
    }
    return "one-time-packages";
  }

  return "one-time-packages";
}

/**
 * Check if a package is member-only from static data.
 */
export function isAdditionalPackageById(packageId: string): boolean {
  const pkg = resolvePackageForPromo(packageId);
  return pkg?.isAdditional === true;
}
