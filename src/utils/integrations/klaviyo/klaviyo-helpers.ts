/**
 * Klaviyo Helper Utilities
 *
 * Reusable utility functions for Klaviyo integration.
 * DRY principle - avoid code duplication.
 *
 * @module utils/klaviyoHelpers
 */

import type { IUser } from "@/models/User";
import type { KlaviyoProfile } from "@/types/klaviyo";
import { getStateByCode } from "@/data/australianStates";
import {
  getPartnerCatalogAccessPercentForPlanId,
  getPartnerDiscountCatalogSummaryForPackageId,
} from "@/utils/partner-discounts/partner-catalog-visibility";
import { extractBrandFromSlug } from "./brand-extraction";
import { calculateDrawSpecificPropertiesForUser, calculateDrawSpecificProperties, type DrawSpecificProperties } from "./klaviyo-draw-calculator";
import { getRenewalEntriesPreviewForProfile } from "./klaviyo-renewal-entries-preview";
import type { IMajorDraw } from "@/models/MajorDraw";
import MajorDraw from "@/models/MajorDraw";
import TicketEntry from "@/models/TicketEntry";
import mongoose from "mongoose";
import { differenceInMonths } from "date-fns";
import {
  type UserGrantLedger,
  emptyGrantLedger,
  aggregateNetGrantsByUser,
} from "@/utils/payment/payment-event-net-queries";
import { isValidPendingUpgrade } from "@/utils/subscription/pending-upgrade";

/**
 * Entry counts by paid source, read from the payment ledger.
 *
 * This used to RECONSTRUCT membership entries as
 * `catalogue.entriesPerMonth x floor(elapsed / 30 days)`. Measured against production on
 * 2026-08-26 that was wrong for 4,904 of 4,904 active members (understated x5–x14), because
 * the catalogue cannot see promo multipliers, upgrades that reset `startDate`, or
 * resubscribes. The ledger records what was actually granted, so we read it.
 *
 * Covers PAID sources only. Free grants (referral, promo-link, cancellation-upsell, streak,
 * bonus-entry-promo) are not here by construction — the all-sources lifetime total is
 * `user.accumulatedEntries`, projected separately as `accumulated_entries`.
 */
export function calculateEntryBreakdown(
  user: IUser,
  ledger: UserGrantLedger
): {
  memberEntries: number;
  oneTimeEntries: number;
  upsellEntries: number;
  miniDrawEntries: number;
} {
  // `user` is retained for call-site symmetry with the other calculate* helpers and for any
  // future per-user adjustment; every number here comes from the ledger.
  void user;

  return {
    memberEntries: ledger.memberEntries,
    oneTimeEntries: ledger.oneTimeEntries,
    upsellEntries: ledger.upsellEntries,
    miniDrawEntries: ledger.miniDrawEntries,
  };
}

/**
 * Determine if user has made any purchase
 * Checks for subscriptions, one-time packages, mini-draw packages, or upsells
 *
 * @param user - User model instance
 * @returns true if user has made any purchase (subscription, one-time, mini-draw, or upsell)
 */
export function hasUserMadePurchase(user: IUser): boolean {
  const hasSubscription = user.subscription?.isActive || false;
  const hasOneTimePackages = (user.oneTimePackages?.length || 0) > 0;
  const hasMiniDrawPackages = (user.miniDrawPackages?.length || 0) > 0;
  const hasUpsells = (user.upsellPurchases?.length || 0) > 0;

  return hasSubscription || hasOneTimePackages || hasMiniDrawPackages || hasUpsells;
}

/**
 * Convert User model to Klaviyo profile
 * Transforms MongoDB user data to Klaviyo format
 * Includes only strategic fields for segmentation and email automation
 *
 * @param user - User model instance
 * @param brandInterestFromSignup - Optional brand interest from signup (e.g., "milwaukee", "dewalt", "makita")
 *                                   Only used if user hasn't made any purchases yet
 * @param targetDraw - Optional cached target draw (for performance optimization in bulk operations)
 * @param cutoffDate - Optional cached cutoff date (for performance optimization in bulk operations)
 * @param ledger - Optional prefetched paid-grant ledger. Batch callers (the reconciliation
 *                 sweep) resolve ONE ledger per batch — same caching convention as
 *                 `targetDraw` / `cutoffDate`. Single-user callers omit it and this function
 *                 fetches its own with one indexed query.
 */
