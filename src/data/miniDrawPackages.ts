/**
 * Mini Draw Packages Data
 * Static data for mini draw packages with their corresponding upsells
 * Optimized for fast loading without backend calls
 */

export interface MiniDrawPackage {
  _id: string;
  name: string;
  price: number;
  entries: number;
  partnerDiscountHours: number;
  partnerDiscountDays: number;
  description: string;
  isActive: boolean;
  stripeProductId?: string;
  stripePriceId?: string;
  upsell?: MiniDrawUpsell;
  // Promo-related fields (added dynamically)
  originalEntries?: number; // Original entries before promo
  promoMultiplier?: number; // Active promo multiplier
  isPromoActive?: boolean; // Whether promo is currently active
}

export interface MiniDrawUpsell {
  _id: string;
  name: string;
  price: number;
  entries: number;
  partnerDiscountHours: number;
  partnerDiscountDays: number;
  description: string;
  isActive: boolean;
  stripeProductId?: string;
  stripePriceId?: string;
}

/**
 * Mini Draw Packages - Complete set of 8 packages from $5 to $500
 * These are one-time packages for members who participate in major draws
 */
export const miniDrawPackages: MiniDrawPackage[] = [
  {
    _id: "mini-pack-1",
    name: "Mini Pack 1",
    price: 1,
    entries: 1,
    partnerDiscountHours: 1,
    partnerDiscountDays: 0.04, // 1 hour = 1/24 day
    description: "1 Free Entry with 1 Hour Access to Partner Discounts",
    isActive: true,
    stripeProductId: "prod_mini_pack_1",
    stripePriceId: "price_mini_pack_1",
    upsell: {
      _id: "mini-pack-1-upgrade",
      name: "Mini Pack 1 Upgrade",
      price: 2.99,
      entries: 10,
      partnerDiscountHours: 12,
      partnerDiscountDays: 0.5,
      description: "10 Free Entries with 12 Hours Access to Partner Discounts",
      isActive: true,
      stripeProductId: "prod_mini_pack_1_upgrade",
      stripePriceId: "price_mini_pack_1_upgrade",
    },
  },
  {
    _id: "mini-pack-2",
    name: "Mini Pack 2",
    price: 5,
    entries: 5,
    partnerDiscountHours: 6,
    partnerDiscountDays: 0.25, // 6 hours = 6/24 day
    description: "5 Free Entries with 6 Hours Access to Partner Discounts",
    isActive: true,
    stripeProductId: "prod_mini_pack_2",
    stripePriceId: "price_mini_pack_2",
    upsell: {
      _id: "mini-pack-2-upgrade",
      name: "Mini Pack 2 Upgrade",
      price: 4.99,
      entries: 20,
      partnerDiscountHours: 24,
      partnerDiscountDays: 1,
      description: "20 Free Entries with 1 Day Access to Partner Discounts",
      isActive: true,
      stripeProductId: "prod_mini_pack_2_upgrade",
      stripePriceId: "price_mini_pack_2_upgrade",
    },
  },
  {
    _id: "mini-pack-3",
    name: "Mini Pack 3",
    price: 10,
    entries: 10,
    partnerDiscountHours: 12,
    partnerDiscountDays: 0.5, // 12 hours = 12/24 day
    description: "10 Free Entries with 12 Hours Access to Partner Discounts",
    isActive: true,
    stripeProductId: "prod_mini_pack_3",
    stripePriceId: "price_mini_pack_3",
    upsell: {
      _id: "mini-pack-3-upgrade",
      name: "Mini Pack 3 Upgrade",
      price: 7.99,
      entries: 30,
      partnerDiscountHours: 48,
      partnerDiscountDays: 2,
      description: "30 Free Entries with 2 Days Access to Partner Discounts",
      isActive: true,
      stripeProductId: "prod_mini_pack_3_upgrade",
      stripePriceId: "price_mini_pack_3_upgrade",
    },
  },
  {
    _id: "mini-pack-4",
    name: "Mini Pack 4",
    price: 25,
    entries: 25,
    partnerDiscountHours: 24,
    partnerDiscountDays: 1,
    description: "25 Free Entries with 1 Day Access to Partner Discounts",
    isActive: true,
    stripeProductId: "prod_mini_pack_4",
    stripePriceId: "price_mini_pack_4",
    upsell: {
      _id: "mini-pack-4-upgrade",
      name: "Mini Pack 4 Upgrade",
      price: 9.99,
      entries: 50,
      partnerDiscountHours: 24,
      partnerDiscountDays: 1,
      description: "50 Free Entries with 1 Day Access to Partner Discounts",
      isActive: true,
      stripeProductId: "prod_mini_pack_4_upgrade",
      stripePriceId: "price_mini_pack_4_upgrade",
    },
  },
  {
    _id: "mini-pack-5",
    name: "Mini Pack 5",
    price: 50,
    entries: 50,
    partnerDiscountHours: 480,
    partnerDiscountDays: 20,
    description: "50 Free Entries with 20 Days Access to Partner Discounts",
    isActive: true,
    stripeProductId: "prod_mini_pack_5",
    stripePriceId: "price_mini_pack_5",
    upsell: {
      _id: "mini-pack-5-upgrade",
      name: "Mini Pack 5 Upgrade",
      price: 19.99,
      entries: 100,
      partnerDiscountHours: 480,
      partnerDiscountDays: 20,
      description: "100 Free Entries with 20 Days Access to Partner Discounts",
      isActive: true,
      stripeProductId: "prod_mini_pack_5_upgrade",
      stripePriceId: "price_mini_pack_5_upgrade",
    },
  },
  {
    _id: "mini-pack-6",
    name: "Mini Pack 6",
    price: 100,
    entries: 100,
    partnerDiscountHours: 96,
    partnerDiscountDays: 4,
    description: "100 Free Entries with 4 Days Access to Partner Discounts",
    isActive: true,
    stripeProductId: "prod_mini_pack_6",
    stripePriceId: "price_mini_pack_6",
    upsell: {
      _id: "mini-pack-6-upgrade",
      name: "Mini Pack 6 Upgrade",
      price: 49.99,
      entries: 200,
      partnerDiscountHours: 96,
      partnerDiscountDays: 4,
      description: "200 Free Entries with 4 Days Access to Partner Discounts",
      isActive: true,
      stripeProductId: "prod_mini_pack_6_upgrade",
      stripePriceId: "price_mini_pack_6_upgrade",
    },
  },
  {
    _id: "mini-pack-7",
    name: "Mini Pack 7",
    price: 250,
    entries: 250,
    partnerDiscountHours: 240,
    partnerDiscountDays: 10,
    description: "250 Free Entries with 10 Days Access to Partner Discounts",
    isActive: true,
    stripeProductId: "prod_mini_pack_7",
    stripePriceId: "price_mini_pack_7",
    upsell: {
      _id: "mini-pack-7-upgrade",
      name: "Mini Pack 7 Upgrade",
      price: 124.99,
      entries: 500,
      partnerDiscountHours: 240,
      partnerDiscountDays: 10,
      description: "500 Free Entries with 10 Days Access to Partner Discounts",
      isActive: true,
      stripeProductId: "prod_mini_pack_7_upgrade",
      stripePriceId: "price_mini_pack_7_upgrade",
    },
  },
  {
    _id: "mini-pack-8",
    name: "Mini Pack 8",
    price: 500,
    entries: 500,
    partnerDiscountHours: 480,
    partnerDiscountDays: 20,
    description: "500 Free Entries with 20 Days Access to Partner Discounts",
    isActive: true,
    stripeProductId: "prod_mini_pack_8",
    stripePriceId: "price_mini_pack_8",
    upsell: {
      _id: "mini-pack-8-upgrade",
      name: "Mini Pack 8 Upgrade",
      price: 249.99,
      entries: 1000,
      partnerDiscountHours: 480,
      partnerDiscountDays: 20,
      description: "1000 Free Entries with 20 Days Access to Partner Discounts",
      isActive: true,
      stripeProductId: "prod_mini_pack_8_upgrade",
      stripePriceId: "price_mini_pack_8_upgrade",
    },
  },
];

