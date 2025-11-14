/**
 * Static Upsell Packages Data
 * Based on the provided upsell popup specifications
 *
 * This file contains all upsell offers that appear after membership purchases
 * with their complete configuration and targeting rules.
 */

export interface StaticUpsellPackage {
  id: string;
  name: string;
  description: string;
  category: "subscription-plus" | "one-time-plus" | "additional-upgrade";
  originalPrice: number;
  discountedPrice: number;
  discountPercentage: number;
  entriesCount: number;
  shopDiscountPercent?: number;
  partnerDiscountDays?: number;
  accessAfterExpiry?: number; // Days access after membership expires
  buttonText: string;
  conditions: string[];
  urgencyText?: string;
  validUntil?: string;
  priority: number;
  imageUrl?: string;
  // Targeting and display rules
  isActive: boolean;
  targetAudience: string[];
  userSegments: string[];
  maxShowsPerUser: number;
  cooldownHours: number;
  // Package targeting
  triggersOnPackageIds?: string[]; // Which packages trigger this upsell
  triggersOnPackageTypes?: string[]; // Which package types trigger this upsell
  // Display rules
  showAfterPurchase?: boolean; // Show immediately after purchase
  showAfterDelay?: number; // Delay in seconds before showing
}

/**
 * All upsell packages based on the provided specifications
 */
