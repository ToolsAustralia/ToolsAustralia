/**
 * User Filter Builder Utility
 * 
 * Centralized filter building logic for user queries.
 * Ensures consistency between list and export endpoints.
 * 
 * This utility extracts the filter building logic from the users API route,
 * providing a single source of truth for all user filtering.
 */

import mongoose from "mongoose";
import MajorDraw from "@/models/MajorDraw";

// UserFilters type is available but not directly imported here to avoid circular dependencies

const AU_STATE_CODES = new Set(["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"]);

/** Canonical id for the "top 20% of active major-draw entry holders" segment. */
export const TOP20_MAJOR_DRAW_SEGMENT = "top20MajorDraw";

export interface Top20MajorDrawSegment {
  /** User ids in the segment, highest entry count FIRST. Callers that page must keep this order. */
  userIds: string[];
  /** Entry count at the 20% cut. Everyone at or above it is in — see the tie note below. */
  thresholdCount: number;
  /** Everyone holding at least one entry in the active draw (the population the 20% is of). */
  totalHolders: number;
}

/**
 * Resolve the top 20% of entry holders in the ACTIVE major draw.
 *
 * Returns `null` when there is no active draw, or the active draw has no entries — the caller
 * decides whether that is a 404 (the export route) or an empty result (the list filter and the
 * Norm aggregate).
 *
 * SINGLE SOURCE OF TRUTH. This logic previously existed in three hand-copied places (the admin
 * export route, `aggregateUserExport` for Norm, and — as of this change — the list filter), and
 * the copies had ALREADY drifted: one used `entryCounts[takeCount - 1]!.count` and the other
 * `?.count ?? 0`. Two features both labelled "top 20%" returning different user sets is the kind
 * of bug nobody reports, because each looks plausible alone.
 *
 * TIES ARE INCLUDED, so the segment can exceed 20% of holders. With 100 holders the cut is the
 * 20th-highest count; if 15 people are tied on that count the segment returns 34, not 20.
 * Deliberate — excluding half a tied group is arbitrary, and the alternative (cut at exactly 20)
 * makes membership depend on Mongo's document order, which is not stable.
 */
export async function resolveTop20MajorDrawSegment(): Promise<Top20MajorDrawSegment | null> {
  const activeDraw = await MajorDraw.findOne({ status: "active" }).select("entries").lean();
  if (!activeDraw?.entries || activeDraw.entries.length === 0) return null;

  // Sum per user: one holder can appear as several entry rows.
  const countMap = new Map<string, number>();
  for (const entry of activeDraw.entries as Array<{
    userId: mongoose.Types.ObjectId | string;
    totalEntries?: number;
    quantity?: number;
  }>) {
    const uid = typeof entry.userId === "string" ? entry.userId : entry.userId.toString();
    const count = entry.totalEntries || entry.quantity || 0;
    if (count > 0) countMap.set(uid, (countMap.get(uid) || 0) + count);
  }
  if (countMap.size === 0) return null;

  const entryCounts = Array.from(countMap.entries()).map(([uid, count]) => ({ uid, count }));
  entryCounts.sort((a, b) => b.count - a.count);

  // `Math.max(1, ...)` so a tiny draw still yields the single top holder rather than an empty
  // segment; `entryCounts` is non-empty here, so the index read below always hits.
  const takeCount = Math.max(1, Math.ceil(entryCounts.length * 0.2));
  const thresholdCount = entryCounts[takeCount - 1]!.count;

  return {
    userIds: entryCounts.filter((e) => e.count >= thresholdCount).map((e) => e.uid),
    thresholdCount,
    totalHolders: entryCounts.length,
  };
}

/**
 * Stripe subscription statuses that count as a current paying/entitled membership for admin metrics
 * (includes trial: same access and renewal semantics as the rest of the app).
 */
export const ACTIVE_SUBSCRIPTION_STATUSES = ["active", "trialing"] as const;

/**
 * Subscribed states used for "will renew" / "scheduled cancel" / churn-style admin filters
 * (active + trialing + payment-problem but not yet ended).
 */
export const SUBSCRIBED_SUBSCRIPTION_STATUSES = ["active", "trialing", "past_due"] as const;

/**
 * Get filter for true active subscriptions (subscriptions that will auto-renew)
 *
 * This matches the projected income calculation logic:
 * - subscription.isActive: true
 * - subscription.status: `active` or `trialing` (Stripe trialing = entitled until trial end)
 * - subscription.autoRenew: { $ne: false } (only count if autoRenew is true or undefined, default is true)
 * - isActive: true (user account is active)
 *
 * @param includeUserActive - Whether to include isActive: true check for user account (default: true)
 * @returns MongoDB filter object for active subscriptions that will auto-renew
 */
export function getActiveSubscriptionFilter(includeUserActive: boolean = true): Record<string, unknown> {
  const filter: Record<string, unknown> = {
    "subscription.isActive": true,
    "subscription.autoRenew": { $ne: false }, // Only count if autoRenew is true or undefined (default is true)
    "subscription.status": { $in: [...ACTIVE_SUBSCRIPTION_STATUSES] },
  };

  if (includeUserActive) {
    filter.isActive = true; // Ensure user account is active
  }

  return filter;
}

