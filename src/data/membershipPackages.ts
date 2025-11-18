/**
 * Static Membership Packages Data
 * Migrated from database to improve performance and reduce database load
 *
 * This file contains all membership packages (subscription and one-time)
 * with their complete configuration including Stripe integration details.
 */

/**
 * Helper function to get Stripe Product ID from environment variables
 * Maps package ID to corresponding environment variable
 * @param packageId - The package ID (e.g., "tradie-subscription")
 * @returns Stripe Product ID from environment variable or undefined
 */
function getStripeProductId(packageId: string): string | undefined {
  const envMap: Record<string, string | undefined> = {
    "tradie-subscription": process.env.STRIPE_PRODUCT_ID_TRADIE,
    "foreman-subscription": process.env.STRIPE_PRODUCT_ID_FOREMAN,
    "boss-subscription": process.env.STRIPE_PRODUCT_ID_BOSS,
  };
  return envMap[packageId];
}

/**
 * Helper function to get Stripe Price ID from environment variables
 * Maps package ID to corresponding environment variable
 * @param packageId - The package ID (e.g., "tradie-subscription")
 * @returns Stripe Price ID from environment variable or undefined
 */
function getStripePriceId(packageId: string): string | undefined {
  const envMap: Record<string, string | undefined> = {
    "tradie-subscription": process.env.STRIPE_PRICE_ID_TRADIE,
    "foreman-subscription": process.env.STRIPE_PRICE_ID_FOREMAN,
    "boss-subscription": process.env.STRIPE_PRICE_ID_BOSS,
  };
  return envMap[packageId];
}

export interface StaticMembershipPackage {
  _id: string;
  name: string;
  type: "subscription" | "one-time";
  price: number;
  description: string;
  features: string[];
  entriesPerMonth?: number; // For subscription packages
  totalEntries?: number; // For one-time packages
  shopDiscountPercent?: number; // Discount percentage for shop purchases
  partnerDiscountDays?: number; // Days of partner discount access
  isMemberOnly?: boolean; // Whether this package is for members only
  stripeProductId?: string; // Stripe product ID for integration
  stripePriceId?: string; // Stripe price ID for integration
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  // Promo-related fields (added dynamically)
  originalEntries?: number; // Original entries before promo
  promoMultiplier?: number; // Active promo multiplier
  isPromoActive?: boolean; // Whether promo is currently active
}

/**
 * All membership packages migrated from database
 * Based on the provided database data with enhanced structure
 */