export const upsellPackages: StaticUpsellPackage[] = [
  // === SUBSCRIPTION PLUS PACKAGES ===
  {
    id: "tradie-plus-package",
    name: "Tradie Plus Package",
    description: "Enhance your Tradie membership with bonus entries and extended benefits",
    category: "subscription-plus",
    originalPrice: 15,
    discountedPrice: 9.99,
    discountPercentage: 33,
    entriesCount: 30,
    shopDiscountPercent: 5,
    partnerDiscountDays: 30,
    accessAfterExpiry: 1,
    buttonText: "Add Tradie Plus - $9.99",
    conditions: [
      "30 One-time Entries",
      "5% Off Shop",
      "100% Access to Partner Discounts",
      "1 Day access after membership expires",
    ],
    urgencyText: "Limited time offer!",
    priority: 10,
    isActive: true,
    targetAudience: ["membership-purchase"],
    userSegments: ["new-user", "returning-user"],
    maxShowsPerUser: 2,
    cooldownHours: 24,
    triggersOnPackageIds: ["tradie-subscription"], // Tradie subscription
    triggersOnPackageTypes: ["subscription"],
    showAfterPurchase: true,
    showAfterDelay: 2,
  },
  {
    id: "foreman-plus-package",
    name: "Foreman Plus Package",
    description: "Supercharge your Foreman membership with extra entries and premium benefits",
    category: "subscription-plus",
    originalPrice: 25,
    discountedPrice: 19.99,
    discountPercentage: 20,
    entriesCount: 80,
    shopDiscountPercent: 10,
    partnerDiscountDays: 30,
    accessAfterExpiry: 2,
    buttonText: "Add Foreman Plus - $19.99",
    conditions: [
      "80 Free One-Time Entries",
      "10% Off Shop",
      "100% Access to Partner Discounts",
      "2 Days access after membership expires",
    ],
    urgencyText: "Exclusive Foreman offer!",
    priority: 10,
    isActive: true,
    targetAudience: ["membership-purchase"],
    userSegments: ["new-user", "returning-user"],
    maxShowsPerUser: 2,
    cooldownHours: 24,
    triggersOnPackageIds: ["foreman-subscription"], // Foreman subscription
    triggersOnPackageTypes: ["subscription"],
    showAfterPurchase: true,
    showAfterDelay: 2,
  },
  {
    id: "boss-plus-package",
    name: "Boss Plus Package",
    description: "Ultimate Boss enhancement with maximum entries and exclusive benefits",
    category: "subscription-plus",
    originalPrice: 50,
    discountedPrice: 39.99,
    discountPercentage: 20,
    entriesCount: 200,
    shopDiscountPercent: 20,
    partnerDiscountDays: 30,
    accessAfterExpiry: 3,
    buttonText: "Add Boss Plus - $39.99",
    conditions: [
      "200 Free One-Time Entries",
      "20% Off Shop",
      "100% Access to Partner Discounts",
      "3 Days access after membership expires",
    ],
    urgencyText: "Boss Exclusive!",
    priority: 10,
    isActive: true,
    targetAudience: ["membership-purchase"],
    userSegments: ["new-user", "returning-user"],
    maxShowsPerUser: 2,
    cooldownHours: 24,
    triggersOnPackageIds: ["boss-subscription"], // Boss subscription
    triggersOnPackageTypes: ["subscription"],
    showAfterPurchase: true,
    showAfterDelay: 2,
  },

  // === ONE-TIME PLUS PACKAGES ===
  {
    id: "apprentice-plus-pack",
    name: "Apprentice Plus Pack",
    description: "Boost your Apprentice Pack with additional entries and extended benefits",
    category: "one-time-plus",
    originalPrice: 12.5,
    discountedPrice: 12.5,
    discountPercentage: 20,
    entriesCount: 6,
    shopDiscountPercent: 0,
    partnerDiscountDays: 1,
    buttonText: "Add Apprentice Plus - $12.5",
    conditions: [
      "$12.5 One Time Payment",
      "6 Free One Time Entries",
      "1 Days Access to Partner Discounts",
      "100% of Partner Discounts Available",
    ],
    urgencyText: "Quick boost available!",
    priority: 8,
    isActive: true,
    targetAudience: ["one-time-purchase"],
    userSegments: ["new-user", "returning-user"],
    maxShowsPerUser: 3,
    cooldownHours: 12,
    triggersOnPackageIds: ["apprentice-pack"], // Apprentice Pack (non-member)
    triggersOnPackageTypes: ["one-time"],
    showAfterPurchase: true,
    showAfterDelay: 2,
  },
  {
    id: "tradie-plus-pack",
    name: "Tradie Plus Pack",
    description: "Enhance your Tradie Pack with bonus entries and extended access",
    category: "one-time-plus",
    originalPrice: 24.5,
    discountedPrice: 24.5,
    discountPercentage: 18,
    entriesCount: 30,
    shopDiscountPercent: 0,
    partnerDiscountDays: 2,
    buttonText: "Add Tradie Plus - $24.5",
    conditions: [
      "$24.5 One Time Payment",
      "30 Free One Time Entries",
      "2 Days Access to Partner Discounts",
      "100% of Partner Discounts Available",
    ],
    urgencyText: "Tradie boost available!",
    priority: 8,
    isActive: true,
    targetAudience: ["one-time-purchase"],
    userSegments: ["new-user", "returning-user"],
    maxShowsPerUser: 3,
    cooldownHours: 12,
    triggersOnPackageIds: ["tradie-pack"], // Tradie Pack (non-member)
    triggersOnPackageTypes: ["one-time"],
    showAfterPurchase: true,
    showAfterDelay: 2,
  },
  {
    id: "foreman-plus-pack",
    name: "Foreman Plus Pack",
    description: "Power up your Foreman Pack with maximum entries and premium benefits",
    category: "one-time-plus",
    originalPrice: 49.99,
    discountedPrice: 49.99,
    discountPercentage: 0,
    entriesCount: 60,
    shopDiscountPercent: 0,
    partnerDiscountDays: 4,
    buttonText: "Add Foreman Plus - $49.99",
    conditions: [
      "$49.99 One Time Payment",
      "60 Free One Time Entries",
      "4 Days Access to Partner Discounts",
      "100% of Partner Discounts Available",
    ],
    urgencyText: "Foreman boost!",
    priority: 8,
    isActive: true,
    targetAudience: ["one-time-purchase"],
    userSegments: ["new-user", "returning-user"],
    maxShowsPerUser: 3,
    cooldownHours: 12,
    triggersOnPackageIds: ["foreman-pack"], // Foreman Pack (non-member) - FIXED: Use package ID instead of MongoDB ObjectID
    triggersOnPackageTypes: ["one-time"],
    showAfterPurchase: true,
    showAfterDelay: 2,
  },
  {
    id: "boss-plus-pack",
    name: "Boss Plus Pack",
    description: "Ultimate enhancement for your Boss Pack with massive entries",
    category: "one-time-plus",
    originalPrice: 124.99,
    discountedPrice: 124.99,
    discountPercentage: 0,
    entriesCount: 300,
    shopDiscountPercent: 0,
    partnerDiscountDays: 10,
    buttonText: "Add Boss Plus - $124.99",
    conditions: [
      "$124.99 One Time Payment",
      "300 Free One Time Entries",
      "10 Days Access to Partner Discounts",
      "100% of Partner Discounts Available",
    ],
    urgencyText: "Boss boost!",
    priority: 8,
    isActive: true,
    targetAudience: ["one-time-purchase"],
    userSegments: ["new-user", "returning-user"],
    maxShowsPerUser: 3,
    cooldownHours: 12,
    triggersOnPackageIds: ["boss-pack"], // Boss Pack (non-member) - FIXED: Use package ID instead of MongoDB ObjectID
    triggersOnPackageTypes: ["one-time"],
    showAfterPurchase: true,
    showAfterDelay: 2,
  },
  {
    id: "power-plus-pack",
    name: "Power Plus Pack",
    description: "Maximum power enhancement for your Power Pack with elite entries",
    category: "one-time-plus",
    originalPrice: 249.99,
    discountedPrice: 249.99,
    discountPercentage: 0,
    entriesCount: 1200,
    shopDiscountPercent: 0,
    partnerDiscountDays: 20,
    buttonText: "Add Power Plus - $249.99",
    conditions: [
      "$249.99 One Time Payment",
      "1200 Free One Time Entries",
      "20 Days Access to Partner Discounts",
      "100% of Partner Discounts Available",
    ],
    urgencyText: "Power boost available!",
    priority: 8,
    isActive: true,
    targetAudience: ["one-time-purchase"],
    userSegments: ["new-user", "returning-user"],
    maxShowsPerUser: 3,
    cooldownHours: 12,
    triggersOnPackageIds: ["power-pack"], // Power Pack (non-member) - FIXED: Use package ID instead of MongoDB ObjectID
    triggersOnPackageTypes: ["one-time"],
    showAfterPurchase: true,
    showAfterDelay: 2,
  },

  // === ADDITIONAL UPGRADE PACKAGES ===
  {
    id: "additional-apprentice-pack-upgrade",
    name: "Additional Apprentice Pack Upgrade",
    description: "Get additional entries with your Apprentice Pack purchase",
    category: "additional-upgrade",
    originalPrice: 12.5,
    discountedPrice: 12.5,
    discountPercentage: 0,
    entriesCount: 20,
    shopDiscountPercent: 0,
    partnerDiscountDays: 1,
    buttonText: "Add Apprentice Upgrade - $12.50",
    conditions: [
      "$12.50 One Time Payment",
      "20 Free One Time Entries",
      "1 Days Access to Partner Discounts",
      "100% of Partner Discounts Available",
    ],
    urgencyText: "Upgrade available!",
    priority: 6,
    isActive: true,
    targetAudience: ["one-time-purchase"],
    userSegments: ["new-user", "returning-user", "special-package-buyer"],
    maxShowsPerUser: 2,
    cooldownHours: 24,
    triggersOnPackageIds: ["apprentice-pack", "additional-apprentice-pack"], // Apprentice Pack (both non-member and member-only)
    triggersOnPackageTypes: ["one-time"],
    showAfterPurchase: true,
    showAfterDelay: 3,
  },
  {
    id: "additional-tradie-pack-upgrade",
    name: "Additional Tradie Pack Upgrade",
    description: "Enhance your Tradie Pack with additional entries",
    category: "additional-upgrade",
    originalPrice: 24.99,
    discountedPrice: 24.99,
    discountPercentage: 0,
    entriesCount: 60,
    shopDiscountPercent: 0,
    partnerDiscountDays: 2,
    buttonText: "Add Tradie Upgrade - $24.99",
    conditions: [
      "$24.99 One Time Payment",
      "60 Free One Time Entries",
      "2 Days Access to Partner Discounts",
      "100% of Partner Discounts Available",
    ],
    urgencyText: "Tradie upgrade available!",
    priority: 6,
    isActive: true,
    targetAudience: ["one-time-purchase"],
    userSegments: ["new-user", "returning-user", "special-package-buyer"],
    maxShowsPerUser: 2,
    cooldownHours: 24,
    triggersOnPackageIds: ["tradie-pack", "additional-tradie-pack"], // Tradie Pack (both non-member and member-only)
    triggersOnPackageTypes: ["one-time"],
    showAfterPurchase: true,
    showAfterDelay: 3,
  },
  {
    id: "additional-foreman-pack-upgrade",
    name: "Additional Foreman Pack Upgrade",
    description: "Power up your Foreman Pack with bonus entries",
    category: "additional-upgrade",
    originalPrice: 49.99,
    discountedPrice: 49.99,
    discountPercentage: 0,
    entriesCount: 200,
    shopDiscountPercent: 0,
    partnerDiscountDays: 4,
    buttonText: "Add Foreman Upgrade - $49.99",
    conditions: [
      "$49.99 One Time Payment",
      "200 Free One Time Entries",
      "4 Days Access to Partner Discounts",
      "100% of Partner Discounts Available",
    ],
    urgencyText: "Foreman upgrade available!",
    priority: 6,
    isActive: true,
    targetAudience: ["one-time-purchase"],
    userSegments: ["new-user", "returning-user", "special-package-buyer"],
    maxShowsPerUser: 2,
    cooldownHours: 24,
    triggersOnPackageIds: ["foreman-pack", "additional-foreman-pack"], // Foreman Pack (both non-member and member-only)
    triggersOnPackageTypes: ["one-time"],
    showAfterPurchase: true,
    showAfterDelay: 3,
  },
  {
    id: "additional-boss-pack-upgrade",
    name: "Additional Boss Pack Upgrade",
    description: "Ultimate enhancement for your Boss Pack",
    category: "additional-upgrade",
    originalPrice: 124.99,
    discountedPrice: 124.99,
    discountPercentage: 0,
    entriesCount: 800,
    shopDiscountPercent: 0,
    partnerDiscountDays: 10,
    buttonText: "Add Boss Upgrade - $124.99",
    conditions: [
      "$124.99 One Time Payment",
      "800 Free One Time Entries",
      "10 Days Access to Partner Discounts",
      "100% of Partner Discounts Available",
    ],
    urgencyText: "Boss upgrade available!",
    priority: 6,
    isActive: true,
    targetAudience: ["one-time-purchase"],
    userSegments: ["new-user", "returning-user", "special-package-buyer"],
    maxShowsPerUser: 2,
    cooldownHours: 24,
    triggersOnPackageIds: ["boss-pack", "additional-boss-pack"], // Boss Pack (both non-member and member-only)
    triggersOnPackageTypes: ["one-time"],
    showAfterPurchase: true,
    showAfterDelay: 3,
  },
  {
    id: "additional-power-pack-upgrade",
    name: "Additional Power Pack Upgrade",
    description: "Maximum power enhancement for your Power Pack",
    category: "additional-upgrade",
    originalPrice: 249.99,
    discountedPrice: 249.99,
    discountPercentage: 0,
    entriesCount: 2400,
    shopDiscountPercent: 0,
    partnerDiscountDays: 20,
    buttonText: "Add Power Upgrade - $249.99",
    conditions: [
      "$249.99 One Time Payment",
      "2400 Free One Time Entries",
      "20 Days Access to Partner Discounts",
      "100% of Partner Discounts Available",
    ],
    urgencyText: "Power upgrade available!",
    priority: 6,
    isActive: true,
    targetAudience: ["one-time-purchase"],
    userSegments: ["new-user", "returning-user", "special-package-buyer"],
    maxShowsPerUser: 2,
    cooldownHours: 24,
    triggersOnPackageIds: ["power-pack", "additional-power-pack"], // Power Pack (both non-member and member-only)
    triggersOnPackageTypes: ["one-time"],
    showAfterPurchase: true,
    showAfterDelay: 3,
  },
  // Mini Draw Upsells
  {
    id: "mini-pack-1-upgrade",
    name: "Mini Pack 1 Upgrade",
    description: "Get 10 Free Entries with 12 Hours Access to Partner Discounts!",
    category: "one-time-plus",
    originalPrice: 2.99,
    discountedPrice: 2.99,
    discountPercentage: 0,
    entriesCount: 10,
    shopDiscountPercent: 0,
    partnerDiscountDays: 0.5, // 12 hours = 12/24 day
    buttonText: "Upgrade Now - $2.99",
    conditions: [
      "$2.99 One Time Payment",
      "10 Free Entries",
      "12 Hours Access to Partner Discounts",
      "100% of Partner Discounts Available",
    ],
    urgencyText: "Limited time offer!",
    priority: 10,
    isActive: true,
    targetAudience: ["mini-draw-customers"],
    userSegments: ["mini-draw-buyer"],
    triggersOnPackageIds: ["mini-pack-1"],
    triggersOnPackageTypes: ["one-time"],
    showAfterPurchase: true,
    showAfterDelay: 2,
    maxShowsPerUser: 1,
    cooldownHours: 0,
  },
  {
    id: "mini-pack-2-upgrade",
    name: "Mini Pack 2 Upgrade",
    description: "Get 10 Free Entries with 6 Hours Access to Partner Discounts!",
    category: "one-time-plus",
    originalPrice: 2.5,
    discountedPrice: 2.5,
    discountPercentage: 0,
    entriesCount: 10,
    shopDiscountPercent: 0,
    partnerDiscountDays: 0.25, // 6 hours = 6/24 day
    buttonText: "Upgrade Now - $2.50",
    conditions: [
      "$2.50 One Time Payment",
      "10 Free Entries",
      "6 Hours Access to Partner Discounts",
      "100% of Partner Discounts Available",
    ],
    urgencyText: "Limited time offer!",
    priority: 10,
    isActive: true,
    targetAudience: ["mini-draw-customers"],
    userSegments: ["mini-draw-buyer"],
    triggersOnPackageIds: ["mini-pack-2"],
    triggersOnPackageTypes: ["one-time"],
    showAfterPurchase: true,
    showAfterDelay: 2,
    maxShowsPerUser: 1,
    cooldownHours: 0,
  },
  {
    id: "mini-pack-3-upgrade",
    name: "Mini Pack 3 Upgrade",
    description: "Get 20 Free Entries with 12 Hours Access to Partner Discounts!",
    category: "one-time-plus",
    originalPrice: 5.0,
    discountedPrice: 4.99,
    discountPercentage: 0,
    entriesCount: 20,
    shopDiscountPercent: 0,
    partnerDiscountDays: 0.5, // 12 hours = 12/24 day
    buttonText: "Upgrade Now - $4.99",
    conditions: [
      "$5 One Time Payment",
      "20 Free Entries",
      "12 Hours Access to Partner Discounts",
      "100% of Partner Discounts Available",
    ],
    urgencyText: "Limited time offer!",
    priority: 10,
    isActive: true,
    targetAudience: ["mini-draw-customers"],
    userSegments: ["mini-draw-buyer"],
    triggersOnPackageIds: ["mini-pack-3"],
    triggersOnPackageTypes: ["one-time"],
    showAfterPurchase: true,
    showAfterDelay: 2,
    maxShowsPerUser: 1,
    cooldownHours: 0,
  },
  {
    id: "mini-pack-4-upgrade",
    name: "Mini Pack 4 Upgrade",
    description: "Double your entries with this exclusive upgrade!",
    category: "one-time-plus",
    originalPrice: 50,
    discountedPrice: 9.99,
    discountPercentage: 80,
    entriesCount: 50,
    shopDiscountPercent: 5,
    partnerDiscountDays: 1,
    buttonText: "Upgrade Now - $9.99",
    conditions: ["Available only after Mini Pack 4 purchase", "One-time payment", "Instant activation"],
    urgencyText: "Limited time offer!",
    priority: 10,
    isActive: true,
    targetAudience: ["mini-draw-customers"],
    userSegments: ["mini-draw-buyer"],
    triggersOnPackageIds: ["mini-pack-4"],
    triggersOnPackageTypes: ["one-time"],
    showAfterPurchase: true,
    showAfterDelay: 2,
    maxShowsPerUser: 1,
    cooldownHours: 0,
  },
  {
    id: "mini-pack-5-upgrade",
    name: "Mini Pack 5 Upgrade",
    description: "Double your entries with this exclusive upgrade!",
    category: "one-time-plus",
    originalPrice: 100,
    discountedPrice: 19.99,
    discountPercentage: 80,
    entriesCount: 100,
    shopDiscountPercent: 5,
    partnerDiscountDays: 20,
    buttonText: "Upgrade Now - $19.99",
    conditions: ["Available only after Mini Pack 5 purchase", "One-time payment", "Instant activation"],
    urgencyText: "Limited time offer!",
    priority: 10,
    isActive: true,
    targetAudience: ["mini-draw-customers"],
    userSegments: ["mini-draw-buyer"],
    triggersOnPackageIds: ["mini-pack-5"],
    triggersOnPackageTypes: ["one-time"],
    showAfterPurchase: true,
    showAfterDelay: 2,
    maxShowsPerUser: 1,
    cooldownHours: 0,
  },
  {
    id: "mini-pack-6-upgrade",
    name: "Mini Pack 6 Upgrade",
    description: "Double your entries with this exclusive upgrade!",
    category: "one-time-plus",
    originalPrice: 200,
    discountedPrice: 49.99,
    discountPercentage: 75,
    entriesCount: 200,
    shopDiscountPercent: 10,
    partnerDiscountDays: 4,
    buttonText: "Upgrade Now - $49.99",
    conditions: ["Available only after Mini Pack 6 purchase", "One-time payment", "Instant activation"],
    urgencyText: "Limited time offer!",
    priority: 10,
    isActive: true,
    targetAudience: ["mini-draw-customers"],
    userSegments: ["mini-draw-buyer"],
    triggersOnPackageIds: ["mini-pack-6"],
    triggersOnPackageTypes: ["one-time"],
    showAfterPurchase: true,
    showAfterDelay: 2,
    maxShowsPerUser: 1,
    cooldownHours: 0,
  },
  {
    id: "mini-pack-7-upgrade",
    name: "Mini Pack 7 Upgrade",
    description: "Double your entries with this exclusive upgrade!",
    category: "one-time-plus",
    originalPrice: 500,
    discountedPrice: 124.99,
    discountPercentage: 75,
    entriesCount: 500,
    shopDiscountPercent: 10,
    partnerDiscountDays: 10,
    buttonText: "Upgrade Now - $124.99",
    conditions: ["Available only after Mini Pack 7 purchase", "One-time payment", "Instant activation"],
    urgencyText: "Limited time offer!",
    priority: 10,
    isActive: true,
    targetAudience: ["mini-draw-customers"],
    userSegments: ["mini-draw-buyer"],
    triggersOnPackageIds: ["mini-pack-7"],
    triggersOnPackageTypes: ["one-time"],
    showAfterPurchase: true,
    showAfterDelay: 2,
    maxShowsPerUser: 1,
    cooldownHours: 0,
  },
  {
    id: "mini-pack-8-upgrade",
    name: "Mini Pack 8 Upgrade",
    description: "Double your entries with this exclusive upgrade!",
    category: "one-time-plus",
    originalPrice: 1000,
    discountedPrice: 249.99,
    discountPercentage: 75,
    entriesCount: 1000,
    shopDiscountPercent: 20,
    partnerDiscountDays: 20,
    buttonText: "Upgrade Now - $249.99",
    conditions: ["Available only after Mini Pack 8 purchase", "One-time payment", "Instant activation"],
    urgencyText: "Limited time offer!",
    priority: 10,
    isActive: true,
    targetAudience: ["mini-draw-customers"],
    userSegments: ["mini-draw-buyer"],
    triggersOnPackageIds: ["mini-pack-8"],
    triggersOnPackageTypes: ["one-time"],
    showAfterPurchase: true,
    showAfterDelay: 2,
    maxShowsPerUser: 1,
    cooldownHours: 0,
  },
];

