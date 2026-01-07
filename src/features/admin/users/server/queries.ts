/**
 * Server-side queries for admin user management
 * Contains all database read operations for users
 */

import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import PaymentEvent from "@/models/PaymentEvent";
import MajorDraw from "@/models/MajorDraw";
import MiniDraw from "@/models/MiniDraw";
import Order from "@/models/Order";
import ReferralEvent from "@/models/ReferralEvent";
import mongoose from "mongoose";
import { getPackageById } from "@/data/membershipPackages";
import { getMiniDrawPackageById } from "@/data/miniDrawPackages";
import { REFERRAL_CONSTANTS } from "@/lib/referral";
import type { UserFilters, AdminUserDetail } from "@/types/admin";

/**
 * Calculate engagement score based on user activity
 * Higher score = more engaged user
 */
function calculateEngagementScore(
  user: {
    profileSetupCompleted?: boolean;
    isEmailVerified?: boolean;
    isMobileVerified?: boolean;
    lastLogin?: Date;
    subscription?: { isActive?: boolean };
    oneTimePackages?: unknown[];
    upsellStats?: { totalAccepted?: number };
  },
  paymentEvents: Array<{ eventType?: string }>,
  majorDrawParticipation: Array<{ totalEntries?: number }>
): number {
  let score = 0;

  // Base score for account setup
  if (user.profileSetupCompleted) score += 10;
  if (user.isEmailVerified) score += 5;
  if (user.isMobileVerified) score += 5;

  // Activity score
  if (user.lastLogin) {
    const daysSinceLogin = Math.floor((Date.now() - new Date(user.lastLogin).getTime()) / (1000 * 60 * 60 * 24));
    if (daysSinceLogin <= 7) score += 20;
    else if (daysSinceLogin <= 30) score += 10;
    else if (daysSinceLogin <= 90) score += 5;
  }

  // Purchase activity
  const purchaseCount = paymentEvents.filter((e) => e.eventType === "BenefitsGranted").length;
  score += Math.min(purchaseCount * 5, 50); // Max 50 points for purchases

  // Major draw participation
  const totalDrawEntries = majorDrawParticipation.reduce((sum, draw) => sum + (draw.totalEntries || 0), 0);
  score += Math.min(totalDrawEntries * 2, 30); // Max 30 points for draw entries

  // Subscription activity
  if (user.subscription?.isActive) score += 15;

  // One-time packages
  if ((user.oneTimePackages?.length || 0) > 0) score += 10;

  // Upsell engagement
  if ((user.upsellStats?.totalAccepted || 0) > 0) score += 10;

  return Math.min(score, 100); // Cap at 100
}

/**
 * Build comprehensive admin user profile with all related data
 * Exported for use in mutations
 */
