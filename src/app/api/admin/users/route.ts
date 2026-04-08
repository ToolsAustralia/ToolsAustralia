import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import PaymentEvent from "@/models/PaymentEvent";
import MajorDraw from "@/models/MajorDraw";
import { getPackageById } from "@/data/membershipPackages";
import {
  buildUserFilter,
  getActiveSubscriptionFilter,
  getEverPaidUserFilter,
} from "@/utils/admin/userFilterBuilder";

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
 * - state: Australian state code (NSW, VIC, …)
 * - inActiveMajorDraw: "yes" | "no" (active major draw with totalEntries > 0)
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

    const state = searchParams.get("state") || "";
    const inActiveMajorDraw = searchParams.get("inActiveMajorDraw") || "";

    const filter = await buildUserFilter({
      search,
      subscriptionStatus,
      autoRenew,
      membershipPackage,
      role,
      dateFrom: dateFrom || "",
      dateTo: dateTo || "",
      state,
      inActiveMajorDraw,
    });

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

    // Fetch BenefitsGranted and RefundProcessed for these users (Option B: only count non-refunded payments)
    const [paymentEvents, refundEvents] = await Promise.all([
      PaymentEvent.find({
        userId: { $in: userIds },
        eventType: "BenefitsGranted",
      }).lean(),
      PaymentEvent.find({
        userId: { $in: userIds },
        eventType: "RefundProcessed",
      })
        .select("userId paymentIntentId")
        .lean(),
    ]);

    const refundedKeys = new Set(
      refundEvents.map((e) => `${e.userId.toString()}|${e.paymentIntentId}`)
    );

    // Calculate total spent per user (exclude BenefitsGranted that have a matching RefundProcessed)
    const userSpentMap = new Map<string, number>();
    paymentEvents.forEach((event) => {
      const userId = event.userId.toString();
      const key = `${userId}|${event.paymentIntentId}`;
      if (refundedKeys.has(key)) return;
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
    // Conversions = users who have ever made at least one purchase (subscription, one-time, mini-draw, upsell)
    const [totalUsers, activeSubscriptionsCount, verifiedUsersCount, convertedUsersCount] = await Promise.all([
      User.countDocuments({ isActive: true }),
      // Active subscriptions: only count subscriptions that will auto-renew (matches projected income calculation)
      User.countDocuments(getActiveSubscriptionFilter()),
      User.countDocuments({ isEmailVerified: true, isActive: true }),
      User.countDocuments(getEverPaidUserFilter()),
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
