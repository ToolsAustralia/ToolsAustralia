/**
 * Upsell Image Selector Utility
 *
 * Dynamically selects upsell promotional images based on:
 * - Active promo multiplier (2x, 3x for one-time; 10x for membership)
 * - Package type (membership vs one-time)
 * - Upsell category (Pack vs Upgrade vs Package)
 *
 * Falls back to base images when no promo is active or when promo-specific images are unavailable.
 */

export interface UpsellImageParams {
  offerId: string;
  packageType?: "membership" | "one-time" | "mini-draw";
  promoMultiplier?: number;
  category?: "subscription-plus" | "one-time-plus" | "additional-upgrade";
}

/**
 * Extract package name and category from upsell offer ID
 * Maps upsell IDs to their corresponding package names and image categories
 */
function extractPackageInfo(offerId: string): {
  packageName: string;
  imageCategory: "Pack" | "Upgrade" | "Package";
} {
  // Map upsell IDs to package names and categories
  const packageMap: Record<
    string,
    { packageName: string; imageCategory: "Pack" | "Upgrade" | "Package" }
  > = {
    // === SUBSCRIPTION PLUS PACKAGES ===
    "tradie-plus-package": { packageName: "Tradie", imageCategory: "Package" },
    "foreman-plus-package": { packageName: "Foreman", imageCategory: "Package" },
    "boss-plus-package": { packageName: "Boss", imageCategory: "Package" },

    // === ONE-TIME PLUS PACKAGES ===
    "apprentice-plus-pack": { packageName: "Apprentice", imageCategory: "Pack" },
    "tradie-plus-pack": { packageName: "Tradie", imageCategory: "Pack" },
    "foreman-plus-pack": { packageName: "Foreman", imageCategory: "Pack" },
    "boss-plus-pack": { packageName: "Boss", imageCategory: "Pack" },
    "power-plus-pack": { packageName: "Power", imageCategory: "Pack" },

    // === ADDITIONAL UPGRADE PACKAGES ===
    "additional-apprentice-pack-upgrade": { packageName: "Apprentice", imageCategory: "Upgrade" },
    "additional-tradie-pack-upgrade": { packageName: "Tradie", imageCategory: "Upgrade" },
    "additional-foreman-pack-upgrade": { packageName: "Foreman", imageCategory: "Upgrade" },
    "additional-boss-pack-upgrade": { packageName: "Boss", imageCategory: "Upgrade" },
    "additional-power-pack-upgrade": { packageName: "Power", imageCategory: "Upgrade" },

    // === MINI PACK UPGRADES ===
    "mini-pack-1-upgrade": { packageName: "Mini Pack 1", imageCategory: "Pack" },
    "mini-pack-2-upgrade": { packageName: "Mini Pack 2", imageCategory: "Pack" },
    "mini-pack-3-upgrade": { packageName: "Mini Pack 3", imageCategory: "Pack" },
    "mini-pack-4-upgrade": { packageName: "Mini Pack 4", imageCategory: "Pack" },
    "mini-pack-5-upgrade": { packageName: "Mini Pack 5", imageCategory: "Pack" },
    "mini-pack-6-upgrade": { packageName: "Mini Pack 6", imageCategory: "Pack" },
    "mini-pack-7-upgrade": { packageName: "Mini Pack 7", imageCategory: "Pack" },
    "mini-pack-8-upgrade": { packageName: "Mini Pack 8", imageCategory: "Pack" },
  };

  return (
    packageMap[offerId] || {
      packageName: "Tradie",
      imageCategory: "Package",
    }
  );
}

/**
 * Get base image path (no promo active)
 */