export async function userToKlaviyoProfile(
  user: IUser,
  brandInterestFromSignup?: string | null,
  targetDraw?: IMajorDraw,
  cutoffDate?: Date,
  ledger?: UserGrantLedger
): Promise<KlaviyoProfile> {
  // ✅ DEBUG: Log user data structure to identify sync issues
  // console.log(`🔍 userToKlaviyoProfile called for ${user.email}:`, {
  //   hasSubscription: !!user.subscription,
  //   subscriptionIsActive: user.subscription?.isActive,
  //   subscriptionPackageId: user.subscription?.packageId,
  //   upsellPurchasesLength: user.upsellPurchases?.length || 0,
  //   upsellPurchases: user.upsellPurchases ? JSON.stringify(user.upsellPurchases) : "undefined",
  //   oneTimePackagesLength: user.oneTimePackages?.length || 0,
  //   miniDrawPackagesLength: user.miniDrawPackages?.length || 0,
  //   accumulatedEntries: user.accumulatedEntries,
  //   rewardsPoints: user.rewardsPoints,
  // });

  // Format phone number - ensure it starts with +61 for Australian numbers
  const phone = user.mobile
    ? user.mobile.startsWith("+")
      ? user.mobile
      : `+61${user.mobile.replace(/^0/, "")}`
    : undefined;

  // Helper function to safely convert date to ISO string
  const safeDateToISO = (date: Date | undefined | null): string | undefined => {
    if (!date) return undefined;
    try {
      return date instanceof Date ? date.toISOString() : new Date(date).toISOString();
    } catch (error) {
      console.error(`Error converting date to ISO string for user ${user._id}:`, error);
      return undefined;
    }
  };

  // Resolve the paid-grant ledger. Batch callers pass one in; single-user callers get their
  // own via one indexed query on `userId_1_timestamp_-1`.
  let resolvedLedger = ledger;
  if (!resolvedLedger) {
    try {
      const byUser = await aggregateNetGrantsByUser([user._id]);
      resolvedLedger = byUser.get(user._id.toString()) ?? emptyGrantLedger();
    } catch (ledgerError) {
      // Non-fatal, deliberately: a profile sync must not fail because one aggregation did.
      // An empty ledger publishes zeros, which the next reconciliation sweep corrects.
      console.error(`Error loading grant ledger for user ${user._id}:`, ledgerError);
      resolvedLedger = emptyGrantLedger();
    }
  }

  // Calculate strategic metrics using helper functions
  const lifetimeValue = calculateLifetimeValue(user, resolvedLedger);
  const partnerDiscountStatus = calculatePartnerDiscountStatus(user);
  const entryBreakdown = calculateEntryBreakdown(user, resolvedLedger);

  // Canonical profile properties (added 2026-05-28 — see "Canonical property names"
  // in docs/tracking/KLAVIYO_INTEGRATION.md). These coexist with legacy properties
  // like subscription_status which continue to be written below for back-compat.
  const entriesPurchased =
    entryBreakdown.memberEntries +
    entryBreakdown.oneTimeEntries +
    entryBreakdown.upsellEntries +
    entryBreakdown.miniDrawEntries;

  let giveawaysEntered = 0;
  try {
    giveawaysEntered = await countDistinctDrawsEntered(user._id);
  } catch (err) {
    // Non-fatal — Klaviyo profile sync should not break if this query fails.
    // Default to 0 and log for observability.
    console.error(`Error counting distinct draws entered for user ${user._id}:`, err);
  }

  // Calculate draw-specific properties (non-blocking - use defaults if fails)
  let drawSpecificProperties: Partial<DrawSpecificProperties> & {
    current_draw_subscription_active: boolean;
    current_draw_one_time_packages: number;
    current_draw_entries: number;
  } = {
    current_draw_subscription_active: false,
    current_draw_one_time_packages: 0,
    current_draw_entries: 0,
  };

  try {
    // Use cached draw data if provided (performance optimization for bulk operations)
    // Otherwise fetch it (for single user operations)
    let drawProps: DrawSpecificProperties | null = null;
    
    if (targetDraw && cutoffDate) {
      // Use cached draw data - no database query needed
      drawProps = await calculateDrawSpecificProperties(user, targetDraw, cutoffDate);
    } else {
      // Fetch draw data (for single user operations)
      drawProps = await calculateDrawSpecificPropertiesForUser(user);
    }
    
    if (drawProps) {
      drawSpecificProperties = drawProps;
    } else {
      // If drawProps is null, log a warning for debugging
      // This happens when no active draw is found
      if (process.env.NODE_ENV === "development") {
        console.warn(`⚠️ No draw-specific properties calculated for ${user.email} - no active draw found`);
      }
    }
  } catch (error) {
    // Log error but don't fail profile sync - use safe defaults
    console.error(`Error calculating draw-specific properties for user ${user._id}:`, error);
  }

  // Determine brand interest
  // If user has made purchases, explicitly set to null to remove tag from Klaviyo
  // If no purchases, use brand from signup or default to "milwaukee"
  const userHasPurchases = hasUserMadePurchase(user);
  let brandInterest: string | null | undefined;

  if (userHasPurchases) {
    // User has made purchases - explicitly set to null to remove tag from Klaviyo
    brandInterest = null;
    // console.log(
    //   `🏷️ User ${user.email} has purchases - removing brand_interest tag. Has subscription: ${!!user.subscription
    //     ?.isActive}, upsells: ${user.upsellPurchases?.length || 0}, one-time: ${
    //     user.oneTimePackages?.length || 0
    //   }, mini-draw: ${user.miniDrawPackages?.length || 0}`
    // );
  } else {
    // User hasn't purchased yet - set brand interest
    if (brandInterestFromSignup) {
      brandInterest = extractBrandFromSlug(brandInterestFromSignup);
    } else {
      // Default to milwaukee if no brand provided
      brandInterest = "milwaukee";
    }
    // console.log(`🏷️ User ${user.email} has no purchases - setting brand_interest to: ${brandInterest}`);
  }

  const klaviyoProfile = {
    email: user.email,
    first_name: user.firstName,
    last_name: user.lastName,
    phone_number: phone,
    // Note: email_consent and sms_consent are NOT valid fields in profile attributes
    // Email consent should be handled by subscribing users to email lists
    // SMS consent is handled separately via subscribeToSMSList method
    // Both will be handled via list subscriptions to ensure proper consent tracking
    properties: {
      // Basic user info
      user_id: user._id.toString(),
      created_at: user.createdAt.toISOString(),
      last_login: user.lastLogin?.toISOString(),
      is_active: user.isActive,
      role: user.role,
      state: user.state ? getStateByCode(user.state)?.name : undefined,
      profession: user.profession || undefined,
      // Optional field — `undefined` is stripped by cleanProperties, so members who never
      // answered simply have no `gender` property rather than a "unknown" sentinel that would
      // pollute segments. Lowercase name matches `state` / `profession` above.
      gender: user.gender || undefined,

      // Verification status
      is_email_verified: user.isEmailVerified || false,
      is_mobile_verified: user.isMobileVerified || false,

      // Profile completion
      profile_setup_completed: user.profileSetupCompleted || false,
      app_accepts_promotional_email: user.acceptsPromotionalEmail !== false,

      // Subscription details
      has_active_subscription: user.subscription?.isActive || false,
      subscription_tier:
        user.subscription?.packageId && user.subscription.packageId.trim() !== ""
          ? user.subscription.packageId
          : undefined, // Handle empty string and undefined
      subscription_start_date: safeDateToISO(user.subscription?.startDate),
      subscription_end_date: safeDateToISO(user.subscription?.endDate),
      subscription_auto_renew: user.subscription?.autoRenew ?? undefined,
      subscription_status:
        user.subscription?.status && user.subscription.status.trim() !== "" ? user.subscription.status : undefined,

      past_due_renewal_entries: getRenewalEntriesPreviewForProfile(user) ?? null,

      // Subscription lifecycle tracking
      // NOT `!!user.subscription?.pendingChange` — Mongoose materialises that nested object
      // as `{}`, making the expression permanently true (it was `true` on all 56,360
      // production profiles while zero users had a real pending upgrade).
      // See utils/subscription/pending-upgrade.ts.
      subscription_has_pending_upgrade: isValidPendingUpgrade(user.subscription?.pendingChange),
      subscription_previous_tier:
        user.subscription?.previousSubscription?.packageId &&
        user.subscription.previousSubscription.packageId.trim() !== ""
          ? user.subscription.previousSubscription.packageId
          : undefined,
      subscription_last_upgrade_date: safeDateToISO(user.subscription?.lastUpgradeDate),
      subscription_last_downgrade_date: safeDateToISO(user.subscription?.lastDowngradeDate),

      // Entries and points
      accumulated_entries: user.accumulatedEntries || 0,
      rewards_points: user.rewardsPoints || 0,

      // Purchase history
      total_one_time_packages: user.oneTimePackages?.length || 0,
      total_mini_draw_packages: user.miniDrawPackages?.length || 0,
      last_purchase_date: getLastPurchaseDate(user),
      first_purchase_date: getFirstPurchaseDate(user),

      // Lifetime value & spending
      lifetime_value: lifetimeValue,
      total_spent: lifetimeValue, // Alias for clarity

      // Upsell data
      // Real: counts actual purchases off `user.upsellPurchases`.
      total_upsells_purchased: (user.upsellPurchases?.length || 0) > 0 ? user.upsellPurchases!.length : 0,

      // RETIRED 2026-08-26. Their only writer (`POST /api/upsell/track`, called from
      // `UpsellManager.tsx`) is imported nowhere, so these read 0 for ALL 56,360 users while
      // 2,290 users had real upsell purchases — a funnel that never recorded anything.
      //
      // Explicit `null` CLEARS them in Klaviyo. `undefined` would be stripped by
      // `cleanProperties` and leave the stale zeros in place, which is worse than removing
      // them: a zero reads as a measured value. Klaviyo's own guidance is to clean out
      // properties that are no longer useful.
      //
      // Re-enabling upsell funnel data means mounting the tracker; that is separate work.
      upsell_total_shown: null,
      upsell_total_accepted: null,
      upsell_total_declined: null,
      upsell_conversion_rate: null,
      upsell_last_interaction: null,

      // Referral program
      referral_code: user.referral?.code,
      referral_successful_conversions: user.referral?.successfulConversions || 0,
      referral_total_entries_awarded: user.referral?.totalEntriesAwarded || 0,

      // Partner discount status
      partner_discount_active: partnerDiscountStatus.active,
      partner_discount_queued_count: partnerDiscountStatus.queuedCount,
      partner_discount_total_days: partnerDiscountStatus.totalDays,
      partner_discount_next_activation_date: partnerDiscountStatus.nextActivationDate,

      // Brand interest tracking (removed when user makes any purchase)
      brand_interest: brandInterest,

      // Entry breakdown by source (for advanced segmentation)
      member_entries: entryBreakdown.memberEntries,
      one_time_entries: entryBreakdown.oneTimeEntries,
      upsell_entries: entryBreakdown.upsellEntries,
      mini_draw_entries: entryBreakdown.miniDrawEntries,

      // Draw-specific properties (reset when new draw activates)
      // Always include boolean/number properties (never undefined) - these will always be sent to Klaviyo
      // String properties can be undefined (will be filtered by cleanProperties if no draw found)
      current_draw_id: drawSpecificProperties.current_draw_id,
      current_draw_name: drawSpecificProperties.current_draw_name,
      current_draw_start_date: drawSpecificProperties.current_draw_start_date,
      current_draw_subscription_active: drawSpecificProperties.current_draw_subscription_active ?? false,
      current_draw_one_time_packages: drawSpecificProperties.current_draw_one_time_packages ?? 0,
      current_draw_entries: drawSpecificProperties.current_draw_entries ?? 0,

      // Canonical properties (added 2026-05-28 — see docs/tracking/KLAVIYO_INTEGRATION.md
      // "Canonical property names" section). Coexist with legacy `subscription_status`
      // (which keeps raw Stripe values for the flows / segments / templates already
      // wired against it). The new properties enable the "Purchased entries but no
      // membership", "At-risk near renewal", and "Long-term member" segments the
      // ads team asked for.
      membership_status: deriveMembershipStatus(user),
      entries_purchased: entriesPurchased,
      giveaways_entered: giveawaysEntered,
      membership_active_duration_months: computeActiveDurationMonths(user.subscription?.startDate),
      next_renewal_date:
        user.subscription?.isActive && user.subscription?.autoRenew
          ? safeDateToISO(user.subscription.endDate) ?? null
          : null,
    },
  };

  // ✅ DEBUG: Log the profile data being sent to Klaviyo
  // console.log(`📊 Klaviyo Profile Data for ${user.email}:`, {
  //   accumulated_entries: klaviyoProfile.properties.accumulated_entries,
  //   rewards_points: klaviyoProfile.properties.rewards_points,
  //   subscription: {
  //     has_active_subscription: klaviyoProfile.properties.has_active_subscription,
  //     subscription_tier: klaviyoProfile.properties.subscription_tier,
  //     subscription_start_date: klaviyoProfile.properties.subscription_start_date,
  //     subscription_end_date: klaviyoProfile.properties.subscription_end_date,
  //     subscription_status: klaviyoProfile.properties.subscription_status,
  //     subscription_auto_renew: klaviyoProfile.properties.subscription_auto_renew,
  //     subscription_has_pending_upgrade: klaviyoProfile.properties.subscription_has_pending_upgrade,
  //     subscription_previous_tier: klaviyoProfile.properties.subscription_previous_tier,
  //     subscription_last_upgrade_date: klaviyoProfile.properties.subscription_last_upgrade_date,
  //     subscription_last_downgrade_date: klaviyoProfile.properties.subscription_last_downgrade_date,
  //   },
  //   lifetime_value: klaviyoProfile.properties.lifetime_value,
  //   total_spent: klaviyoProfile.properties.total_spent,
  //   brand_interest: klaviyoProfile.properties.brand_interest,
  //   has_purchases: hasUserMadePurchase(user),
  //   referral_code: klaviyoProfile.properties.referral_code,
  //   partner_discount_active: klaviyoProfile.properties.partner_discount_active,
  //   entry_breakdown: {
  //     member_entries: klaviyoProfile.properties.member_entries,
  //     one_time_entries: klaviyoProfile.properties.one_time_entries,
  //     upsell_entries: klaviyoProfile.properties.upsell_entries,
  //     mini_draw_entries: klaviyoProfile.properties.mini_draw_entries,
  //   },
  // });

  return klaviyoProfile;
}