/**
 * Helper functions for upsell package management
 */

/**
 * Get all active upsell packages
 */
export const getActiveUpsellPackages = (): StaticUpsellPackage[] => {
  return upsellPackages.filter((pkg) => pkg.isActive);
};

/**
 * Get upsell packages by category
 * @param category - Package category
 */
export const getUpsellPackagesByCategory = (category: StaticUpsellPackage["category"]): StaticUpsellPackage[] => {
  return upsellPackages.filter((pkg) => pkg.category === category && pkg.isActive);
};

/**
 * Get upsell packages that trigger on specific package purchase
 * @param packageId - The package ID that was purchased
 * @param packageType - The package type that was purchased
 */
export const getUpsellPackagesForPurchase = (
  packageId: string,
  packageType: "subscription" | "one-time"
): StaticUpsellPackage[] => {
  return upsellPackages.filter((pkg) => {
    if (!pkg.isActive) return false;

    // Check if package type matches
    const typeMatches = pkg.triggersOnPackageTypes?.includes(packageType);

    // Check if package ID matches (if specified)
    const idMatches = !pkg.triggersOnPackageIds || pkg.triggersOnPackageIds.includes(packageId);

    // Return true if type matches and either no specific IDs are required or ID matches
    return typeMatches && idMatches;
  });
};