export async function buildAdminUserProfile(userId: string): Promise<AdminUserDetail | null> {
  await connectDB();

  const user = await User.findById(userId)
    .select("-password -emailVerificationToken -passwordResetToken -smsOtpCode")
    .lean();

  if (!user) {
    return null;
  }

  const resolveMembershipPackageName = (packageId?: unknown, fallback?: string | null) => {
    if (!packageId) return fallback ?? null;
    const id = packageId.toString();
    return getPackageById(id)?.name ?? fallback ?? id;
  };

  const resolveMiniPackageName = (packageId?: unknown, fallback?: string | null) => {
    if (!packageId) return fallback ?? null;
    const id = packageId.toString();
    return getMiniDrawPackageById(id)?.name ?? fallback ?? id;
  };

  const paymentEvents = await PaymentEvent.find({
    userId: new mongoose.Types.ObjectId(userId),
  })
    .sort({ timestamp: -1 })
    .lean();

  const orders = await Order.find({
    user: new mongoose.Types.ObjectId(userId),
  })
    .populate("products.product", "name price")
    .populate("tickets.miniDrawId", "name")
    .sort({ createdAt: -1 })
    .lean();

  const majorDraws = await MajorDraw.find({
    "entries.userId": new mongoose.Types.ObjectId(userId),
  })
    .select("name title status endDate entries")
    .lean<
      {
        _id: mongoose.Types.ObjectId;
        name?: string;
        title?: string;
        status?: string;
        endDate?: Date;
        entries: Array<{
          userId: mongoose.Types.ObjectId;
          totalEntries?: number;
          quantity?: number;
          entriesBySource?: Record<string, number>;
          firstAddedDate?: Date;
          lastUpdatedDate?: Date;
        }>;
      }[]
    >();

  const totalSpent = paymentEvents
    .filter((event) => event.eventType === "BenefitsGranted")
    .reduce((sum, event) => sum + (event.data?.price || 0), 0);

  const totalOrders = orders.length;
  const totalOrderValue = orders.reduce((sum, order) => sum + order.totalAmount, 0);

  const miniDrawIds = (user.miniDrawParticipation || [])
    .map((participation) => participation.miniDrawId?.toString())
    .filter((id): id is string => Boolean(id));

  const miniDrawDocs = miniDrawIds.length
    ? await MiniDraw.find({ _id: { $in: miniDrawIds } })
        .select("name status totalEntries minimumEntries")
        .lean<
          {
            _id: mongoose.Types.ObjectId;
            name?: string;
            status?: string;
            totalEntries?: number;
            minimumEntries?: number;
          }[]
        >()
    : [];

  const miniDrawDocMap = new Map(miniDrawDocs.map((doc) => [doc._id.toString(), doc]));

  const majorDrawParticipation = majorDraws.map((draw) => {
    const userEntries =
      draw.entries?.filter((entry: { userId: { toString: () => string } }) => entry.userId.toString() === userId) || [];
    const totalEntries = userEntries.reduce(
      (sum: number, entry: { totalEntries?: number }) => sum + (entry.totalEntries ?? 0),
      0
    );

    return {
      drawId: draw._id,
      title: draw.title || draw.name || draw._id.toString(),
      status: draw.status,
      endDate: draw.endDate,
      totalEntries,
      entries: userEntries,
    };
  });

  const currentMajorDraw = majorDraws.find((draw) => draw.status === "active");
  const currentDrawEntries = currentMajorDraw
    ? currentMajorDraw.entries
        ?.filter((entry: { userId: { toString: () => string } }) => entry.userId.toString() === userId)
        .reduce((sum: number, entry: { totalEntries?: number }) => sum + (entry.totalEntries ?? 0), 0) || 0
    : 0;

  const subscriptionHistory = paymentEvents
    .filter((event) => event.packageType === "membership")
    .map((event) => {
      const packageNameFallback = typeof event.data?.packageName === "string" ? event.data.packageName : null;
      return {
        timestamp: event.timestamp,
        packageId: event.data?.packageId,
        packageName: resolveMembershipPackageName(event.data?.packageId, packageNameFallback),
        price: event.data?.price,
        status: event.eventType,
      };
    });

  const oneTimePackageHistory = paymentEvents
    .filter((event) => event.packageType === "one-time")
    .map((event) => {
      const packageNameFallback = typeof event.data?.packageName === "string" ? event.data.packageName : null;
      return {
        timestamp: event.timestamp,
        packageId: event.data?.packageId,
        packageName: resolveMembershipPackageName(event.data?.packageId, packageNameFallback),
        price: event.data?.price,
        entries: event.data?.entries,
      };
    });

  const upsellHistory = paymentEvents
    .filter((event) => event.packageType === "upsell")
    .map((event) => ({
      timestamp: event.timestamp,
      offerId: event.data?.offerId,
      offerTitle: event.data?.offerTitle,
      price: event.data?.price,
      entries: event.data?.entries,
    }));

  const miniDrawHistory = paymentEvents
    .filter((event) => event.packageType === "mini-draw")
    .map((event) => {
      const packageNameFallback = typeof event.data?.packageName === "string" ? event.data.packageName : null;
      return {
        timestamp: event.timestamp,
        packageId: event.data?.packageId,
        packageName: resolveMiniPackageName(event.data?.packageId, packageNameFallback),
        price: event.data?.price,
        entries: event.data?.entries,
      };
    });

  const activePartnerDiscount = user.partnerDiscountQueue?.find((discount) => discount.status === "active");
  const queuedPartnerDiscounts = user.partnerDiscountQueue?.filter((discount) => discount.status === "queued") || [];

  const redemptionHistory = user.redemptionHistory || [];

  const daysSinceLastLogin = user.lastLogin
    ? Math.floor((Date.now() - new Date(user.lastLogin).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const accountAge = Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24));

  const userObjectId = new mongoose.Types.ObjectId(userId);
  const referralEvents = await ReferralEvent.find({
    $or: [{ referrerId: userObjectId }, { inviteeUserId: userObjectId }],
  })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  const referralSummary = {
    code: user.referral?.code ?? null,
    successfulConversions: user.referral?.successfulConversions ?? 0,
    totalEntriesAwarded: user.referral?.totalEntriesAwarded ?? 0,
    pendingCount: referralEvents.filter((event) => event.status === "pending").length,
    history: referralEvents.map((event) => {
      const isReferrer = event.referrerId?.toString() === userObjectId.toString();
      return {
        id: event._id.toString(),
        referralCode: event.referralCode,
        status: event.status,
        role: (isReferrer ? "referrer" : "friend") as "referrer" | "friend",
        friendEmail: isReferrer ? event.inviteeEmail : undefined,
        conversionDate: event.conversionDate ? new Date(event.conversionDate).toISOString() : undefined,
        createdAt: event.createdAt ? new Date(event.createdAt).toISOString() : new Date().toISOString(),
        entriesAwarded: isReferrer
          ? event.referrerEntriesAwarded ?? REFERRAL_CONSTANTS.rewardEntries
          : event.referreeEntriesAwarded ?? REFERRAL_CONSTANTS.rewardEntries,
      };
    }),
  };

  return {
    id: user._id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    mobile: user.mobile,
    state: user.state,
    profession: user.profession,
    role: user.role,
    isActive: user.isActive,
    isEmailVerified: user.isEmailVerified,
    isMobileVerified: user.isMobileVerified,
    profileSetupCompleted: user.profileSetupCompleted,
    createdAt: user.createdAt instanceof Date ? user.createdAt.toISOString() : user.createdAt,
    updatedAt: user.updatedAt instanceof Date ? user.updatedAt.toISOString() : user.updatedAt,
    lastLogin: user.lastLogin instanceof Date ? user.lastLogin.toISOString() : user.lastLogin,
    subscription: user.subscription
      ? {
          packageId: user.subscription.packageId,
          packageName: resolveMembershipPackageName(user.subscription.packageId) ?? undefined,
          isActive: user.subscription.isActive,
          startDate:
            user.subscription.startDate instanceof Date
              ? user.subscription.startDate.toISOString()
              : user.subscription.startDate,
          endDate:
            user.subscription.endDate instanceof Date
              ? user.subscription.endDate.toISOString()
              : user.subscription.endDate,
          status: user.subscription.status || "incomplete",
          autoRenew: user.subscription.autoRenew,
          lastMonthAccumulatedEntries: user.subscription.lastMonthAccumulatedEntries,
          previousSubscription: user.subscription.previousSubscription,
          pendingChange: user.subscription.pendingChange,
          lastDowngradeDate:
            user.subscription.lastDowngradeDate instanceof Date
              ? user.subscription.lastDowngradeDate.toISOString()
              : user.subscription.lastDowngradeDate,
          lastUpgradeDate:
            user.subscription.lastUpgradeDate instanceof Date
              ? user.subscription.lastUpgradeDate.toISOString()
              : user.subscription.lastUpgradeDate,
        }
      : null,
    oneTimePackages: (user.oneTimePackages || []).map((pkg) => ({
      packageId: pkg.packageId,
      packageName: resolveMembershipPackageName(pkg.packageId) ?? undefined,
      purchaseDate: pkg.purchaseDate instanceof Date ? pkg.purchaseDate.toISOString() : pkg.purchaseDate,
      startDate: pkg.startDate instanceof Date ? pkg.startDate.toISOString() : pkg.startDate,
      endDate: pkg.endDate instanceof Date ? pkg.endDate.toISOString() : pkg.endDate,
      isActive: pkg.isActive,
      entriesGranted: pkg.entriesGranted,
    })),
    miniDrawPackages: (user.miniDrawPackages || []).map((pkg) => ({
      packageId: pkg.packageId,
      packageName: pkg.packageName,
      miniDrawId: pkg.miniDrawId?.toString(),
      purchaseDate: pkg.purchaseDate instanceof Date ? pkg.purchaseDate.toISOString() : pkg.purchaseDate,
      startDate: pkg.startDate instanceof Date ? pkg.startDate.toISOString() : pkg.startDate,
      endDate: pkg.endDate instanceof Date ? pkg.endDate.toISOString() : pkg.endDate,
      isActive: pkg.isActive,
      entriesGranted: pkg.entriesGranted,
      price: pkg.price,
      partnerDiscountHours: pkg.partnerDiscountHours,
      partnerDiscountDays: pkg.partnerDiscountDays,
      stripePaymentIntentId: pkg.stripePaymentIntentId,
    })),
    rewardsPoints: user.rewardsPoints || 0,
    accumulatedEntries: user.accumulatedEntries || 0,
    entryWallet: user.entryWallet || 0,
    partnerDiscountQueue: (user.partnerDiscountQueue || []).map((discount) => ({
      ...discount,
      _id: discount._id?.toString(),
      purchaseDate: discount.purchaseDate instanceof Date ? discount.purchaseDate.toISOString() : discount.purchaseDate,
      startDate: discount.startDate instanceof Date ? discount.startDate.toISOString() : discount.startDate,
      endDate: discount.endDate instanceof Date ? discount.endDate.toISOString() : discount.endDate,
      expiryDate: discount.expiryDate instanceof Date ? discount.expiryDate.toISOString() : discount.expiryDate,
    })),
    activePartnerDiscount,
    queuedPartnerDiscounts,
    upsellPurchases: (user.upsellPurchases || []).map((upsell) => ({
      offerId: upsell.offerId,
      offerTitle: upsell.offerTitle,
      entriesAdded: upsell.entriesAdded,
      amountPaid: upsell.amountPaid,
      purchaseDate: upsell.purchaseDate instanceof Date ? upsell.purchaseDate.toISOString() : upsell.purchaseDate,
    })),
    upsellHistory,
    upsellStats: user.upsellStats || undefined,
    redemptionHistory,
    statistics: {
      totalSpent,
      totalOrders,
      totalOrderValue,
      currentDrawEntries,
      accountAge,
      daysSinceLastLogin: daysSinceLastLogin ?? undefined,
      lifetimeValue: totalSpent,
      averageOrderValue: totalOrders > 0 ? totalOrderValue / totalOrders : 0,
      engagementScore: calculateEngagementScore(user, paymentEvents, majorDrawParticipation),
    },
    subscriptionHistory: subscriptionHistory.map((sub) => ({
      timestamp: sub.timestamp instanceof Date ? sub.timestamp.toISOString() : sub.timestamp,
      packageId: sub.packageId?.toString(),
      packageName: sub.packageName ?? undefined,
      price: sub.price,
      status: sub.status,
    })),
    oneTimePackageHistory: oneTimePackageHistory.map((pkg) => ({
      timestamp: pkg.timestamp instanceof Date ? pkg.timestamp.toISOString() : pkg.timestamp,
      packageId: pkg.packageId?.toString(),
      packageName: pkg.packageName ?? undefined,
      price: pkg.price,
      entries: pkg.entries,
    })),
    miniDrawHistory: miniDrawHistory.map((draw) => ({
      timestamp: draw.timestamp instanceof Date ? draw.timestamp.toISOString() : draw.timestamp,
      packageId: draw.packageId?.toString(),
      packageName: draw.packageName ?? undefined,
      price: draw.price,
      entries: draw.entries,
    })),
    majorDrawParticipation: majorDrawParticipation.map((draw) => ({
      drawId: draw.drawId.toString(),
      title: draw.title,
      status: draw.status,
      endDate: draw.endDate instanceof Date ? draw.endDate.toISOString() : draw.endDate,
      totalEntries: draw.totalEntries,
    })),
    miniDrawParticipation: (user.miniDrawParticipation || []).map((participation) => {
      const miniDrawId = participation.miniDrawId?.toString();
      const doc = miniDrawId ? miniDrawDocMap.get(miniDrawId) : undefined;

      return {
        miniDrawId: miniDrawId,
        miniDrawName: doc?.name || miniDrawId,
        miniDrawStatus: doc?.status || (participation.isActive ? "active" : "inactive"),
        totalEntries: participation.totalEntries,
        isActive: participation.isActive,
      };
    }),
    orders: orders.map((order) => ({
      _id: order._id?.toString(),
      orderNumber: order.orderNumber,
      createdAt: order.createdAt instanceof Date ? order.createdAt.toISOString() : order.createdAt,
      totalAmount: order.totalAmount,
      status: order.status,
    })),
    paymentEvents: paymentEvents.slice(0, 50).map((event) => ({
      eventType: event.eventType,
      timestamp: event.timestamp instanceof Date ? event.timestamp.toISOString() : event.timestamp,
      packageType: event.packageType,
      data: event.data,
    })),
    referral: referralSummary,
  };
}

