/**
 * Static Upsell Packages Data
 * Based on the provided upsell popup specifications
 *
 * This file contains all upsell offers that appear after membership purchases
 * with their complete configuration and targeting rules.
 *
 * ⚠️ IMPORTANT: entriesCount is now a FALLBACK value
 * - Upsell entries are dynamically calculated as: upsellCategoryMultiplier × packageBaseEntries
 * - The entriesCount field here is only used as a fallback when:
 *   1. OriginalPurchaseContext is not available
 *   2. Package lookup fails
 *   3. Promo multiplier cannot be determined
 * - For new purchases, entries are calculated dynamically based on the triggering package
 */

export type UpsellImageGroup =
  | "membership-pack"
  | "one-time-pack"
  | "additional-one-time-pack"
  | "mini-pack";

export interface UpsellImageDescriptor {
  group: UpsellImageGroup;
  /** Base file stem under group/, no extension and no multiplier prefix (e.g. tradie-package, apprentice-plus, mini-pack-3). */
  slug: string;
}

export interface StaticUpsellPackage {
  id: string;
  /** Distinct id used for analytics/tracking. By convention equals `id`. */
  trackingId: string;
  /** Maps this offer to files under public/images/upsells/{group}/{slug}.webp (and Nx-{slug}.webp promo variants). */
  image: UpsellImageDescriptor;
  name: string;
  description: string;
  /** Distinct category for analytics + per-category multiplier resolution. */
  upsellCategory: "membership" | "one-time" | "additional" | "mini";
  /** Internal id of the base pack whose inclusions this upsell mirrors. */
  baseTemplatePackageId: string;
  /** Stripe Product description (used at payment-intent creation). */
  stripeDescription: string;
  originalPrice: number;
  discountedPrice: number;
  discountPercentage: number;
  /**
   * @deprecated This is now a fallback value. Upsell entries are dynamically calculated
   * as 2 × (packageBaseEntries × activePromoMultiplier) when OriginalPurchaseContext is available.
   * This value is only used for backward compatibility or when calculation is not possible.
   */
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

// ---------------------------------------------------------------------------
// Tier tables + builder functions
// ---------------------------------------------------------------------------

type UpsellTier = {
  tierSuffix: "apprentice" | "tradie" | "foreman" | "boss" | "power" | "vip";
  basePackId: string;
  originalPrice: number;
  upsellPrice: number;
  entries2x: number;
  partnerPercent: number;
  partnerDays: number;
  imageSlug: string;
};

const ONE_TIME_TIERS: UpsellTier[] = [
  { tierSuffix: "apprentice", basePackId: "apprentice-pack", originalPrice: 25,   upsellPrice: 12.5,   entries2x: 6,    partnerPercent: 25,  partnerDays: 1,  imageSlug: "apprentice-plus" },
  { tierSuffix: "tradie",     basePackId: "tradie-pack",     originalPrice: 50,   upsellPrice: 24.99,  entries2x: 30,   partnerPercent: 40,  partnerDays: 2,  imageSlug: "tradie-plus" },
  { tierSuffix: "foreman",    basePackId: "foreman-pack",    originalPrice: 100,  upsellPrice: 49.99,  entries2x: 60,   partnerPercent: 55,  partnerDays: 4,  imageSlug: "foreman-plus" },
  { tierSuffix: "boss",       basePackId: "boss-pack",       originalPrice: 250,  upsellPrice: 124.99, entries2x: 300,  partnerPercent: 70,  partnerDays: 10, imageSlug: "boss-plus" },
  { tierSuffix: "power",      basePackId: "power-pack",      originalPrice: 500,  upsellPrice: 249.99, entries2x: 1200, partnerPercent: 85,  partnerDays: 20, imageSlug: "power-plus" },
  { tierSuffix: "vip",        basePackId: "vip-pack",        originalPrice: 1000, upsellPrice: 499.99, entries2x: 3000, partnerPercent: 100, partnerDays: 30, imageSlug: "vip-plus" },
];

const ADDITIONAL_TIERS: UpsellTier[] = [
  { tierSuffix: "tradie",  basePackId: "additional-tradie-pack",  originalPrice: 25,   upsellPrice: 12.5,   entries2x: 30,   partnerPercent: 40,  partnerDays: 2,  imageSlug: "tradie-upgrade" },
  { tierSuffix: "foreman", basePackId: "additional-foreman-pack", originalPrice: 50,   upsellPrice: 24.99,  entries2x: 60,   partnerPercent: 55,  partnerDays: 4,  imageSlug: "foreman-upgrade" },
  { tierSuffix: "boss",    basePackId: "additional-boss-pack",    originalPrice: 125,  upsellPrice: 62.5,   entries2x: 300,  partnerPercent: 70,  partnerDays: 10, imageSlug: "boss-upgrade" },
  { tierSuffix: "power",   basePackId: "additional-power-pack",   originalPrice: 250,  upsellPrice: 124.99, entries2x: 1200, partnerPercent: 85,  partnerDays: 20, imageSlug: "power-upgrade" },
  { tierSuffix: "vip",     basePackId: "additional-vip-pack",     originalPrice: 500,  upsellPrice: 249.99, entries2x: 3000, partnerPercent: 100, partnerDays: 30, imageSlug: "vip-upgrade" },
];

function titleCaseTier(t: UpsellTier["tierSuffix"]): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function buildOneTimeUpsellRecords(): StaticUpsellPackage[] {
  return ONE_TIME_TIERS.map((t) => {
    const display = `${titleCaseTier(t.tierSuffix)} Pack`;
    return {
      id: `onetime-upsell-${t.tierSuffix}`,
      trackingId: `onetime-upsell-${t.tierSuffix}`,
      upsellCategory: "one-time" as const,
      baseTemplatePackageId: t.basePackId,
      image: { group: "one-time-pack" as const, slug: t.imageSlug },
      name: display,
      description: `${display} at 50% off — same benefits, double entries.`,
      stripeDescription: `${display} — Upsell`,
      originalPrice: t.originalPrice,
      discountedPrice: t.upsellPrice,
      discountPercentage: 50,
      entriesCount: t.entries2x,
      shopDiscountPercent: 0,
      partnerDiscountDays: t.partnerDays,
      buttonText: `Add ${display} - $${t.upsellPrice}`,
      conditions: [
        `$${t.upsellPrice} One Time Payment`,
        `${t.partnerPercent}% Access to Partner Discounts`,
        `${t.partnerDays} Day${t.partnerDays === 1 ? "" : "s"} Access to Partner Discounts`,
        `${t.entries2x} free entries`,
      ],
      urgencyText: "Limited time offer!",
      priority: 8,
      isActive: true,
      targetAudience: ["one-time-purchase"],
      userSegments: ["new-user", "returning-user"],
      maxShowsPerUser: 3,
      cooldownHours: 12,
      triggersOnPackageIds: [t.basePackId],
      triggersOnPackageTypes: ["one-time"],
      showAfterPurchase: true,
      showAfterDelay: 2,
    };
  });
}

function buildAdditionalUpsellRecords(): StaticUpsellPackage[] {
  return ADDITIONAL_TIERS.map((t) => {
    const display = `${titleCaseTier(t.tierSuffix)} Pack`;
    return {
      id: `additional-upsell-${t.tierSuffix}`,
      trackingId: `additional-upsell-${t.tierSuffix}`,
      upsellCategory: "additional" as const,
      baseTemplatePackageId: t.basePackId,
      image: { group: "additional-one-time-pack" as const, slug: t.imageSlug },
      name: display,
      description: `${display} at 50% off — same benefits, double entries.`,
      stripeDescription: `Additional ${display} — Upsell`,
      originalPrice: t.originalPrice,
      discountedPrice: t.upsellPrice,
      discountPercentage: 50,
      entriesCount: t.entries2x,
      shopDiscountPercent: 0,
      partnerDiscountDays: t.partnerDays,
      buttonText: `Add ${display} - $${t.upsellPrice}`,
      conditions: [
        `$${t.upsellPrice} One Time Payment`,
        `${t.partnerPercent}% Access to Partner Discounts`,
        `${t.partnerDays} Day${t.partnerDays === 1 ? "" : "s"} Access to Partner Discounts`,
        `${t.entries2x} free entries`,
      ],
      urgencyText: "Member upgrade available!",
      priority: 6,
      isActive: true,
      targetAudience: ["one-time-purchase"],
      userSegments: ["new-user", "returning-user", "special-package-buyer"],
      maxShowsPerUser: 2,
      cooldownHours: 24,
      triggersOnPackageIds: [t.basePackId],
      triggersOnPackageTypes: ["one-time"],
      showAfterPurchase: true,
      showAfterDelay: 3,
    };
  });
}

type MiniTier = {
  triggerId: string;
  upsellId: string;
  imageSlug: string;
  displayName: string;
  stripeDescription: string;
  triggerPrice: number;
  upsellPrice: number;
  entries: number;
  partnerPercent: number;
  partnerHours: number;
  partnerDays: number;
};

const MINI_TIERS: MiniTier[] = [
  { triggerId: "mini-pack-1",                  upsellId: "mini-upsell-1",                  imageSlug: "mini-pack-1", displayName: "Mini Pack 1",  stripeDescription: "Mini Pack 1 — Upsell",            triggerPrice: 1,    upsellPrice: 0.5,  entries: 1,   partnerPercent: 25,  partnerHours: 1,   partnerDays: 1/24 },
  { triggerId: "mini-pack-2",                  upsellId: "mini-upsell-2",                  imageSlug: "mini-pack-2", displayName: "Mini Pack 2",  stripeDescription: "Mini Pack 2 — Upsell",            triggerPrice: 5,    upsellPrice: 2.5,  entries: 5,   partnerPercent: 25,  partnerHours: 6,   partnerDays: 0.25 },
  { triggerId: "mini-pack-3",                  upsellId: "mini-upsell-3",                  imageSlug: "mini-pack-3", displayName: "Mini Pack 3",  stripeDescription: "Mini Pack 3 — Upsell",            triggerPrice: 10,   upsellPrice: 5,    entries: 10,  partnerPercent: 25,  partnerHours: 12,  partnerDays: 0.5 },
  { triggerId: "additional-tradie-pack-mini",  upsellId: "mini-upsell-additional-tradie",  imageSlug: "mini-pack-4", displayName: "Tradie Pack",  stripeDescription: "Tradie Pack — Mini Draw Upsell",  triggerPrice: 25,   upsellPrice: 12.5, entries: 25,  partnerPercent: 40,  partnerHours: 48,  partnerDays: 2 },
  { triggerId: "additional-foreman-pack-mini", upsellId: "mini-upsell-additional-foreman", imageSlug: "mini-pack-5", displayName: "Foreman Pack", stripeDescription: "Foreman Pack — Mini Draw Upsell", triggerPrice: 50,   upsellPrice: 25,   entries: 50,  partnerPercent: 55,  partnerHours: 96,  partnerDays: 4 },
  { triggerId: "additional-boss-pack-mini",    upsellId: "mini-upsell-additional-boss",    imageSlug: "mini-pack-6", displayName: "Boss Pack",    stripeDescription: "Boss Pack — Mini Draw Upsell",    triggerPrice: 125,  upsellPrice: 62.5, entries: 125, partnerPercent: 70,  partnerHours: 240, partnerDays: 10 },
  { triggerId: "additional-power-pack-mini",   upsellId: "mini-upsell-additional-power",   imageSlug: "mini-pack-7", displayName: "Power Pack",   stripeDescription: "Power Pack — Mini Draw Upsell",   triggerPrice: 250,  upsellPrice: 125,  entries: 250, partnerPercent: 85,  partnerHours: 480, partnerDays: 20 },
  { triggerId: "additional-vip-pack-mini",     upsellId: "mini-upsell-additional-vip",     imageSlug: "mini-pack-8", displayName: "VIP Pack",     stripeDescription: "VIP Pack — Mini Draw Upsell",     triggerPrice: 500,  upsellPrice: 250,  entries: 500, partnerPercent: 100, partnerHours: 720, partnerDays: 30 },
];

function buildMiniUpsellRecords(): StaticUpsellPackage[] {
  return MINI_TIERS.map((t) => ({
    id: t.upsellId,
    trackingId: t.upsellId,
    upsellCategory: "mini" as const,
    baseTemplatePackageId: t.triggerId,
    image: { group: "mini-pack" as const, slug: t.imageSlug },
    name: t.displayName,
    description: `${t.displayName} at 50% off — same entries, same partner benefits.`,
    stripeDescription: t.stripeDescription,
    originalPrice: t.triggerPrice,
    discountedPrice: t.upsellPrice,
    discountPercentage: 50,
    entriesCount: t.entries,
    shopDiscountPercent: 0,
    partnerDiscountDays: t.partnerDays,
    buttonText: `Upgrade Now - $${t.upsellPrice}`,
    conditions: [
      `$${t.upsellPrice} One Time Payment`,
      `${t.partnerPercent}% Access to Partner Discounts`,
      t.partnerHours < 24
        ? `${t.partnerHours} Hour${t.partnerHours === 1 ? "" : "s"} Access to Partner Discounts`
        : `${t.partnerDays} Day${t.partnerDays === 1 ? "" : "s"} Access to Partner Discounts`,
      `${t.entries} free entries`,
    ],
    urgencyText: "Limited time offer!",
    priority: 10,
    isActive: true,
    targetAudience: ["mini-draw-customers"],
    userSegments: ["mini-draw-buyer"],
    triggersOnPackageIds: [t.triggerId],
    triggersOnPackageTypes: ["one-time"],
    showAfterPurchase: true,
    showAfterDelay: 2,
    maxShowsPerUser: 1,
    cooldownHours: 0,
  }));
}

// ---------------------------------------------------------------------------
// Main array — 22 records: 3 membership + 6 one-time + 5 additional + 8 mini
// ---------------------------------------------------------------------------

/**
 * All upsell packages based on the provided specifications
 */
export const upsellPackages: StaticUpsellPackage[] = [
  // === MEMBERSHIP UPSELLS ===
  {
    id: "membership-upsell-tradie",
    trackingId: "membership-upsell-tradie",
    upsellCategory: "membership",
    baseTemplatePackageId: "apprentice-pack",
    image: { group: "membership-pack", slug: "tradie-package" },
    name: "Apprentice Pack",
    description: "Membership bonus — Apprentice Pack at half price.",
    stripeDescription: "Apprentice Pack — Membership Bonus",
    originalPrice: 20,
    discountedPrice: 9.99,
    discountPercentage: 50,
    entriesCount: 30, // 10× of apprentice base (3); admin multiplier may change at calculation time
    shopDiscountPercent: 5,
    partnerDiscountDays: 1,
    accessAfterExpiry: 1,
    buttonText: "Add Apprentice Pack - $9.99",
    conditions: [
      "25% Access to Partner Discounts",
      "1 Day Access to Partner Discounts",
      "30 free entries",
    ],
    urgencyText: "Limited time offer!",
    priority: 10,
    isActive: true,
    targetAudience: ["membership-purchase"],
    userSegments: ["new-user", "returning-user"],
    maxShowsPerUser: 2,
    cooldownHours: 24,
    triggersOnPackageIds: ["tradie-subscription"],
    triggersOnPackageTypes: ["membership"],
    showAfterPurchase: true,
    showAfterDelay: 2,
  },
  {
    id: "membership-upsell-foreman",
    trackingId: "membership-upsell-foreman",
    upsellCategory: "membership",
    baseTemplatePackageId: "tradie-pack",
    image: { group: "membership-pack", slug: "foreman-package" },
    name: "Tradie Pack",
    description: "Membership bonus — Tradie Pack at half price.",
    stripeDescription: "Tradie Pack — Membership Bonus",
    originalPrice: 40,
    discountedPrice: 19.99,
    discountPercentage: 50,
    entriesCount: 150,
    shopDiscountPercent: 10,
    partnerDiscountDays: 2,
    accessAfterExpiry: 2,
    buttonText: "Add Tradie Pack - $19.99",
    conditions: [
      "40% Access to Partner Discounts",
      "2 Days Access to Partner Discounts",
      "150 free entries",
    ],
    urgencyText: "Exclusive Foreman offer!",
    priority: 10,
    isActive: true,
    targetAudience: ["membership-purchase"],
    userSegments: ["new-user", "returning-user"],
    maxShowsPerUser: 2,
    cooldownHours: 24,
    triggersOnPackageIds: ["foreman-subscription"],
    triggersOnPackageTypes: ["membership"],
    showAfterPurchase: true,
    showAfterDelay: 2,
  },
  {
    id: "membership-upsell-boss",
    trackingId: "membership-upsell-boss",
    upsellCategory: "membership",
    baseTemplatePackageId: "foreman-pack",
    image: { group: "membership-pack", slug: "boss-package" },
    name: "Foreman Pack",
    description: "Membership bonus — Foreman Pack at half price.",
    stripeDescription: "Foreman Pack — Membership Bonus",
    originalPrice: 80,
    discountedPrice: 39.99,
    discountPercentage: 50,
    entriesCount: 300,
    shopDiscountPercent: 20,
    partnerDiscountDays: 4,
    accessAfterExpiry: 3,
    buttonText: "Add Foreman Pack - $39.99",
    conditions: [
      "55% Access to Partner Discounts",
      "4 Days Access to Partner Discounts",
      "300 free entries",
    ],
    urgencyText: "Boss Exclusive!",
    priority: 10,
    isActive: true,
    targetAudience: ["membership-purchase"],
    userSegments: ["new-user", "returning-user"],
    maxShowsPerUser: 2,
    cooldownHours: 24,
    triggersOnPackageIds: ["boss-subscription"],
    triggersOnPackageTypes: ["membership"],
    showAfterPurchase: true,
    showAfterDelay: 2,
  },

  // === ONE-TIME UPSELLS ===
  ...buildOneTimeUpsellRecords(),

  // === ADDITIONAL UPSELLS ===
  ...buildAdditionalUpsellRecords(),

  // === MINI UPSELLS ===
  ...buildMiniUpsellRecords(),
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
 * @param upsellCategory - Package upsell category
 */
export const getUpsellPackagesByCategory = (upsellCategory: StaticUpsellPackage["upsellCategory"]): StaticUpsellPackage[] => {
  return upsellPackages.filter((pkg) => pkg.upsellCategory === upsellCategory && pkg.isActive);
};

/**
 * Get upsell packages that trigger on specific package purchase
 * @param packageId - The package ID that was purchased
 * @param packageType - The package type that was purchased
 */
export const getUpsellPackagesForPurchase = (
  packageId: string,
  packageType: "membership" | "one-time"
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
  packageType: "membership" | "one-time",
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
 * @param isMember - Whether the user is a member (has active subscription)
 * @param hasAccessToAdditionalPackages - Whether the user has access to additional packages (subscription OR major draw entries)
 */
export const getBestUpsellOfferForUser = (
  packageId: string,
  packageType: "membership" | "one-time",
  userSegment: string = "returning-user",
  isMember: boolean = false,
  hasAccessToAdditionalPackages: boolean = false // ✅ NEW parameter
): StaticUpsellPackage | null => {
  const relevantPackages = getUpsellPackagesForPurchase(packageId, packageType);

  // Filter by user segment first
  let filteredPackages = filterUpsellPackagesByUserSegment(relevantPackages, userSegment);

  // Then filter by membership status
  if (packageType === "one-time") {
    // For one-time packages, filter based on membership status
    filteredPackages = filteredPackages.filter((pkg) => {
      // Check if this is a member-only upsell (additional upsellCategory)
      const isMemberOnlyUpsell = pkg.upsellCategory === "additional";

      // ✅ FIX: Use hasAccessToAdditionalPackages instead of just isMember
      // Users with access (subscription OR major draw entries) should see additional upsells
      // Non-members without access should only see non-member upsells (one-time upsellCategory)
      if (!hasAccessToAdditionalPackages && isMemberOnlyUpsell) {
        return false; // Users without access shouldn't see member-only upsells
      }

      return true;
    });
  }

  const sortedPackages = sortUpsellPackagesByPriority(filteredPackages);

  console.log(`🔍 Upsell filtering for ${packageId}:`, {
    isMember,
    hasAccessToAdditionalPackages, // ✅ NEW: Log access status
    packageType,
    relevantPackages: relevantPackages.length,
    filteredBySegment: filterUpsellPackagesByUserSegment(relevantPackages, userSegment).length,
    finalFiltered: filteredPackages.length,
    selectedOffer: sortedPackages[0]?.name || "none",
  });

  return sortedPackages.length > 0 ? sortedPackages[0] : null;
};
