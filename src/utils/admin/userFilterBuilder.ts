/**
 * User Filter Builder Utility
 * 
 * Centralized filter building logic for user queries.
 * Ensures consistency between list and export endpoints.
 * 
 * This utility extracts the filter building logic from the users API route,
 * providing a single source of truth for all user filtering.
 */

// UserFilters type is available but not directly imported here to avoid circular dependencies

/**
 * Get filter for true active subscriptions (subscriptions that will auto-renew)
 * 
 * This matches the projected income calculation logic:
 * - subscription.isActive: true
 * - subscription.status: "active"
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
    "subscription.status": "active",
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
 * Get filter for users who have EVER made a purchase (conversion metric).
 * Counts: subscription (any paid state), one-time packages, mini-draw packages, upsells.
 * Use for conversion rate = % of signups who ever paid.
 *
 * @param includeUserActive - Include isActive: true (default true)
 * @returns MongoDB filter for $or clause or standalone query
 */
export function getEverPaidUserFilter(includeUserActive = true): Record<string, unknown> {
  const orFilter: Record<string, unknown> = {
    $or: [
      // Must exclude "" - registration sets packageId: "" for users who never paid
      { "subscription.packageId": { $exists: true, $nin: [null, ""] } },
      { oneTimePackages: { $exists: true, $not: { $size: 0 } } },
      { miniDrawPackages: { $exists: true, $not: { $size: 0 } } },
      { upsellPurchases: { $exists: true, $not: { $size: 0 } } },
    ],
  };
  return includeUserActive ? { ...orFilter, isActive: true } : orFilter;
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
  }
): Promise<Record<string, unknown>> {
  const { search, subscriptionStatus, autoRenew, membershipPackage, role, dateFrom, dateTo } = filters;

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
      // - Status is "active" OR "past_due" (past_due users can still renew if not cancelled)
      //   Note: past_due users may have isActive = false due to payment failures, but they haven't cancelled
      //   EXCLUDE "incomplete" status (users who just registered but haven't purchased)
      // - autoRenew is not false (true or undefined)
      // - endDate not set, null, OR endDate > now (active subs have endDate = current period end; only cancelled have autoRenew false)
      // - Must have a packageId (actually purchased a subscription, not just registered)
      // - Must have lastMonthAccumulatedEntries > 0 (have actually accumulated entries, been active subscribers)
      // We DON'T filter by isActive because:
      //   - past_due users may have isActive = false (payment issue, not cancellation)
      //   - The key indicator of "will renew" is: autoRenew !== false + (endDate not set / null / in future) + has packageId + has accumulated entries
      autoRenewFilter["subscription.status"] = { $in: ["active", "past_due"] };
      autoRenewFilter["subscription.autoRenew"] = { $ne: false };
      autoRenewFilter["subscription.packageId"] = { $exists: true, $ne: null };
      autoRenewFilter["subscription.lastMonthAccumulatedEntries"] = { $gt: 0 };
      // endDate should not exist or be null
      // We'll handle this in the $and combination
    } else if (autoRenew === "false") {
      // Users who are CANCELLED (won't renew):
      // - Status is "active" OR "past_due" (not cancelled status)
      // - autoRenew is false (cancelled at period end)
      // - Has endDate set (period end when access ends)
      autoRenewFilter["subscription.status"] = { $in: ["active", "past_due"] };
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

  return filter;
}