/**
 * Get paginated list of users with search and filtering
 */
export async function getUsers(filters: UserFilters) {
  await connectDB();

  const page = filters.page || 1;
  const limit = Math.min(filters.limit || 25, 100); // Max 100 per page
  const search = filters.search || "";
  const subscriptionStatus = filters.subscriptionStatus || "";
  const autoRenew = filters.autoRenew || "";
  const membershipPackage = filters.membershipPackage || "";
  const role = filters.role || "";
  const dateFrom = filters.dateFrom;
  const dateTo = filters.dateTo;
  const sortBy = filters.sortBy || "createdAt";
  const sortOrder = filters.sortOrder || "desc";

  // Build filter query
  const filter: Record<string, unknown> = {};

  // Search filter (email or name)
  const searchOrConditions: Array<Record<string, unknown>> = [];
  if (search) {
    searchOrConditions.push(
      { email: { $regex: search, $options: "i" } },
      { firstName: { $regex: search, $options: "i" } },
      { lastName: { $regex: search, $options: "i" } }
    );
  }

  // Build subscription status filter conditions separately
  const subscriptionStatusFilter: Record<string, unknown> = {};
  const subscriptionOrConditions: Array<Record<string, unknown>> = [];
  if (subscriptionStatus) {
    switch (subscriptionStatus) {
      case "active":
        subscriptionStatusFilter["subscription.isActive"] = true;
        subscriptionStatusFilter["subscription.status"] = "active";
        break;
      case "past_due":
        subscriptionStatusFilter["subscription.status"] = "past_due";
        break;
      case "none":
        subscriptionOrConditions.push(
          { subscription: { $exists: false } },
          { subscription: null },
          { "subscription.status": { $in: ["incomplete", "cancelled", "canceled"] } },
          { "subscription.isActive": { $ne: true } }
        );
        break;
    }
  }

  // Build autoRenew filter conditions separately
  const autoRenewFilter: Record<string, unknown> = {};
  if (autoRenew !== undefined && autoRenew !== "") {
      if (autoRenew === "true") {
        // Users who WILL renew:
        // - Status is "active" OR "past_due" (past_due users can still renew if not cancelled)
        //   Note: past_due users may have isActive = false due to payment failures, but they haven't cancelled
        //   EXCLUDE "incomplete" status (users who just registered but haven't purchased)
        // - autoRenew is not false (true or undefined)
        // - No endDate set OR endDate is null (meaning they haven't cancelled at period end)
        // - Must have a packageId (actually purchased a subscription, not just registered)
        // - Must have lastMonthAccumulatedEntries > 0 (have actually accumulated entries, been active subscribers)
        // We DON'T filter by isActive because:
        //   - past_due users may have isActive = false (payment issue, not cancellation)
        //   - The key indicator of "will renew" is: no endDate (haven't cancelled) + autoRenew !== false + has packageId + has accumulated entries
        autoRenewFilter["subscription.status"] = { $in: ["active", "past_due"] };
        autoRenewFilter["subscription.autoRenew"] = { $ne: false };
        autoRenewFilter["subscription.packageId"] = { $exists: true, $ne: null };
        autoRenewFilter["subscription.lastMonthAccumulatedEntries"] = { $gt: 0 };
        // endDate should not exist or be null
        // We'll handle this in the $and combination
    } else if (autoRenew === "false") {
      // Users who are CANCELLED (won't renew):
      // - Status is "active" OR "past_due" (not cancelled status)
      // - Has endDate set (meaning they cancelled at period end)
      // These are users who cancelled but are still in their billing period
      autoRenewFilter["subscription.status"] = { $in: ["active", "past_due"] };
      autoRenewFilter["subscription.endDate"] = { $exists: true, $ne: null };
    }
  }

  // Combine subscription status and autoRenew filters with AND
  // Build an array of filter conditions to combine
  const filterConditions: Array<Record<string, unknown>> = [];
  const endDateOrConditions: Array<Record<string, unknown>> = [];

  // Add subscription status filter (if it's not using $or)
  if (Object.keys(subscriptionStatusFilter).length > 0) {
    filterConditions.push(subscriptionStatusFilter);
  }

  // Add autoRenew filter (if present)
  if (Object.keys(autoRenewFilter).length > 0) {
    // For "Will Renew", we need to handle endDate separately with $or
    if (autoRenew === "true") {
      // Extract endDate condition and add to $or conditions
      endDateOrConditions.push(
        { "subscription.endDate": { $exists: false } },
        { "subscription.endDate": null }
      );
      // Remove endDate from autoRenewFilter since we'll handle it separately
      const { "subscription.endDate": _endDate, ...restAutoRenew } = autoRenewFilter;
      filterConditions.push(restAutoRenew);
    } else {
      filterConditions.push(autoRenewFilter);
    }
  }

  // If we have multiple filter conditions, combine them with $and
  // Need to handle conflicts properly by intersecting conditions
  if (filterConditions.length > 1) {
    const combinedFilter: Record<string, unknown> = {};
    
    // Merge conditions, handling conflicts intelligently
    for (const condition of filterConditions) {
      for (const [key, value] of Object.entries(condition)) {
        if (combinedFilter[key] === undefined) {
          // No conflict, just add it
          combinedFilter[key] = value;
        } else {
          // Conflict - need to intersect
          const existingValue = combinedFilter[key];
          
          // Handle subscription.status conflicts specifically
          if (key === "subscription.status") {
            if (typeof existingValue === "string" && typeof value === "string" && value !== null) {
              // Both are strings - must match exactly
              if (existingValue !== value) {
                // Conflict - no results (can't be both)
                combinedFilter[key] = { $in: [] }; // Empty array = no matches
              }
            } else if (typeof existingValue === "string" && typeof value === "object" && value !== null && "$in" in value) {
              // Existing is string, new is $in array - check if string is in array
              const inArray = (value as { $in: string[] }).$in;
              if (inArray.includes(existingValue)) {
                combinedFilter[key] = existingValue; // Keep the more specific string
              } else {
                combinedFilter[key] = { $in: [] }; // No intersection
              }
            } else if (typeof existingValue === "object" && existingValue !== null && "$in" in existingValue && typeof value === "string" && value !== null) {
              // Existing is $in array, new is string - check if string is in array
              const inArray = (existingValue as { $in: string[] }).$in;
              if (inArray.includes(value)) {
                combinedFilter[key] = value; // Keep the more specific string
              } else {
                combinedFilter[key] = { $in: [] }; // No intersection
              }
            } else if (typeof existingValue === "object" && existingValue !== null && "$in" in existingValue && typeof value === "object" && value !== null && "$in" in value) {
              // Both are $in arrays - intersect them
              const existingArray = (existingValue as { $in: string[] }).$in;
              const newArray = (value as { $in: string[] }).$in;
              const intersection = existingArray.filter((item) => newArray.includes(item));
              combinedFilter[key] = { $in: intersection };
            } else if (typeof existingValue === "object" && existingValue !== null && "$nin" in existingValue) {
              // Existing is $nin, new is something else - complex, use $and
              if (!filter.$and) filter.$and = [];
              (filter.$and as Array<Record<string, unknown>>).push({ [key]: existingValue });
              combinedFilter[key] = value;
            } else {
              // Other conflicts - last one wins (but this shouldn't happen for status)
              combinedFilter[key] = value;
            }
            } else if (key === "subscription.isActive") {
              // For boolean conflicts, both must match
              if (existingValue !== value) {
                // Conflict - incompatible filters (e.g., "inactive" + "will renew")
                // Set to empty result - can't be both true and false
                combinedFilter[key] = { $in: [] }; // This will result in no matches
              }
            } else {
              // For other properties, last one wins
              combinedFilter[key] = value;
            }
        }
      }
    }
    
    // Apply the combined filter
    Object.assign(filter, combinedFilter);
  } else if (filterConditions.length === 1) {
    // Single condition, apply directly
    Object.assign(filter, filterConditions[0]);
  }

  // Add endDate $or condition if needed (for "Will Renew")
  if (endDateOrConditions.length > 0) {
    // If we have direct filter properties, we need to combine with $and
    const hasDirectFilters = Object.keys(filter).some(
      (key) => key !== "$and" && !key.startsWith("$")
    );

    if (hasDirectFilters) {
      // Need to use $and to combine direct filters with endDate condition
      if (!filter.$and) {
        filter.$and = [];
      }
      (filter.$and as Array<Record<string, unknown>>).push({ $or: endDateOrConditions });
    } else {
      // No direct filters, can add endDate condition directly or to existing $and
      if (filter.$and) {
        (filter.$and as Array<Record<string, unknown>>).push({ $or: endDateOrConditions });
      } else {
        // Only endDate condition, set it directly
        filter.$or = endDateOrConditions;
      }
    }
  }

  // Combine search and subscription "none" filters (which use $or)
  const allOrConditions: Array<Record<string, unknown>> = [];
  if (searchOrConditions.length > 0) {
    allOrConditions.push({ $or: searchOrConditions });
  }
  if (subscriptionOrConditions.length > 0) {
    allOrConditions.push({ $or: subscriptionOrConditions });
  }

  // Combine $or conditions with existing filter conditions using $and
  if (allOrConditions.length > 0) {
    // If we have direct filter properties, we need to combine with $and
    const hasDirectFilters = Object.keys(filter).some(
      (key) => key !== "$and" && !key.startsWith("$")
    );

    if (hasDirectFilters || allOrConditions.length > 1) {
      // Need to use $and to combine
      if (!filter.$and) {
        filter.$and = [];
      }
      (filter.$and as Array<Record<string, unknown>>).push(...allOrConditions);
    } else {
      // Only $or conditions, can set directly
      if (allOrConditions.length === 1) {
        Object.assign(filter, allOrConditions[0]);
      } else {
        filter.$and = allOrConditions;
      }
    }
  }

  // Role filter
  if (role) {
    filter.role = role;
  }

  // Date range filter
  if (dateFrom || dateTo) {
    (filter as { createdAt?: { $gte?: Date; $lte?: Date } }).createdAt = {};
    if (dateFrom) {
      (filter as { createdAt: { $gte: Date } }).createdAt.$gte = new Date(dateFrom);
    }
    if (dateTo) {
      (filter as { createdAt: { $lte: Date } }).createdAt.$lte = new Date(dateTo);
    }
  }

  // Membership package filter (filter by subscription packageId)
  // The membershipPackage param contains the package name, we need to find matching packageIds
  if (membershipPackage) {
    // Find all packages that match the name (case-insensitive)
    const { membershipPackages } = await import("@/data/membershipPackages");
    const matchingPackages = membershipPackages.filter(
      (pkg) =>
        pkg.isActive && pkg.type === "subscription" && pkg.name.toLowerCase().includes(membershipPackage.toLowerCase())
    );
    const matchingPackageIds = matchingPackages.map((pkg) => pkg._id);

    if (matchingPackageIds.length > 0) {
      filter["subscription.packageId"] = { $in: matchingPackageIds };
    } else {
      // If no matching packages found, return empty result
      filter["subscription.packageId"] = { $in: [] };
    }
  }

  // For computed fields (totalSpent, majorDrawEntries, miniDrawCount), we need to:
  // 1. Fetch ALL matching users (not paginated)
  // 2. Calculate computed fields
  // 3. Sort by computed field
  // 4. Then apply pagination
  const isComputedFieldSort = ["totalSpent", "majorDrawEntries", "miniDrawCount"].includes(sortBy);

  let users: unknown[];
  let totalCount: number;

  if (isComputedFieldSort) {
    // Fetch ALL matching users for computed field sorting
    users = await User.find(filter).select("-password -emailVerificationToken -passwordResetToken -smsOtpCode").lean();
    totalCount = users.length;
  } else {
    // For database-sortable fields, use MongoDB sorting and pagination
    const sort: Record<string, 1 | -1> = {};
    sort[sortBy] = sortOrder === "asc" ? 1 : -1;

    const skip = (page - 1) * limit;

    [users, totalCount] = await Promise.all([
      User.find(filter)
        .select("-password -emailVerificationToken -passwordResetToken -smsOtpCode")
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);
  }

  // Get user IDs for additional data fetching
  const userIds = (users as Array<{ _id: { toString: () => string } }>).map((user) => user._id.toString());

  // Fetch total spent for each user from PaymentEvent
  const paymentEvents = await PaymentEvent.find({
    userId: { $in: userIds },
    eventType: "BenefitsGranted",
  }).lean();

  // Calculate total spent per user
  const userSpentMap = new Map<string, number>();
  paymentEvents.forEach((event) => {
    const userId = event.userId.toString();
    const currentSpent = userSpentMap.get(userId) || 0;
    userSpentMap.set(userId, currentSpent + (event.data?.price || 0));
  });

  // Get current major draw entries for each user
  const currentMajorDraw = await MajorDraw.findOne({ status: "active" }).lean();
  const userEntriesMap = new Map<string, number>();

  if (currentMajorDraw) {
    currentMajorDraw.entries?.forEach(
      (entry: { userId: { toString: () => string }; totalEntries?: number; quantity?: number }) => {
        const userId = entry.userId.toString();
        const currentEntries = userEntriesMap.get(userId) || 0;
        // Use totalEntries if available, otherwise fall back to quantity
        const entryCount = entry.totalEntries || entry.quantity || 0;
        userEntriesMap.set(userId, currentEntries + entryCount);
      }
    );
  }

  // Calculate stats from all users (not just paginated)
  // Conversions = users who have made at least one purchase (subscription OR one-time package OR mini-draw package)
  const [totalUsers, activeSubscriptionsCount, verifiedUsersCount, convertedUsersCount] = await Promise.all([
    User.countDocuments({ isActive: true }),
    User.countDocuments({ "subscription.isActive": true, isActive: true }),
    User.countDocuments({ isEmailVerified: true, isActive: true }),
    User.countDocuments({
      $or: [
        { "subscription.isActive": true },
        { oneTimePackages: { $exists: true, $not: { $size: 0 } } },
        { miniDrawPackages: { $exists: true, $not: { $size: 0 } } },
      ],
      isActive: true,
    }),
  ]);

  // Transform users data with computed fields and map packageId to packageName
  const usersWithStats = (
    users as Array<{
      _id: { toString: () => string };
      firstName: string;
      lastName: string;
      email: string;
      mobile?: string;
      state?: string;
      role: string;
      isActive: boolean;
      isEmailVerified: boolean;
      isMobileVerified?: boolean;
      profileSetupCompleted?: boolean;
      createdAt: Date;
      lastLogin?: Date;
      subscription?: {
        packageId: string;
        isActive: boolean;
        startDate: Date;
        endDate?: Date;
        status?: string;
      };
      miniDrawParticipation?: Array<{ isActive?: boolean }>;
      rewardsPoints?: number;
      accumulatedEntries?: number;
    }>
  ).map((user) => {
    const userId = user._id.toString();
    const totalSpent = userSpentMap.get(userId) || 0;
    const currentDrawEntries = userEntriesMap.get(userId) || 0;
    // Show current draw entries only (not accumulated)
    const majorDrawEntries = currentDrawEntries;

    // Count mini draws user is participating in
    const miniDrawCount = (user.miniDrawParticipation || []).filter(
      (p: { isActive?: boolean }) => p.isActive !== false
    ).length;

    // Map packageId to packageName using membershipPackages data
    let packageName: string | null = null;
    if (user.subscription?.packageId) {
      const packageData = getPackageById(user.subscription.packageId.toString());
      packageName = packageData?.name || null;
    }

    return {
      id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      mobile: user.mobile,
      state: user.state,
      role: user.role,
      isActive: user.isActive,
      isEmailVerified: user.isEmailVerified,
      isMobileVerified: user.isMobileVerified,
      profileSetupCompleted: user.profileSetupCompleted,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin,
      subscription:
        user.subscription && user.subscription.packageId
          ? {
              packageId: user.subscription.packageId.toString(),
              packageName: packageName, // Mapped from packageId
              isActive: user.subscription.isActive,
              startDate: user.subscription.startDate,
              endDate: user.subscription.endDate,
              status: user.subscription.status,
            }
          : null,
      totalSpent,
      majorDrawEntries,
      miniDrawCount,
      rewardsPoints: user.rewardsPoints || 0,
      accumulatedEntries: user.accumulatedEntries || 0,
    };
  });

  // Handle sorting for computed fields (must happen before pagination)
  if (isComputedFieldSort) {
    if (sortBy === "totalSpent") {
      usersWithStats.sort((a, b) => {
        return sortOrder === "asc" ? a.totalSpent - b.totalSpent : b.totalSpent - a.totalSpent;
      });
    } else if (sortBy === "majorDrawEntries") {
      usersWithStats.sort((a, b) => {
        return sortOrder === "asc" ? a.majorDrawEntries - b.majorDrawEntries : b.majorDrawEntries - a.majorDrawEntries;
      });
    } else if (sortBy === "miniDrawCount") {
      usersWithStats.sort((a, b) => {
        const aCount = a.miniDrawCount || 0;
        const bCount = b.miniDrawCount || 0;
        return sortOrder === "asc" ? aCount - bCount : bCount - aCount;
      });
    }

    // Apply pagination AFTER sorting
    const skip = (page - 1) * limit;
    const paginatedUsers = usersWithStats.slice(skip, skip + limit);

    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    return {
      users: paginatedUsers,
      stats: {
        totalUsers,
        activeSubscriptions: activeSubscriptionsCount,
        verifiedUsers: verifiedUsersCount,
        conversions: convertedUsersCount,
      },
      pagination: {
        currentPage: page,
        totalPages,
        totalCount,
        limit,
        hasNextPage,
        hasPrevPage,
      },
    };
  }

  // For non-computed fields, pagination was already applied
  const totalPages = Math.ceil(totalCount / limit);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  return {
    users: usersWithStats,
    stats: {
      totalUsers,
      activeSubscriptions: activeSubscriptionsCount,
      verifiedUsers: verifiedUsersCount,
      conversions: convertedUsersCount,
    },
    pagination: {
      currentPage: page,
      totalPages,
      totalCount,
      limit,
      hasNextPage,
      hasPrevPage,
    },
  };
}

/**
 * Search users by query term with optional major draw filter
 */
export async function searchUsers(params: { q: string; page: number; limit: number; majorDrawId?: string }) {
  await connectDB();

  const { q, page, limit, majorDrawId } = params;

  // Build search query with fuzzy matching
  const searchQuery: Record<string, unknown> = {};

  if (q.trim()) {
    // Support searching by:
    // 1. User ID (exact match)
    // 2. Email (partial match)
    // 3. Mobile (partial match)
    // 4. First name + Last name (partial match)
    // 5. Full name combination (partial match)

    const searchTerm = q.trim();

    // Check if it's a valid MongoDB ObjectId (24 character hex string)
    const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(searchTerm);

    if (isValidObjectId) {
      // Exact ID search
      searchQuery._id = searchTerm;
    } else {
      // Text-based search with fuzzy matching
      searchQuery.$or = [
        { email: { $regex: searchTerm, $options: "i" } },
        { mobile: { $regex: searchTerm, $options: "i" } },
        { firstName: { $regex: searchTerm, $options: "i" } },
        { lastName: { $regex: searchTerm, $options: "i" } },
        // Full name search (firstName + lastName)
        {
          $expr: {
            $regexMatch: {
              input: { $concat: ["$firstName", " ", "$lastName"] },
              regex: searchTerm,
              options: "i",
            },
          },
        },
      ];
    }
  }

  // If majorDrawId is provided, filter to only show participants
  let participantUserIds: string[] = [];
  if (majorDrawId) {
    const majorDraw = await MajorDraw.findById(majorDrawId);
    if (majorDraw && majorDraw.entries) {
      participantUserIds = majorDraw.entries.map((entry: { userId: { toString: () => string } }) =>
        entry.userId.toString()
      );
    }

    // If no participants found, return empty result
    if (participantUserIds.length === 0) {
      return {
        users: [],
        pagination: {
          currentPage: page,
          totalPages: 0,
          totalCount: 0,
          hasNextPage: false,
          hasPrevPage: false,
          limit,
        },
        searchInfo: {
          query: q,
          resultsFound: 0,
          currentDraw: null,
        },
      };
    }

    // Add participant filter to search query
    searchQuery._id = { $in: participantUserIds };
  }

  // Calculate pagination
  const skip = (page - 1) * limit;

  // Execute search with pagination
  const [users, totalCount] = await Promise.all([
    User.find(searchQuery)
      .select("firstName lastName email mobile state role isActive createdAt lastLogin")
      .sort({ createdAt: -1 }) // Most recent users first
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(searchQuery),
  ]);

  // Get major draw for entry information
  let targetMajorDraw = null;
  if (majorDrawId) {
    // Use the specific major draw if provided
    targetMajorDraw = await MajorDraw.findById(majorDrawId);
  } else {
    // Otherwise use current active/frozen major draw
    targetMajorDraw = await MajorDraw.findOne({
      status: { $in: ["active", "frozen"] },
    }).sort({ activationDate: -1 });
  }

  // Enhance user data with major draw entry information
  const enhancedUsers = await Promise.all(
    users.map(async (user) => {
      let currentDrawEntries = null;

      if (targetMajorDraw) {
        // Find user's entries in the target major draw
        const userEntry = targetMajorDraw.entries.find(
          (entry: { userId: { toString: () => string } }) => entry.userId.toString() === user._id.toString()
        );

        if (userEntry) {
          currentDrawEntries = {
            totalEntries: userEntry.totalEntries,
            entriesBySource: userEntry.entriesBySource,
          };
        }
      }

      return {
        _id: user._id.toString(),
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        mobile: user.mobile,
        state: user.state,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
        currentDrawEntries: currentDrawEntries || undefined,
      };
    })
  );

  // Calculate pagination info
  const totalPages = Math.ceil(totalCount / limit);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  return {
    users: enhancedUsers,
    pagination: {
      currentPage: page,
      totalPages,
      totalCount,
      hasNextPage,
      hasPrevPage,
      limit,
    },
    searchInfo: {
      query: q,
      resultsFound: totalCount,
      currentDraw: targetMajorDraw
        ? {
            id: targetMajorDraw._id.toString(),
            name: targetMajorDraw.name,
            status: targetMajorDraw.status,
          }
        : null,
    },
  };
}
