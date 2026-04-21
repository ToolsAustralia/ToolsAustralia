/**
 * Centralized Package Icons Utility
 *
 * Single source of truth for all package icon imports and mappings.
 * This eliminates code duplication across 10+ files and ensures consistency.
 *
 * @module package-icons
 */

import type { StaticImageData } from "next/image";
import { isBossTierPlanId, isVipTierPlanId } from "@/utils/membership/member-package-mapping";

// Import all package icons
import apprentice from "../../../public/images/packageIcons/apprentice.webp";
import tradie from "../../../public/images/packageIcons/tradie.webp";
import foreman from "../../../public/images/packageIcons/foreman.webp";
import boss from "../../../public/images/packageIcons/boss.webp";
import power from "../../../public/images/packageIcons/power.webp";
import vip from "../../../public/images/packageIcons/vip.webp";

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
  "vip-pack": vip,

  // Additional packages (non-member)
  "additional-apprentice-pack": apprentice,
  "additional-tradie-pack": tradie,
  "additional-foreman-pack": foreman,
  "additional-boss-pack": boss,
  "additional-power-pack": power,
  "additional-vip-pack": vip,

  // Additional packages (member exclusive)
  "additional-apprentice-pack-member": apprentice,
  "additional-tradie-pack-member": tradie,
  "additional-foreman-pack-member": foreman,
  "additional-boss-pack-member": boss,
  "additional-power-pack-member": power,
  "additional-vip-pack-member": vip,

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

/** Tailwind scale classes — adjust Boss/VIP emphasis in one place sitewide. */
const PACKAGE_ICON_WRAPPER_SCALE = {
  bossResponsive: "scale-110 sm:scale-110",
  vipResponsive: "scale-105 sm:scale-105",
  bossCompact: "scale-110",
  vipCompact: "scale-105",
  desktopOneTimeDefault: "scale-[0.8]",
  desktopOneTimeVip: "scale-[0.88]",
  desktopSubscriptionBoss: "scale-110",
} as const;

/**
 * Where the icon sits in the UI (drives responsive vs compact vs membership desktop rules).
 * - `modal`: package cards in modals / mobile membership (Boss/VIP with sm: breakpoint)
 * - `chart-row` | `badge`: charts, admin tables, small chips (single scale class)
 * - `membership-desktop-*`: large desktop cards in MembershipSection only
 */
export type PackageIconWrapperScalePlacement =
  | "modal"
  | "chart-row"
  | "badge"
  | "membership-desktop-one-time"
  | "membership-desktop-subscription";

/**
 * Tailwind `scale-*` classes for the element wrapping a package icon `Image`.
 * Use with any fixed width/height icon so Boss/VIP sizing stays consistent everywhere.
 */
export function getPackageIconWrapperScaleClass(
  planId: string,
  placement: PackageIconWrapperScalePlacement
): string {
  const id = String(planId);
  const boss = isBossTierPlanId(id);
  const vip = isVipTierPlanId(id);

  if (placement === "membership-desktop-one-time") {
    return vip ? PACKAGE_ICON_WRAPPER_SCALE.desktopOneTimeVip : PACKAGE_ICON_WRAPPER_SCALE.desktopOneTimeDefault;
  }
  if (placement === "membership-desktop-subscription") {
    return boss ? PACKAGE_ICON_WRAPPER_SCALE.desktopSubscriptionBoss : "";
  }

  const isResponsive = placement === "modal";
  const isCompact = placement === "chart-row" || placement === "badge";

  if (boss) {
    if (isResponsive) return PACKAGE_ICON_WRAPPER_SCALE.bossResponsive;
    if (isCompact) return PACKAGE_ICON_WRAPPER_SCALE.bossCompact;
  }
  if (vip) {
    if (isResponsive) return PACKAGE_ICON_WRAPPER_SCALE.vipResponsive;
    if (isCompact) return PACKAGE_ICON_WRAPPER_SCALE.vipCompact;
  }
  return "";
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
    if (lowerName.includes("vip pack") || lowerName === "vip") return vip;
    if (lowerName.includes("power pack") || lowerName.includes("power")) return power;
    if (lowerName.includes("boss pack") || lowerName.includes("boss")) return boss;
    if (lowerName.includes("foreman pack") || lowerName.includes("foreman")) return foreman;
    if (lowerName.includes("tradie pack") || lowerName.includes("tradie")) return tradie;
    if (lowerName.includes("apprentice pack") || lowerName.includes("apprentice")) return apprentice;
  }

  return null;
}

// Export individual icons for direct use (e.g., in MembershipPackagesChart)
export { apprentice, tradie, foreman, boss, power, vip };
