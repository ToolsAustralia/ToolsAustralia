/**
 * Upsell Image Selector Utility
 *
 * Dynamically selects upsell promotional images based on:
 * - Active promo multiplier (2x, 3x, 5x, 10x for membership Package images; 2x, 3x, 5x, 10x for one-time Plus/Upgrade)
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
 * Map upsell category to image category
 * Determines the correct image category based on the business category
 */
function getImageCategoryFromUpsellCategory(
  category: "subscription-plus" | "one-time-plus" | "additional-upgrade" | undefined,
  packageType: "membership" | "one-time" | "mini-draw" | undefined
): "Pack" | "Upgrade" | "Package" {
  // For membership packages with subscription-plus category, use "Package"
  if (packageType === "membership" && category === "subscription-plus") {
    return "Package";
  }

  // For one-time packages with one-time-plus category, use "Pack" (which becomes "Plus" in filename)
  if (packageType === "one-time" && category === "one-time-plus") {
    return "Pack";
  }

  // For one-time packages with additional-upgrade category, use "Upgrade"
  if (packageType === "one-time" && category === "additional-upgrade") {
    return "Upgrade";
  }

  // Fallback: try to infer from category alone
  if (category === "subscription-plus") {
    return "Package";
  }
  if (category === "one-time-plus") {
    return "Pack";
  }
  if (category === "additional-upgrade") {
    return "Upgrade";
  }

  // Default fallback
  return "Pack";
}

/**
 * Extract package name and category from upsell offer ID
 * Maps upsell IDs to their corresponding package names and image categories
 * Note: This is now primarily used for extracting package names. Image category should be determined from the category parameter.
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
 * 
 * @param multiplier - The promo multiplier (2, 3, 5, or 10)
 * @param packageName - The package name (e.g., "Foreman", "Tradie")
 * @param imageCategory - The image category: "Package" (membership), "Pack" (one-time plus), or "Upgrade" (additional upgrade)
 * @returns The full image path
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
  // File naming convention:
  // - Packages (membership): "10X Tradie Package.png" (uppercase X)
  // - Plus (one-time packs): "2X Apprentice Plus.png" (uppercase X, use "Plus" not "Pack")
  // - Upgrades (additional packs): "2X Apprentice Upgrade.png" (uppercase X for consistency)
  let imageFileName: string;
  if (imageCategory === "Package") {
    // Membership packages: "2X/3X/5X/10X {Package} Package.png" (e.g. 3X Boss Package.png, 5X Tradie Package.png; 2X images upcoming)
    imageFileName = `${multiplier}X ${normalizedPackageName} Package.png`;
  } else if (imageCategory === "Pack") {
    // One-time packs: "2X Apprentice Plus.png" or "3X Tradie Plus.png"
    // Note: Category is "Pack" internally but filename uses "Plus"
    // Uses uppercase X for consistency with Package images
    imageFileName = `${multiplier}X ${normalizedPackageName} Plus.png`;
  } else {
    // Upgrades (additional packs): "2X Apprentice Upgrade.png" or "3X Tradie Upgrade.png"
    // Uses uppercase X for consistency with Package and Plus images
    imageFileName = `${multiplier}X ${normalizedPackageName} ${imageCategory}.png`;
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
  const { offerId, packageType, promoMultiplier, category } = params;

  // Extract package info from offer ID (we need this for package name and fallback category checks)
  const extractedInfo = extractPackageInfo(offerId);
  const { packageName } = extractedInfo;

  // Determine image category from the category parameter (primary source of truth)
  const imageCategory = getImageCategoryFromUpsellCategory(category, packageType);

  // Supported membership promo multipliers for Package images: 2x, 3x, 5x, 10x (2X images upcoming)
  const membershipPromoMultipliers = [2, 3, 5, 10] as const;

  // Handle membership packages with 2x, 3x, 5x, or 10x promo FIRST (before the null check)
  // This ensures membership packages get the correct promo image (e.g. 3X Boss Package.png, 5X Tradie Package.png)
  if (
    packageType === "membership" &&
    promoMultiplier != null &&
    (membershipPromoMultipliers as readonly number[]).includes(promoMultiplier)
  ) {
    // Only subscription-plus packages have promo Package images (2X/3X/5X/10X {Package} Package.png)
    const isSubscriptionPlus =
      category === "subscription-plus" ||
      extractedInfo.imageCategory === "Package" ||
      offerId.endsWith("-plus-package");

    if (isSubscriptionPlus) {
      const promoImagePath = getPromoImagePath(promoMultiplier, packageName, "Package");
      return promoImagePath;
    }
  }

  // If no promo is active (null or undefined) or package type is missing, use base images
  if (promoMultiplier == null || promoMultiplier === 1 || !packageType) {
    const baseImageName = getBaseImagePath(offerId);
    return `/images/upsells/${baseImageName}`;
  }

  // Validate: one-time packages should never use "Package" category
  if (packageType === "one-time" && imageCategory === "Package") {
    // Fallback: if category is missing or invalid, try to infer from offerId
    if (extractedInfo.imageCategory !== "Package") {
      // Use the fallback if it's valid
      const promoImagePath = getPromoImagePath(promoMultiplier, packageName, extractedInfo.imageCategory);
      return promoImagePath;
    }
    // If fallback is also invalid, use base image
    const baseImageName = getBaseImagePath(offerId);
    return `/images/upsells/${baseImageName}`;
  }

  // Handle one-time packages with 2x, 3x, 5x, or 10x promo
  if (packageType === "one-time" && (promoMultiplier === 2 || promoMultiplier === 3 || promoMultiplier === 5 || promoMultiplier === 10)) {
    // Check if this is a mini-pack (they don't have promo images, use base)
    if (offerId.startsWith("mini-pack-")) {
      const baseImageName = getBaseImagePath(offerId);
      return `/images/upsells/${baseImageName}`;
    }

    // Use promo-specific one-time images with the correct category
    // imageCategory should be "Pack" (for one-time-plus) or "Upgrade" (for additional-upgrade)
    const promoImagePath = getPromoImagePath(promoMultiplier, packageName, imageCategory);
    return promoImagePath;
  }

  // Fallback to base image for any other cases
  const baseImageName = getBaseImagePath(offerId);
  return `/images/upsells/${baseImageName}`;
}