/**
 * Lifetime spend in dollars, refund-netted, read from the payment ledger.
 *
 * The previous implementation summed `catalogue.price x elapsed months` and gated the
 * subscription portion on `subscription.isActive`, so a figure NAMED lifetime collapsed the
 * moment a membership lapsed, and was wrong across any upgrade or downgrade.
 *
 * NOTE: Klaviyo also computes Historic CLV natively from the `Placed Order` / `Refunded
 * Order` events this app already sends with `$value`, `Currency` and `Order ID`. Where the
 * two disagree, KLAVIYO'S NATIVE FIGURE IS THE TIEBREAKER — it is derived from a source
 * that cannot drift out of sync with what Klaviyo itself sees.
 */
export function calculateLifetimeValue(user: IUser, ledger: UserGrantLedger): number {
  void user;
  return ledger.netSpend;
}

/**
 * Calculate partner discount status summary
 * Returns active status, queued count, total days, and next activation date
 */
export function calculatePartnerDiscountStatus(user: IUser): {
  active: boolean;
  queuedCount: number;
  totalDays: number;
  nextActivationDate?: string;
} {
  const queue = user.partnerDiscountQueue || [];

  // Find active discount (status === "active")
  const activeDiscount = queue.find((item) => item.status === "active");
  const isActive = !!activeDiscount;

  // Count queued discounts (status === "queued")
  const queuedCount = queue.filter((item) => item.status === "queued").length;

  // Calculate total days (active + queued)
  let totalDays = 0;
  queue.forEach((item) => {
    if (item.status === "active" || item.status === "queued") {
      totalDays += item.discountDays || 0;
      // Add hours converted to days (24 hours = 1 day)
      totalDays += (item.discountHours || 0) / 24;
    }
  });

  // Find next activation date (earliest startDate from queued items)
  const queuedItems = queue.filter((item) => item.status === "queued" && item.startDate);
  let nextActivationDate: string | undefined;
  if (queuedItems.length > 0) {
    const sortedQueued = queuedItems.sort(
      (a, b) => new Date(a.startDate!).getTime() - new Date(b.startDate!).getTime()
    );
    nextActivationDate = sortedQueued[0].startDate?.toISOString();
  }

  return {
    active: isActive,
    queuedCount,
    totalDays: Math.round(totalDays * 100) / 100, // Round to 2 decimal places
    nextActivationDate,
  };
}