/**
 * Get filter for subscription-only queries (used in $or clauses)
 * 
 * This is similar to getActiveSubscriptionFilter but without the isActive check,
 * useful when combining with other conditions in $or clauses.
 * 
 * @returns MongoDB filter object for subscription part only (no user isActive check)
 */
export function getActiveSubscriptionSubFilter(): Record<string, unknown> {
  return getActiveSubscriptionFilter(false);
}

/**
 * Get filter for users who have processed payments (conversion metric).
 * Source of truth: User.processedPayments - only users with at least one processed payment are converted.
 *
 * @param includeUserActive - Include isActive: true (default true)
 * @returns MongoDB filter for converted users
 */
export function getEverPaidUserFilter(includeUserActive = true): Record<string, unknown> {
  const filter: Record<string, unknown> = {
    processedPayments: { $exists: true, $not: { $size: 0 } },
  };
  return includeUserActive ? { ...filter, isActive: true } : filter;
}

/**
 * Builds a MongoDB filter object from UserFilters parameters
 * 
 * @param filters - User filter parameters from the request
 * @param membershipPackages - Optional pre-fetched membership packages for package filtering
 * @returns Promise resolving to a MongoDB filter object
 */
export async function buildUserFilter(
  filters: {
    search?: string;
    subscriptionStatus?: string;
    autoRenew?: string;
    membershipPackage?: string;
    role?: string;
    dateFrom?: string;
    dateTo?: string;
    /** Single state (optional; prefer `states` from repeated query params) */
    state?: string;
    /** Australian state codes; matched with $in when more than one */
    states?: string[];
    /** "yes" = has entries in active major draw; "no" = not in that set */
    inActiveMajorDraw?: string;
    /** Membership Streak: "none" = streak 0/absent; a number string = at least N consecutive paid renewals */
    streak?: string;
    /**
     * Named cohort, currently only `top20MajorDraw`. Composes WITH the other filters rather than
     * replacing them (unlike the export route's segment branch, which ignores filters), so
     * "top 20% in VIC" is a valid query.
     */
    segment?: string;
  }
): Promise<Record<string, unknown>> {
  const {
    search,
    subscriptionStatus,
    autoRenew,
    membershipPackage,
    role,
    dateFrom,
    dateTo,
    state,
    states,
    inActiveMajorDraw,
    streak,
    segment,
  } = filters;

  // Initialize filter object
  const filter: Record<string, unknown> = {};

  // Build search filter (email, first name, last name, or full name)
  const searchOrConditions: Array<Record<string, unknown>> = [];
  if (search) {
    const normalizedSearch = search.trim();
    if (normalizedSearch) {
      searchOrConditions.push(
        { email: { $regex: normalizedSearch, $options: "i" } },
        { firstName: { $regex: normalizedSearch, $options: "i" } },
        { lastName: { $regex: normalizedSearch, $options: "i" } },
        // Full name search (firstName + lastName) - handles "frank polak"
        {
          $expr: {
            $regexMatch: {
              input: { $concat: ["$firstName", " ", "$lastName"] },
              regex: normalizedSearch,
              options: "i",
            },
          },
        }
      );
    }
  }

  // Build subscription status filter conditions separately
  const subscriptionStatusFilter: Record<string, unknown> = {};
  const subscriptionOrConditions: Array<Record<string, unknown>> = [];
  if (subscriptionStatus) {
    switch (subscriptionStatus) {
      case "active":
        // Use reusable filter function for consistency
        Object.assign(subscriptionStatusFilter, getActiveSubscriptionFilter());
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
      // - Status is "active", "trialing", OR "past_due" (past_due users can still renew if not cancelled)
      //   Note: past_due users may have isActive = false due to payment failures, but they haven't cancelled
      //   EXCLUDE "incomplete" status (users who just registered but haven't purchased)
      // - autoRenew is not false (true or undefined)
      // - endDate not set, null, OR endDate > now (active subs have endDate = current period end; only cancelled have autoRenew false)
      // - Must have a packageId (actually purchased a subscription, not just registered)
      // - Must have lastMonthAccumulatedEntries > 0 (have actually accumulated entries, been active subscribers)
      // We DON'T filter by isActive because:
      //   - past_due users may have isActive = false (payment issue, not cancellation)
      //   - The key indicator of "will renew" is: autoRenew !== false + (endDate not set / null / in future) + has packageId + has accumulated entries
      autoRenewFilter["subscription.status"] = { $in: [...SUBSCRIBED_SUBSCRIPTION_STATUSES] };
      autoRenewFilter["subscription.autoRenew"] = { $ne: false };
      autoRenewFilter["subscription.packageId"] = { $exists: true, $ne: null };
      autoRenewFilter["subscription.lastMonthAccumulatedEntries"] = { $gt: 0 };
      // endDate should not exist or be null
      // We'll handle this in the $and combination
    } else if (autoRenew === "false") {
      // Users who are CANCELLED (won't renew):
      // - Status is "active", "trialing", OR "past_due" (not ended yet)
      // - autoRenew is false (cancelled at period end)
      // - Has endDate set (period end when access ends)
      autoRenewFilter["subscription.status"] = { $in: [...SUBSCRIBED_SUBSCRIPTION_STATUSES] };
      autoRenewFilter["subscription.autoRenew"] = false;
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
      // Will Renew: endDate not set, null, or in the future (current period end is set for all active subs)
      endDateOrConditions.push(
        { "subscription.endDate": { $exists: false } },
        { "subscription.endDate": null },
        { "subscription.endDate": { $gt: new Date() } }
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (filter as any).createdAt = {};
    if (dateFrom) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (filter as any).createdAt.$gte = new Date(dateFrom);
    }
    if (dateTo) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (filter as any).createdAt.$lte = new Date(dateTo);
    }
  }

  // Membership package filter (filter by subscription packageId)
  // The membershipPackage param contains the package name, we need to find matching packageIds
  if (membershipPackage) {
    // Find all packages that match the name (case-insensitive)
    const { membershipPackages } = await import("@/data/membershipPackages");
    const matchingPackages = membershipPackages.filter(
      (pkg) =>
        pkg.isActive &&
        pkg.type === "subscription" &&
        pkg.name.toLowerCase().includes(membershipPackage.toLowerCase())
    );
    const matchingPackageIds = matchingPackages.map((pkg) => pkg._id);

    if (matchingPackageIds.length > 0) {
      filter["subscription.packageId"] = { $in: matchingPackageIds };
    } else {
      // If no matching packages found, return empty result
      filter["subscription.packageId"] = { $in: [] };
    }
  }

  const stateCodesInput = [
    ...(states ?? []),
    ...(state !== undefined && state !== null && String(state).trim() !== "" ? [String(state).trim()] : []),
  ];
  const validStateCodes = [
    ...new Set(
      stateCodesInput.map((c) => c.toUpperCase()).filter((c) => AU_STATE_CODES.has(c))
    ),
  ];
  if (validStateCodes.length === 1) {
    filter.state = validStateCodes[0];
  } else if (validStateCodes.length > 1) {
    filter.state = { $in: validStateCodes };
  } else if (stateCodesInput.length > 0) {
    // Request included unknown state value(s) — no matches
    filter.state = { $in: [] };
  }

  if (inActiveMajorDraw === "yes" || inActiveMajorDraw === "no") {
    const activeDraw = await MajorDraw.findOne({ status: "active" }).select("entries").lean();
    const withEntries = (activeDraw?.entries ?? []).filter(
      (e: { totalEntries?: number; quantity?: number }) => (e.totalEntries ?? e.quantity ?? 0) > 0
    );
    const entryUserIds = withEntries.map((e: { userId: mongoose.Types.ObjectId | string }) =>
      typeof e.userId === "string" ? e.userId : e.userId.toString()
    );
    const oidList = entryUserIds.map((id: string) => new mongoose.Types.ObjectId(id));

    if (inActiveMajorDraw === "yes") {
      if (oidList.length === 0) {
        if (!filter.$and) filter.$and = [];
        (filter.$and as Array<Record<string, unknown>>).push({ _id: { $in: [] } });
      } else {
        if (!filter.$and) filter.$and = [];
        (filter.$and as Array<Record<string, unknown>>).push({ _id: { $in: oidList } });
      }
    } else if (oidList.length > 0) {
      if (!filter.$and) filter.$and = [];
      (filter.$and as Array<Record<string, unknown>>).push({ _id: { $nin: oidList } });
    }
  }

  // Top 20% of active major-draw entry holders. Pushed onto `$and` like every other `_id`
  // constraint above, so it INTERSECTS with search / state / package rather than replacing them.
  // An empty `$in` when there is no active draw is deliberate: the filter is on, so it must
  // return nothing rather than silently falling back to "all users", which would look like the
  // filter had been ignored.
  if (segment === TOP20_MAJOR_DRAW_SEGMENT) {
    const top20 = await resolveTop20MajorDrawSegment();
    const oidList = (top20?.userIds ?? []).map((id) => new mongoose.Types.ObjectId(id));
    if (!filter.$and) filter.$and = [];
    (filter.$and as Array<Record<string, unknown>>).push({ _id: { $in: oidList } });
  }

  // Membership Streak filter: "none" = no streak banked (field missing or 0);
  // a numeric value = at least N consecutive paid renewals (subscription.streakMonths).
  // Unknown values are ignored (no-op) rather than matching nothing.
  if (streak !== undefined && streak !== null && String(streak).trim() !== "") {
    if (streak === "none") {
      if (!filter.$and) filter.$and = [];
      (filter.$and as Array<Record<string, unknown>>).push({
        $or: [
          { "subscription.streakMonths": { $exists: false } },
          { "subscription.streakMonths": { $lte: 0 } },
        ],
      });
    } else {
      const minStreak = parseInt(String(streak), 10);
      if (Number.isFinite(minStreak) && minStreak > 0) {
        filter["subscription.streakMonths"] = { $gte: minStreak };
      }
    }
  }

  return filter;
}