function getBaseImagePath(offerId: string): string {
  const baseImageMap: Record<string, string> = {
    // === SUBSCRIPTION PLUS PACKAGES ===
    "tradie-plus-package": "Tradie Package.png",
    "foreman-plus-package": "Foreman Package.png",
    "boss-plus-package": "Boss Package.png",

    // === ONE-TIME PLUS PACKAGES ===
    "apprentice-plus-pack": "Apprentice Plus.png",
    "tradie-plus-pack": "Tradie Plus.png",
    "foreman-plus-pack": "Foreman Plus.png",
    "boss-plus-pack": "Boss Plus.png",
    "power-plus-pack": "Power Plus.png",

    // === ADDITIONAL UPGRADE PACKAGES ===
    "additional-apprentice-pack-upgrade": "Apprentice Upgrade.png",
    "additional-tradie-pack-upgrade": "Tradie Upgrade.png",
    "additional-foreman-pack-upgrade": "Foreman Upgrade.png",
    "additional-boss-pack-upgrade": "Boss Upgrade.png",
    "additional-power-pack-upgrade": "Power Upgrade.png",

    // === MINI PACK UPGRADES ===
    "mini-pack-1-upgrade": "Mini Pack 1.png",
    "mini-pack-2-upgrade": "Mini Pack 2.png",
    "mini-pack-3-upgrade": "Mini Pack 3.png",
    "mini-pack-4-upgrade": "Mini Pack 4.png",
    "mini-pack-5-upgrade": "Mini Pack 5.png",
    "mini-pack-6-upgrade": "Mini Pack 6.png",
    "mini-pack-7-upgrade": "Mini Pack 7.png",
    "mini-pack-8-upgrade": "Mini Pack 8.png",
  };

  return baseImageMap[offerId] || "Tradie Plus.png";
}

/**
 * Get promo-specific image path
 * Constructs the path based on multiplier, package name, and category
 */
function getPromoImagePath(
  multiplier: number,
  packageName: string,
  imageCategory: "Pack" | "Upgrade" | "Package"
): string {
  // Normalize package name for image filename (handle "Mini Pack X" differently)
  let normalizedPackageName = packageName;

  // For mini packs, keep the full name
  if (packageName.startsWith("Mini Pack")) {
    normalizedPackageName = packageName;
  }

  // Construct image filename based on category
  // Note: File naming convention - Upgrades use lowercase "x", Packs and Packages use uppercase "X"
  let imageFileName: string;
  if (imageCategory === "Package") {
    // Membership packages: "10X Tradie Package.png"
    imageFileName = `${multiplier}X ${normalizedPackageName} Package.png`;
  } else if (imageCategory === "Pack") {
    // One-time packs: "2X Apprentice Pack.png" or "3X Tradie Pack.png"
    imageFileName = `${multiplier}X ${normalizedPackageName} ${imageCategory}.png`;
  } else {
    // Upgrades: "2x Apprentice Upgrade.png" or "3x Tradie Upgrade.png"
    // Note: Upgrades use lowercase "x" in the filename (matching actual file names)
    imageFileName = `${multiplier}x ${normalizedPackageName} ${imageCategory}.png`;
  }

  return `/images/upsells/active-promo/${imageFileName}`;
}

/**
 * Get upsell image path based on active promo multiplier
 *
 * @param params - Parameters for image selection
 * @returns Image path string
 */
export function getUpsellImagePath(params: UpsellImageParams): string {
  const { offerId, packageType, promoMultiplier = 1, category } = params;

  // If no promo is active (multiplier === 1) or package type is missing, use base images
  if (promoMultiplier === 1 || !packageType) {
    const baseImageName = getBaseImagePath(offerId);
    return `/images/upsells/${baseImageName}`;
  }

  // Extract package info from offer ID
  const { packageName, imageCategory } = extractPackageInfo(offerId);

  // Handle one-time packages with 2x or 3x promo
  if (packageType === "one-time" && (promoMultiplier === 2 || promoMultiplier === 3)) {
    // Check if this is a mini-pack (they don't have promo images, use base)
    if (offerId.startsWith("mini-pack-")) {
      const baseImageName = getBaseImagePath(offerId);
      return `/images/upsells/${baseImageName}`;
    }

    // Use promo-specific one-time images
    const promoImagePath = getPromoImagePath(promoMultiplier, packageName, imageCategory);
    return promoImagePath;
  }

  // Handle membership packages with 10x promo
  if (packageType === "membership" && promoMultiplier === 10) {
    // Only subscription-plus packages have 10x images
    if (category === "subscription-plus") {
      const promoImagePath = getPromoImagePath(10, packageName, "Package");
      return promoImagePath;
    }
  }

  // Fallback to base image for any other cases
  const baseImageName = getBaseImagePath(offerId);
  return `/images/upsells/${baseImageName}`;
}