/**
 * Get last purchase date from user
 */
export function getLastPurchaseDate(user: IUser): string | undefined {
  const dates: Date[] = [];

  if (user.oneTimePackages) {
    dates.push(...user.oneTimePackages.map((p) => p.purchaseDate));
  }

  if (user.miniDrawPackages) {
    dates.push(...user.miniDrawPackages.map((p) => p.purchaseDate));
  }

  if (user.upsellPurchases) {
    dates.push(...user.upsellPurchases.map((p) => p.purchaseDate));
  }

  if (dates.length === 0) return undefined;

  const latestDate = new Date(Math.max(...dates.map((d) => d.getTime())));
  return latestDate.toISOString();
}

/**
 * Get first purchase date from user
 */
export function getFirstPurchaseDate(user: IUser): string | undefined {
  const dates: Date[] = [];

  if (user.oneTimePackages) {
    dates.push(...user.oneTimePackages.map((p) => p.purchaseDate));
  }

  if (user.miniDrawPackages) {
    dates.push(...user.miniDrawPackages.map((p) => p.purchaseDate));
  }

  if (user.upsellPurchases) {
    dates.push(...user.upsellPurchases.map((p) => p.purchaseDate));
  }

  if (dates.length === 0) return undefined;

  const earliestDate = new Date(Math.min(...dates.map((d) => d.getTime())));
  return earliestDate.toISOString();
}

