/**
 * Mini Draw Packages Data
 * Static data for mini draw packages with their corresponding upsells
 * Optimized for fast loading without backend calls
 */

import type { PromoMultiplier } from "@/types/promo-multiplier";

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
 * Mini Draw Packages - Complete set of 8 packages ($1 to $500).
 * Partner catalog % (see getPartnerCatalogAccessPercentForPlanId): packs 1–3 → 25%, 4 → 30%, 5 → 50%, 6–7 → 60%, 8 → 80%.
 * Access durations below match partner discount window copy; upsells mirror their base tier duration (pack 1 upgrade stays 1 hour).
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
      price: 0.5,
      entries: 2,
      partnerDiscountHours: 1,
      partnerDiscountDays: 0.04, // 1 hour = 1/24 day
      description: "2 Free Entries with 1 Hour Access to Partner Discounts",
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
      price: 2.5,
      entries: 10,
      partnerDiscountHours: 6,
      partnerDiscountDays: 0.25,
      description: "10 Free Entries with 6 Hours Access to Partner Discounts",
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
      price: 5.0,
      entries: 20,
      partnerDiscountHours: 12,
      partnerDiscountDays: 0.5,
      description: "20 Free Entries with 12 Hours Access to Partner Discounts",
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
    partnerDiscountHours: 72,
    partnerDiscountDays: 3,
    description: "25 Free Entries with 3 Days Access to Partner Discounts",
    isActive: true,
    stripeProductId: "prod_mini_pack_4",
    stripePriceId: "price_mini_pack_4",
    upsell: {
      _id: "mini-pack-4-upgrade",
      name: "Mini Pack 4 Upgrade",
      price: 12.5,
      entries: 50,
      partnerDiscountHours: 72,
      partnerDiscountDays: 3,
      description: "50 Free Entries with 3 Days Access to Partner Discounts",
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
    partnerDiscountHours: 144,
    partnerDiscountDays: 6,
    description: "50 Free Entries with 6 Days Access to Partner Discounts",
    isActive: true,
    stripeProductId: "prod_mini_pack_5",
    stripePriceId: "price_mini_pack_5",
    upsell: {
      _id: "mini-pack-5-upgrade",
      name: "Mini Pack 5 Upgrade",
      price: 19.99,
      entries: 100,
      partnerDiscountHours: 144,
      partnerDiscountDays: 6,
      description: "100 Free Entries with 6 Days Access to Partner Discounts",
      isActive: true,
      stripeProductId: "prod_mini_pack_5_upgrade",
      stripePriceId: "price_mini_pack_5_upgrade",
    },
  },
  {
    _id: "mini-pack-6",
    name: "Mini Pack 6",
    price: 125,
    entries: 125,
    partnerDiscountHours: 360,
    partnerDiscountDays: 15,
    description: "125 Free Entries with 15 Days Access to Partner Discounts",
    isActive: true,
    stripeProductId: "prod_mini_pack_6",
    stripePriceId: "price_mini_pack_6",
    upsell: {
      _id: "mini-pack-6-upgrade",
      name: "Mini Pack 6 Upgrade",
      price: 49.99,
      entries: 200,
      partnerDiscountHours: 360,
      partnerDiscountDays: 15,
      description: "200 Free Entries with 15 Days Access to Partner Discounts",
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
    partnerDiscountHours: 720,
    partnerDiscountDays: 30,
    description: "250 Free Entries with 30 Days Access to Partner Discounts",
    isActive: true,
    stripeProductId: "prod_mini_pack_7",
    stripePriceId: "price_mini_pack_7",
    upsell: {
      _id: "mini-pack-7-upgrade",
      name: "Mini Pack 7 Upgrade",
      price: 124.99,
      entries: 500,
      partnerDiscountHours: 720,
      partnerDiscountDays: 30,
      description: "500 Free Entries with 30 Days Access to Partner Discounts",
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
    partnerDiscountHours: 960,
    partnerDiscountDays: 40,
    description: "500 Free Entries with 40 Days Access to Partner Discounts",
    isActive: true,
    stripeProductId: "prod_mini_pack_8",
    stripePriceId: "price_mini_pack_8",
    upsell: {
      _id: "mini-pack-8-upgrade",
      name: "Mini Pack 8 Upgrade",
      price: 249.99,
      entries: 1000,
      partnerDiscountHours: 960,
      partnerDiscountDays: 40,
      description: "1000 Free Entries with 40 Days Access to Partner Discounts",
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
export const applyPromoToMiniPackage = (pkg: MiniDrawPackage, multiplier: PromoMultiplier): MiniDrawPackage => {
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
  promoMultiplier: PromoMultiplier
): MiniDrawPackage[] => {
  return packages.map((pkg) => applyPromoToMiniPackage(pkg, promoMultiplier));
};