/**
 * Get upsell package by ID
 * @param id - Upsell package ID
 */
export const getUpsellPackageById = (id: string): StaticUpsellPackage | undefined => {
  return upsellPackages.find((pkg) => pkg.id === id);
};

/**
 * Get upsell packages by trigger event
 * @param triggerEvent - The event that triggers the upsell
 */
export const getUpsellPackagesByTrigger = (triggerEvent: string): StaticUpsellPackage[] => {
  return upsellPackages.filter((pkg) => pkg.isActive && pkg.targetAudience.includes(triggerEvent));
};

/**
 * Get upsell packages sorted by priority
 * @param packages - Array of upsell packages to sort
 */
export const sortUpsellPackagesByPriority = (packages: StaticUpsellPackage[]): StaticUpsellPackage[] => {
  return packages.sort((a, b) => b.priority - a.priority);
};

/**
 * Filter upsell packages by user segments
 * @param packages - Array of upsell packages
 * @param userSegment - User segment to filter by
 */
export const filterUpsellPackagesByUserSegment = (
  packages: StaticUpsellPackage[],
  userSegment: string
): StaticUpsellPackage[] => {
  return packages.filter((pkg) => pkg.userSegments.includes("all") || pkg.userSegments.includes(userSegment));
};

/**
 * Get the best upsell offer for a specific purchase
 * @param packageId - The package ID that was purchased
 * @param packageType - The package type that was purchased
 * @param userSegment - User segment
 */