export const membershipPackages: StaticMembershipPackage[] = [
  // === SUBSCRIPTION PACKAGES ===
  {
    _id: "tradie-subscription",
    name: "Tradie",
    type: "subscription",
    price: 20,
    description: "Perfect for tradies getting started with mini draws",
    features: [
      "15 Free Accumulated Entries",
      "5% Off Shop purchases",
      "100% Access to Partner Discounts",
      "Mini Draws",
    ],
    entriesPerMonth: 15,
    shopDiscountPercent: 5,
    partnerDiscountDays: 30,
    isMemberOnly: false,
    isActive: true,
    stripeProductId: getStripeProductId("tradie-subscription"),
    stripePriceId: getStripePriceId("tradie-subscription"),
    createdAt: "2025-09-23T00:13:59.515Z",
    updatedAt: "2025-10-12T00:00:00.000Z",
  },
  {
    _id: "foreman-subscription",
    name: "Foreman",
    type: "subscription",
    price: 40,
    description: "The most popular choice for serious tool enthusiasts",
    features: [
      "40 Free Accumulated Entries",
      "10% Off Shop purchases",
      "100% Access to Partner Discounts",
      "Mini Draws",
    ],
    entriesPerMonth: 40,
    shopDiscountPercent: 10,
    partnerDiscountDays: 30,
    isMemberOnly: false,
    isActive: true,
    stripeProductId: getStripeProductId("foreman-subscription"),
    stripePriceId: getStripePriceId("foreman-subscription"),
    createdAt: "2025-09-23T00:13:59.620Z",
    updatedAt: "2025-10-12T00:00:00.000Z",
  },
  {
    _id: "boss-subscription",
    name: "Boss",
    type: "subscription",
    price: 80,
    description: "Premium membership for the ultimate tool professionals",
    features: [
      "100 Free Accumulated Entries",
      "20% Off Shop purchases",
      "100% Access to Partner Discounts",
      "Mini Draws",
    ],
    entriesPerMonth: 100,
    shopDiscountPercent: 20,
    partnerDiscountDays: 30,
    isMemberOnly: false,
    isActive: true,
    stripeProductId: getStripeProductId("boss-subscription"),
    stripePriceId: getStripePriceId("boss-subscription"),
    createdAt: "2025-09-23T00:13:59.721Z",
    updatedAt: "2025-10-12T00:00:00.000Z",
  },

  // === ONE-TIME PACKAGES (NON-MEMBERS) ===
  {
    _id: "apprentice-pack",
    name: "Apprentice Pack",
    type: "one-time",
    price: 0.5, // TEST PRICE - Original: 25
    description: "Quick boost for your entry wallet",
    features: ["3 Free Entries", "1 Days Access to Partner Discounts", "100% of Partner Discounts Available"],
    totalEntries: 3,
    shopDiscountPercent: 0,
    partnerDiscountDays: 1,
    isMemberOnly: false,
    isActive: true,
    createdAt: "2025-09-23T00:13:59.823Z",
    updatedAt: "2025-09-23T00:13:59.823Z",
  },
  {
    _id: "tradie-pack",
    name: "Tradie Pack",
    type: "one-time",
    price: 0.5, // TEST PRICE - Original: 50
    description: "Great value entry boost",
    features: ["15 Free Entries", "2 Days Access to Partner Discounts", "100% of Partner Discounts Available"],
    totalEntries: 15,
    shopDiscountPercent: 0,
    partnerDiscountDays: 2,
    isMemberOnly: false,
    isActive: true,
    createdAt: "2025-09-23T00:13:59.925Z",
    updatedAt: "2025-09-23T00:13:59.925Z",
  },
  {
    _id: "foreman-pack",
    name: "Foreman Pack",
    type: "one-time",
    price: 0.5, // TEST PRICE - Original: 100
    description: "Maximum entries for serious players",
    features: ["30 Free Entries", "4 Days Access to Partner Discounts", "100% of Partner Discounts Available"],
    totalEntries: 30,
    shopDiscountPercent: 0,
    partnerDiscountDays: 4,
    isMemberOnly: false,
    isActive: true,
    createdAt: "2025-09-23T00:14:00.043Z",
    updatedAt: "2025-09-23T00:14:00.043Z",
  },
  {
    _id: "boss-pack",
    name: "Boss Pack",
    type: "one-time",
    price: 0.5, // TEST PRICE - Original: 250
    description: "The ultimate entry package",
    features: ["150 Free Entries", "10 Days Access to Partner Discounts", "100% of Partner Discounts Available"],
    totalEntries: 150,
    shopDiscountPercent: 0,
    partnerDiscountDays: 10,
    isMemberOnly: false,
    isActive: true,
    createdAt: "2025-09-23T00:14:00.145Z",
    updatedAt: "2025-09-23T00:14:00.145Z",
  },
  {
    _id: "power-pack",
    name: "Power Pack",
    type: "one-time",
    price: 0.5, // TEST PRICE - Original: 500
    description: "Elite package for the ultimate professionals",
    features: ["600 Free Entries", "20 Days Access to Partner Discounts", "100% of Partner Discounts Available"],
    totalEntries: 600,
    shopDiscountPercent: 0,
    partnerDiscountDays: 20,
    isMemberOnly: false,
    isActive: true,
    createdAt: "2025-09-23T00:14:00.247Z",
    updatedAt: "2025-09-23T00:14:00.247Z",
  },

  // === ONE-TIME PACKAGES (MEMBERS ONLY) ===
  {
    _id: "additional-apprentice-pack",
    name: "Additional Apprentice Pack",
    type: "one-time",
    price: 0.5, // TEST PRICE - Original: 25
    description: "Quick boost for your entry wallet - Member Exclusive",
    features: ["10 Free Entries", "1 Days Access to Partner Discounts", "100% of Partner Discounts Available"],
    totalEntries: 10,
    shopDiscountPercent: 0,
    partnerDiscountDays: 1,
    isMemberOnly: true,
    isActive: true,
    createdAt: "2025-09-23T00:12:43.671Z",
    updatedAt: "2025-09-23T00:14:00.355Z",
  },
  {
    _id: "additional-tradie-pack",
    name: "Additional Tradie Pack",
    type: "one-time",
    price: 0.5, // TEST PRICE - Original: 50
    description: "Great value entry boost - Member Exclusive",
    features: ["30 Free Entries", "2 Days Access to Partner Discounts", "100% of Partner Discounts Available"],
    totalEntries: 30,
    shopDiscountPercent: 0,
    partnerDiscountDays: 2,
    isMemberOnly: true,
    isActive: true,
    createdAt: "2025-09-23T00:12:43.746Z",
    updatedAt: "2025-09-23T00:14:00.460Z",
  },
  {
    _id: "additional-foreman-pack",
    name: "Additional Foreman Pack",
    type: "one-time",
    price: 0.5, // TEST PRICE - Original: 100
    description: "Maximum entries for serious players - Member Exclusive",
    features: ["100 Free Entries", "4 Days Access to Partner Discounts", "100% of Partner Discounts Available"],
    totalEntries: 100,
    shopDiscountPercent: 0,
    partnerDiscountDays: 4,
    isMemberOnly: true,
    isActive: true,
    createdAt: "2025-09-23T00:12:43.803Z",
    updatedAt: "2025-09-23T00:14:00.563Z",
  },
  {
    _id: "additional-boss-pack",
    name: "Additional Boss Pack",
    type: "one-time",
    price: 0.5, // TEST PRICE - Original: 250
    description: "The ultimate entry package - Member Exclusive",
    features: ["400 Free Entries", "10 Days Access to Partner Discounts", "100% of Partner Discounts Available"],
    totalEntries: 400,
    shopDiscountPercent: 0,
    partnerDiscountDays: 10,
    isMemberOnly: true,
    isActive: true,
    createdAt: "2025-09-23T00:12:43.860Z",
    updatedAt: "2025-09-23T00:14:00.664Z",
  },
  {
    _id: "additional-power-pack",
    name: "Additional Power Pack",
    type: "one-time",
    price: 0.5, // TEST PRICE - Original: 500
    description: "Elite package for the ultimate professionals - Member Exclusive",
    features: ["1200 Free Entries", "20 Days Access to Partner Discounts", "100% of Partner Discounts Available"],
    totalEntries: 1200,
    shopDiscountPercent: 0,
    partnerDiscountDays: 20,
    isMemberOnly: true,
    isActive: true,
    createdAt: "2025-09-23T00:12:43.918Z",
    updatedAt: "2025-09-23T00:14:00.765Z",
  },
];

