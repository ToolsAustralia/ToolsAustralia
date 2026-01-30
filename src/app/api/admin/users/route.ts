import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import PaymentEvent from "@/models/PaymentEvent";
import MajorDraw from "@/models/MajorDraw";
import { getPackageById } from "@/data/membershipPackages";
import { getActiveSubscriptionFilter, getActiveSubscriptionSubFilter } from "@/utils/admin/userFilterBuilder";

/**
 * GET /api/admin/users
 * Get paginated list of users with search and filtering
 *
 * Query parameters:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 25)
 * - search: Search term (searches email and name)
 * - subscriptionStatus: Filter by subscription status (active, inactive, none)
 * - membershipPackage: Filter by subscription package ID (matches package name)
 * - role: Filter by user role (user, admin)
 * - dateFrom: Filter users created after this date
 * - dateTo: Filter users created before this date
 * - sortBy: Sort field (createdAt, email, lastLogin, totalSpent, majorDrawEntries, miniDrawCount)
 * - sortOrder: Sort direction (asc, desc)
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    // Verify admin authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "25"), 100); // Max 100 per page
    const search = searchParams.get("search") || "";
    const subscriptionStatus = searchParams.get("subscriptionStatus") || "";
    const autoRenew = searchParams.get("autoRenew") || "";
    const membershipPackage = searchParams.get("membershipPackage") || "";
    const role = searchParams.get("role") || "";
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const sortBy = searchParams.get("sortBy") || "createdAt";
    const sortOrder = searchParams.get("sortOrder") || "desc";

    console.log("📊 Fetching admin users list:", {
      page,
      limit,
      search,
      subscriptionStatus,
      autoRenew,
      membershipPackage,
      role,
      dateFrom,
      dateTo,
      sortBy,
      sortOrder,
    });

    // Debug: Log filter construction for Past Due + Will Renew
    if (subscriptionStatus === "past_due" && autoRenew === "true") {
      console.log("🔍 [DEBUG] Past Due + Will Renew filter combination:");
    }

    // Build filter query
    const filter: Record<string, unknown> = {};

    // Search filter (email, first name, last name, or full name)
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
          subscriptionStatusFilter["subscription.isActive"] = true;
          subscriptionStatusFilter["subscription.status"] = "active";
          subscriptionStatusFilter["subscription.autoRenew"] = { $ne: false }; // Only count if autoRenew is true or undefined (matches projected income calculation)
          subscriptionStatusFilter["isActive"] = true; // Ensure user account is active (matches projected income stats calculation)
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
      
      // Debug: Log combined filter for Past Due + Will Renew
      if (subscriptionStatus === "past_due" && autoRenew === "true") {
        console.log("🔍 [DEBUG] Combined filter after merge:", JSON.stringify(combinedFilter, null, 2));
      }
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
    
    // Debug: Log final filter for Past Due + Will Renew
    if (subscriptionStatus === "past_due" && autoRenew === "true") {
      console.log("🔍 [DEBUG] Final filter with endDate condition:", JSON.stringify(filter, null, 2));
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
      const matchingPackages = (await import("@/data/membershipPackages")).membershipPackages.filter(
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
      users = await User.find(filter)
        .select("-password -emailVerificationToken -passwordResetToken -smsOtpCode")
        .lean();
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
      // Active subscriptions: only count subscriptions that will auto-renew (matches projected income calculation)
      User.countDocuments(getActiveSubscriptionFilter()),
      User.countDocuments({ isEmailVerified: true, isActive: true }),
      User.countDocuments({
        $or: [
          // For conversions, count subscriptions that will auto-renew (true active subscriptions)
          getActiveSubscriptionSubFilter(),
          { oneTimePackages: { $exists: true, $not: { $size: 0 } } },
          { miniDrawPackages: { $exists: true, $not: { $size: 0 } } },
        ],
        isActive: true,
      }),
    ]);

    // Transform users data with computed fields and map packageId to packageName
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const usersWithStats = (users as any[]).map(
      (user: {
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
      }) => {
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
      }
    );

    // Handle sorting for computed fields (must happen before pagination)
    if (isComputedFieldSort) {
      if (sortBy === "totalSpent") {
        usersWithStats.sort((a, b) => {
          return sortOrder === "asc" ? a.totalSpent - b.totalSpent : b.totalSpent - a.totalSpent;
        });
      } else if (sortBy === "majorDrawEntries") {
        usersWithStats.sort((a, b) => {
          return sortOrder === "asc"
            ? a.majorDrawEntries - b.majorDrawEntries
            : b.majorDrawEntries - a.majorDrawEntries;
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

      const response = {
        success: true,
        data: {
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
        },
      };

      console.log(`✅ Fetched ${paginatedUsers.length} users (page ${page}/${totalPages}) with computed field sorting`);

      return NextResponse.json(response);
    }

    // For non-computed fields, pagination was already applied
    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    const response = {
      success: true,
      data: {
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
      },
    };

    console.log(`✅ Fetched ${usersWithStats.length} users (page ${page}/${totalPages})`);

    return NextResponse.json(response);
  } catch (error) {
    console.error("❌ Error fetching admin users list:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch users list",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
