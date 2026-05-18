/**
 * Mini Draw Packages Data
 * Static data for mini draw packages with their corresponding upsells
 * Optimized for fast loading without backend calls
 */

import type { PromoMultiplier } from "@/types/promo-multiplier";

export interface MiniDrawPackage {
  _id: string;
  name: string;
  /** Optional user-facing label override. If absent, `name` is shown. */
  displayName?: string;
  /** When true, this pack appears only for users with active subscription OR major draw entries. */
  isMemberOnly?: boolean;
  price: number;
  entries: number;
  partnerDiscountHours: number;
  partnerDiscountDays: number;
  description: string;
  isActive: boolean;
  stripeProductId?: string;
  stripePriceId?: string;
  upsell?: MiniDrawUpsell;
  originalEntries?: number;
  promoMultiplier?: number;
  isPromoActive?: boolean;
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
      entries: 1,
      partnerDiscountHours: 1,
      partnerDiscountDays: 0.04, // 1 hour = 1/24 day
      description: "1 Free Entry with 1 Hour Access to Partner Discounts",
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
      entries: 5,
      partnerDiscountHours: 6,
      partnerDiscountDays: 0.25,
      description: "5 Free Entries with 6 Hours Access to Partner Discounts",
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
      entries: 10,
      partnerDiscountHours: 12,
      partnerDiscountDays: 0.5,
      description: "10 Free Entries with 12 Hours Access to Partner Discounts",
      isActive: true,
      stripeProductId: "prod_mini_pack_3_upgrade",
      stripePriceId: "price_mini_pack_3_upgrade",
    },
  },
  // Mini Pack 4–8 deactivated 2026-05-14 — replaced by additional-*-pack-mini records below.
  // Records retained so historical orders, Stripe webhooks, and admin views can still
  // resolve the package by id. See docs/superpowers/specs/2026-05-14-upsell-remap-and-multiplier-design.md.
  {
    _id: "mini-pack-4",
    name: "Mini Pack 4",
    price: 25,
    entries: 25,
    partnerDiscountHours: 72,
    partnerDiscountDays: 3,
    description: "25 Free Entries with 3 Days Access to Partner Discounts",
    isActive: false,
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
    isActive: false,
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
    isActive: false,
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
    isActive: false,
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
    isActive: false,
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

  // === MINI-SCOPED ADDITIONAL PACKS (added 2026-05-14) ===
  {
    _id: "additional-tradie-pack-mini",
    name: "Additional Tradie Pack (Mini Draw)",
    displayName: "Tradie Pack",
    isMemberOnly: true,
    price: 25,
    entries: 25,
    partnerDiscountHours: 48,
    partnerDiscountDays: 2,
    description: "Tradie Pack scoped to this mini draw: 25 free entries with 2 days of 40% partner discount access.",
    isActive: true,
    upsell: {
      _id: "mini-upsell-additional-tradie",
      name: "Tradie Pack — Mini Draw Upsell",
      price: 12.5,
      entries: 25,
      partnerDiscountHours: 48,
      partnerDiscountDays: 2,
      description: "Same Tradie Pack benefits at 50% off.",
      isActive: true,
    },
  },
  {
    _id: "additional-foreman-pack-mini",
    name: "Additional Foreman Pack (Mini Draw)",
    displayName: "Foreman Pack",
    isMemberOnly: true,
    price: 50,
    entries: 50,
    partnerDiscountHours: 96,
    partnerDiscountDays: 4,
    description: "Foreman Pack scoped to this mini draw: 50 free entries with 4 days of 55% partner discount access.",
    isActive: true,
    upsell: {
      _id: "mini-upsell-additional-foreman",
      name: "Foreman Pack — Mini Draw Upsell",
      price: 25,
      entries: 50,
      partnerDiscountHours: 96,
      partnerDiscountDays: 4,
      description: "Same Foreman Pack benefits at 50% off.",
      isActive: true,
    },
  },
  {
    _id: "additional-boss-pack-mini",
    name: "Additional Boss Pack (Mini Draw)",
    displayName: "Boss Pack",
    isMemberOnly: true,
    price: 125,
    entries: 125,
    partnerDiscountHours: 240,
    partnerDiscountDays: 10,
    description: "Boss Pack scoped to this mini draw: 125 free entries with 10 days of 70% partner discount access.",
    isActive: true,
    upsell: {
      _id: "mini-upsell-additional-boss",
      name: "Boss Pack — Mini Draw Upsell",
      price: 62.5,
      entries: 125,
      partnerDiscountHours: 240,
      partnerDiscountDays: 10,
      description: "Same Boss Pack benefits at 50% off.",
      isActive: true,
    },
  },
  {
    _id: "additional-power-pack-mini",
    name: "Additional Power Pack (Mini Draw)",
    displayName: "Power Pack",
    isMemberOnly: true,
    price: 250,
    entries: 250,
    partnerDiscountHours: 480,
    partnerDiscountDays: 20,
    description: "Power Pack scoped to this mini draw: 250 free entries with 20 days of 85% partner discount access.",
    isActive: true,
    upsell: {
      _id: "mini-upsell-additional-power",
      name: "Power Pack — Mini Draw Upsell",
      price: 125,
      entries: 250,
      partnerDiscountHours: 480,
      partnerDiscountDays: 20,
      description: "Same Power Pack benefits at 50% off.",
      isActive: true,
    },
  },
  {
    _id: "additional-vip-pack-mini",
    name: "Additional VIP Pack (Mini Draw)",
    displayName: "VIP Pack",
    isMemberOnly: true,
    price: 500,
    entries: 500,
    partnerDiscountHours: 720,
    partnerDiscountDays: 30,
    description: "VIP Pack scoped to this mini draw: 500 free entries with 30 days of 100% partner discount access.",
    isActive: true,
    upsell: {
      _id: "mini-upsell-additional-vip",
      name: "VIP Pack — Mini Draw Upsell",
      price: 250,
      entries: 500,
      partnerDiscountHours: 720,
      partnerDiscountDays: 30,
      description: "Same VIP Pack benefits at 50% off.",
      isActive: true,
    },
  },
];

/**
 * Returns mini-draw packages appropriate for the viewer.
 * - hasAccess=false → only non-member-only packs (Mini Pack 1–3)
 * - hasAccess=true  → only member-only packs (additional-*-pack-mini),
 *   mirroring the major-draw swap rule.
 */
export const getMiniDrawPackagesForViewer = (hasAccess: boolean): MiniDrawPackage[] => {
  return miniDrawPackages.filter((pkg) => {
    if (!pkg.isActive) return false;
    const isMemberOnly = pkg.isMemberOnly === true;
    return hasAccess ? isMemberOnly : !isMemberOnly;
  });
};

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