/**
 * Helper functions for package management
 */

/**
 * Get all subscription packages
 */
export const getSubscriptionPackages = (): StaticMembershipPackage[] => {
  return membershipPackages.filter((pkg) => pkg.type === "subscription" && pkg.isActive);
};

/**
 * Get all one-time packages (both member and non-member)
 * Filtering by membership status should be done in the component
 */
export const getOneTimePackages = (): StaticMembershipPackage[] => {
  return membershipPackages.filter((pkg) => pkg.type === "one-time" && pkg.isActive);
};

/**
 * Get all packages (subscription + one-time)
 */
export const getAllPackages = (): StaticMembershipPackage[] => {
  return membershipPackages.filter((pkg) => pkg.isActive);
};

/**
 * Get package by ID
 * @param id - Package ID to find
 */
export const getPackageById = (id: string): StaticMembershipPackage | undefined => {
  return membershipPackages.find((pkg) => pkg._id === id);
};

/**
 * Get packages by type
 * @param type - Package type (subscription or one-time)
 */
export const getPackagesByType = (type: "subscription" | "one-time"): StaticMembershipPackage[] => {
  return membershipPackages.filter((pkg) => pkg.type === type && pkg.isActive);
};

/**
 * Get member-exclusive packages
 */
export const getMemberOnlyPackages = (): StaticMembershipPackage[] => {
  return membershipPackages.filter((pkg) => pkg.isMemberOnly && pkg.isActive);
};