/**
 * Helper function to get mini draw packages
 */
export const getMiniDrawPackages = (): MiniDrawPackage[] => {
  return miniDrawPackages.filter((pkg) => pkg.isActive);
};

/**
 * Helper function to get a specific mini draw package by ID
 */
export const getMiniDrawPackageById = (id: string): MiniDrawPackage | undefined => {
  return miniDrawPackages.find((pkg) => pkg._id === id);
};

/**
 * Helper function to get upsell for a mini draw package
 */
export const getMiniDrawUpsell = (packageId: string): MiniDrawUpsell | undefined => {
  const pkg = getMiniDrawPackageById(packageId);
  return pkg?.upsell;
};

/**
 * Apply promo multiplier to a mini draw package
 * @param pkg - Mini draw package to apply promo to
 * @param multiplier - Promo multiplier (2, 3, 5, 10)
 * @returns Package with updated entries and promo information
 */
export const applyPromoToMiniPackage = (pkg: MiniDrawPackage, multiplier: 2 | 3 | 5 | 10): MiniDrawPackage => {
  const originalEntries = pkg.entries;
  const newEntries = originalEntries * multiplier;

  return {
    ...pkg,
    originalEntries,
    promoMultiplier: multiplier,
    isPromoActive: true,
    entries: newEntries,
  };
};

/**
 * Remove promo from a mini draw package (restore original values)
 * @param pkg - Mini draw package to remove promo from
 * @returns Package with original entries restored
 */
export const removePromoFromMiniPackage = (pkg: MiniDrawPackage): MiniDrawPackage => {
  if (!pkg.isPromoActive || !pkg.originalEntries) {
    return pkg; // No promo to remove
  }

  return {
    ...pkg,
    entries: pkg.originalEntries,
    // Clear promo fields
    originalEntries: undefined,
    promoMultiplier: undefined,
    isPromoActive: false,
  };
};

/**
 * Get mini draw packages with active promo applied
 * @param packages - Array of mini draw packages
 * @param promoMultiplier - Active promo multiplier
 * @returns Packages with promo applied
 */
export const getMiniPackagesWithPromo = (
  packages: MiniDrawPackage[],
  promoMultiplier: 2 | 3 | 5 | 10
): MiniDrawPackage[] => {
  return packages.map((pkg) => applyPromoToMiniPackage(pkg, promoMultiplier));
};