/**
 * Extract customer properties from user for events
 */
/**
 * Format customer properties for Klaviyo with proper data formatting
 */
export function getCustomerProperties(user: IUser) {
  // Format phone number - ensure it starts with +61 for Australian numbers
  const phone = user.mobile
    ? user.mobile.startsWith("+")
      ? user.mobile
      : `+61${user.mobile.replace(/^0/, "")}`
    : undefined;

  return {
    email: user.email?.trim().toLowerCase() || "",
    first_name: user.firstName?.trim() || "",
    last_name: user.lastName?.trim() || "",
    phone_number: phone || "",
  };
}

/**
 * Format invoice data for Klaviyo with proper formatting
 */
export function formatInvoiceDataForKlaviyo(invoiceData: {
  invoiceId: string;
  invoiceNumber: string;
  packageType: "membership" | "one-time" | "upsell" | "mini-draw";
  packageId: string;
  packageName: string;
  packageTier?: string;
  partnerDiscountCatalogPercent?: number;
  totalAmount: number;
  paymentIntentId: string;
  billingReason?: string;
  entries_gained: number;
  items: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    total_price: number;
  }>;
}) {
  // Format date to readable format (e.g., "December 22, 2025")
  const invoiceDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Format total amount as string with 2 decimal places (already in dollars)
  const formattedTotalAmount = invoiceData.totalAmount.toFixed(2);

  // Format package name - ensure it's properly formatted
  const formattedPackageName = invoiceData.packageName?.trim() || "Unknown Package";

  // Format items with proper decimal formatting
  const formattedItems = invoiceData.items.map((item) => ({
    description: item.description,
    quantity: item.quantity,
    unit_price: item.unit_price.toFixed(2),
    total_price: item.total_price.toFixed(2),
  }));

  const partnerDiscountCatalogPercent =
    invoiceData.partnerDiscountCatalogPercent ?? getPartnerCatalogAccessPercentForPlanId(invoiceData.packageId);

  return {
    invoice_id: invoiceData.invoiceId,
    invoice_number: invoiceData.invoiceNumber,
    invoice_date: invoiceDate, // Formatted as "December 22, 2025"
    package_type: invoiceData.packageType,
    package_id: invoiceData.packageId,
    package_name: formattedPackageName,
    package_tier: invoiceData.packageTier?.trim() || "",
    partner_discount_catalog_percent: partnerDiscountCatalogPercent,
    partner_discount_catalog_summary: getPartnerDiscountCatalogSummaryForPackageId(invoiceData.packageId),
    total_amount: formattedTotalAmount, // Formatted as "49.99"
    payment_intent_id: invoiceData.paymentIntentId,
    billing_reason: invoiceData.billingReason || "",
    entries_gained: invoiceData.entries_gained,
    items: formattedItems, // Array for Klaviyo template looping
    payment_status: "paid",
    created_at: new Date().toISOString(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any; // Type assertion needed for array items support in Klaviyo properties
}

/**
 * Format package data for Klaviyo events with consistent formatting
 *
 * LEGACY shape — emits `price` as string ("49.99"), `tier` as empty string when
 * absent, `package_name` falling back to "Unknown Package". Preserved for the
 * events defined in `klaviyo-events.ts` as of 2026-05-27 (Subscription Started,
 * Placed Order, etc.) which have active Klaviyo flows / templates / segments
 * wired against this exact shape.
 *
 * For NEW events going forward, use `formatCanonicalPackageData` instead — it
 * emits `price` as a number, omits `tier` when absent (no `""` sentinel), and
 * includes `package_type` for cross-event aggregation. See the
 * "Canonical property names — new events only" section of
 * `docs/tracking/KLAVIYO_INTEGRATION.md` for the rationale.
 */
export function formatPackageDataForKlaviyo(packageData: {
  packageId: string;
  packageName: string;
  tier?: string;
  price: number;
}) {
  return {
    package_id: packageData.packageId,
    package_name: packageData.packageName?.trim() || "Unknown Package",
    tier: packageData.tier?.trim() || "",
    price: packageData.price.toFixed(2), // Format as "49.99"
  };
}

/**
 * Canonical package-data shape for Klaviyo events created after 2026-05-27.
 *
 * Emits per the canonical schema in `docs/tracking/KLAVIYO_INTEGRATION.md`:
 * - `price` as a NUMBER (not string) — Klaviyo segment `>` / `<` filters compare
 *   numerically only when the property is a number
 * - `tier` omitted entirely when absent — no `""` / `"unknown"` sentinel
 * - `package_type` always emitted — enables cross-event aggregations
 * - `num_entries` optional, for one-time / mini-draw / upsell packages
 *
 * Do NOT use this for the legacy events in `klaviyo-events.ts` (Subscription
 * Started, Placed Order, etc.) — those are frozen against `formatPackageDataForKlaviyo`.
 *
 * The `canonical-events-shape.test.ts` snapshot test will fail CI if a new
 * event drifts from these property names.
 */
export function formatCanonicalPackageData(p: {
  packageId: string;
  packageName: string;
  packageType: "membership" | "one-time" | "mini-draw" | "upsell";
  tier?: string;
  price: number;
  numEntries?: number;
}) {
  const trimmedTier = p.tier?.trim();
  return {
    package_id: p.packageId,
    package_name: p.packageName.trim(),
    package_type: p.packageType,
    price: p.price, // number, not string
    ...(trimmedTier ? { tier: trimmedTier } : {}),
    ...(p.numEntries !== undefined ? { num_entries: p.numEntries } : {}),
  };
}

/**
 * Format date for Klaviyo events
 */
export function formatDateForKlaviyo(date?: Date): string {
  const dateToFormat = date || new Date();
  return dateToFormat.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Format timestamp for Klaviyo events
 */
export function formatTimestampForKlaviyo(date?: Date): string {
  const dateToFormat = date || new Date();
  return dateToFormat.toISOString();
}

// ============================================================
// CANONICAL PROFILE-PROPERTY HELPERS (added 2026-05-28)
// See docs/tracking/KLAVIYO_INTEGRATION.md "Canonical property names".
// Used by `userToKlaviyoProfile` to populate `membership_status`,
// `entries_purchased`, `giveaways_entered`, `membership_active_duration_months`,
// and `next_renewal_date` — the new canonical profile properties that enable
// the ads team's segments without engineering involvement per-flow.
// ============================================================

export type MembershipStatus = "active" | "past_due" | "canceled" | "paused" | "never_subscribed";

/**
 * Coerce raw User/Stripe subscription state into the 4-value canonical
 * `membership_status` enum used in Klaviyo segments.
 *
 * Coercion table (see also docs/tracking/patterns.md P7 and docs/tracking/KLAVIYO_INTEGRATION.md):
 *   "active"                          → "active"
 *   "trialing"                        → "active"   (trial users have full benefits)
 *   "past_due"                        → "past_due"
 *   "unpaid"                          → "past_due" (Stripe's continued-dunning state)
 *   "canceled"                        → "canceled"
 *   "paused"                          → "paused"   (retention-pause freeze window)
 *   "incomplete" / "incomplete_expired" → "never_subscribed" (never became a member)
 *   (no subscription object)          → "never_subscribed"
 *   anything else                     → "never_subscribed" (safest default for segments)
 *
 * Legacy `subscription_status` (raw Stripe value) continues to be written by
 * `userToKlaviyoProfile` for back-compat with existing Klaviyo flows / segments
 * / templates wired against it — do not remove that property.
 */
export function deriveMembershipStatus(user: IUser): MembershipStatus {
  const status = user.subscription?.status;
  if (!user.subscription || !status) return "never_subscribed";
  if (status === "active" || status === "trialing") return "active";
  if (status === "past_due" || status === "unpaid") return "past_due";
  if (status === "canceled") return "canceled";
  if (status === "paused") return "paused";
  if (status === "incomplete" || status === "incomplete_expired") return "never_subscribed";
  return "never_subscribed";
}

/**
 * Number of complete calendar months between `startDate` and now.
 *
 * Uses `date-fns` `differenceInMonths` (DST-safe, respects calendar boundaries)
 * rather than the naive `(now - start) / (30.4375 * 86400000)` that drifts
 * around DST transitions. Returns `null` when the user has no subscription
 * start date (i.e. never subscribed).
 */
export function computeActiveDurationMonths(startDate: Date | undefined | null): number | null {
  if (!startDate) return null;
  const start = startDate instanceof Date ? startDate : new Date(startDate);
  return Math.max(0, differenceInMonths(new Date(), start));
}

/**
 * Count distinct draws (Major + Mini) the user has at least one entry in.
 *
 * Two parallel queries because Major Draw and Mini Draw entries live in
 * different collections:
 *   - Major Draw entries are embedded subdocs on `MajorDraw.entries[]`
 *     (indexed at `MajorDraw.ts:269` on `"entries.userId"`)
 *   - Mini Draw entries are a flat collection (`TicketEntry`, indexed at
 *     `TicketEntry.ts:58` on `{ userId: 1, miniDrawId: 1 }`)
 *
 * Both queries are indexed and run in parallel via `Promise.all` — total
 * round-trip per profile sync is one (parallel) Mongo wait.
 *
 * Callers should wrap in a try/catch; this helper does not swallow errors.
 */
export async function countDistinctDrawsEntered(
  userId: mongoose.Types.ObjectId | string
): Promise<number> {
  const [majorCount, miniDrawIds] = await Promise.all([
    MajorDraw.countDocuments({ "entries.userId": userId }),
    TicketEntry.distinct("miniDrawId", { userId }),
  ]);
  return majorCount + miniDrawIds.length;
}