export const getBestUpsellOffer = (
  packageId: string,
  packageType: "subscription" | "one-time",
  userSegment: string = "returning-user"
): StaticUpsellPackage | null => {
  const relevantPackages = getUpsellPackagesForPurchase(packageId, packageType);
  const filteredPackages = filterUpsellPackagesByUserSegment(relevantPackages, userSegment);
  const sortedPackages = sortUpsellPackagesByPriority(filteredPackages);

  return sortedPackages.length > 0 ? sortedPackages[0] : null;
};

/**
 * Get the best upsell offer for a specific purchase, considering user membership status
 * @param packageId - The package ID that was purchased
 * @param packageType - The package type that was purchased
 * @param userSegment - User segment
 * @param isMember - Whether the user is a member
 */
export const getBestUpsellOfferForUser = (
  packageId: string,
  packageType: "subscription" | "one-time",
  userSegment: string = "returning-user",
  isMember: boolean = false
): StaticUpsellPackage | null => {
  const relevantPackages = getUpsellPackagesForPurchase(packageId, packageType);

  // Filter by user segment first
  let filteredPackages = filterUpsellPackagesByUserSegment(relevantPackages, userSegment);

  // Then filter by membership status
  if (packageType === "one-time") {
    // For one-time packages, filter based on membership status
    filteredPackages = filteredPackages.filter((pkg) => {
      // Check if this is a member-only upsell (additional-upgrade category)
      const isMemberOnlyUpsell = pkg.category === "additional-upgrade";

      // Non-members should only see non-member upsells (one-time-plus category)
      // Members can see both member and non-member upsells
      if (!isMember && isMemberOnlyUpsell) {
        return false; // Non-members shouldn't see member-only upsells
      }

      return true;
    });
  }

  const sortedPackages = sortUpsellPackagesByPriority(filteredPackages);

  console.log(`🔍 Upsell filtering for ${packageId}:`, {
    isMember,
    packageType,
    relevantPackages: relevantPackages.length,
    filteredBySegment: filterUpsellPackagesByUserSegment(relevantPackages, userSegment).length,
    finalFiltered: filteredPackages.length,
    selectedOffer: sortedPackages[0]?.name || "none",
  });

  return sortedPackages.length > 0 ? sortedPackages[0] : null;
};