/**
 * Get regular (non-member) packages
 */
export const getRegularPackages = (): StaticMembershipPackage[] => {
  return membershipPackages.filter((pkg) => !pkg.isMemberOnly && pkg.isActive);
};

/**
 * Search packages by name (case-insensitive)
 * @param name - Package name to search for
 */
export const searchPackagesByName = (name: string): StaticMembershipPackage[] => {
  const searchTerm = name.toLowerCase();
  return membershipPackages.filter((pkg) => pkg.name.toLowerCase().includes(searchTerm) && pkg.isActive);
};

/**
 * Get packages in price range
 * @param minPrice - Minimum price
 * @param maxPrice - Maximum price
 */
export const getPackagesByPriceRange = (minPrice: number, maxPrice: number): StaticMembershipPackage[] => {
  return membershipPackages.filter((pkg) => pkg.price >= minPrice && pkg.price <= maxPrice && pkg.isActive);
};

/**
 * Apply promo multiplier to a package
 * @param pkg - Package to apply promo to
 * @param multiplier - Promo multiplier (2, 3, 5, 10)
 * @returns Package with updated entries and promo information
 */
export const applyPromoToPackage = (
  pkg: StaticMembershipPackage,
  multiplier: 2 | 3 | 5 | 10
): StaticMembershipPackage => {
  const originalEntries = pkg.type === "subscription" ? pkg.entriesPerMonth : pkg.totalEntries;

  if (!originalEntries) {
    return pkg; // No entries to multiply
  }

  const newEntries = originalEntries * multiplier;

  return {
    ...pkg,
    originalEntries,
    promoMultiplier: multiplier,
    isPromoActive: true,
    // Update the appropriate entries field
    ...(pkg.type === "subscription" ? { entriesPerMonth: newEntries } : { totalEntries: newEntries }),
  };
};

/**
 * Remove promo from a package (restore original values)
 * @param pkg - Package to remove promo from
 * @returns Package with original entries restored
 */
export const removePromoFromPackage = (pkg: StaticMembershipPackage): StaticMembershipPackage => {
  if (!pkg.isPromoActive || !pkg.originalEntries) {
    return pkg; // No promo to remove
  }

  return {
    ...pkg,
    // Restore original entries
    ...(pkg.type === "subscription" ? { entriesPerMonth: pkg.originalEntries } : { totalEntries: pkg.originalEntries }),
    // Clear promo fields
    originalEntries: undefined,
    promoMultiplier: undefined,
    isPromoActive: false,
  };
};

/**
 * Get packages with active promo applied
 * @param packages - Array of packages
 * @param promoMultiplier - Active promo multiplier
 * @param promoType - Type of promo (affects one-time packages)
 * @returns Packages with promo applied where applicable
 */
export const getPackagesWithPromo = (
  packages: StaticMembershipPackage[],
  promoMultiplier: 2 | 3 | 5 | 10,
  promoType: "one-time-packages" | "mini-packages"
): StaticMembershipPackage[] => {
  return packages.map((pkg) => {
    // Only apply promo to one-time packages for "one-time-packages" promo type
    if (promoType === "one-time-packages" && pkg.type === "one-time") {
      return applyPromoToPackage(pkg, promoMultiplier);
    }
    return pkg;
  });
};
