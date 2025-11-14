import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import PaymentEvent from "@/models/PaymentEvent";
import MajorDraw from "@/models/MajorDraw";

/**
 * GET /api/admin/users
 * Get paginated list of users with search and filtering
 *
 * Query parameters:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 25)
 * - search: Search term (searches email and name)
 * - subscriptionStatus: Filter by subscription status (active, inactive, none)
 * - role: Filter by user role (user, admin)
 * - dateFrom: Filter users created after this date
 * - dateTo: Filter users created before this date
 * - sortBy: Sort field (createdAt, email, lastLogin, totalSpent)
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
      role,
      dateFrom,
      dateTo,
      sortBy,
      sortOrder,
    });

    // Build filter query
    const filter: Record<string, unknown> = {};

    // Search filter (email or name)
    if (search) {
      filter.$or = [
        { email: { $regex: search, $options: "i" } },
        { firstName: { $regex: search, $options: "i" } },
        { lastName: { $regex: search, $options: "i" } },
      ];
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

    // Subscription status filter
    if (subscriptionStatus) {
      switch (subscriptionStatus) {
        case "active":
          filter["subscription.isActive"] = true;
          break;
        case "inactive":
          filter["subscription.isActive"] = false;
          break;
        case "none":
          filter.$or = [
            { subscription: { $exists: false } },
            { subscription: null },
            { "subscription.isActive": { $ne: true } },
          ];
          break;
      }
    }

    // Build sort object
    const sort: Record<string, 1 | -1> = {};
    sort[sortBy] = sortOrder === "asc" ? 1 : -1;

    // Calculate skip value for pagination
    const skip = (page - 1) * limit;

    // Execute query with pagination
    const [users, totalCount] = await Promise.all([
      User.find(filter)
        .select("-password -emailVerificationToken -passwordResetToken -smsOtpCode")
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);

    // Get user IDs for additional data fetching
    const userIds = users.map((user) => user._id);

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
      currentMajorDraw.entries?.forEach((entry: { userId: { toString: () => string }; quantity: number }) => {
        const userId = entry.userId.toString();
        const currentEntries = userEntriesMap.get(userId) || 0;
        userEntriesMap.set(userId, currentEntries + entry.quantity);
      });
    }

    // Transform users data with computed fields
    const usersWithStats = users.map((user) => {
      const userId = user._id.toString();
      const totalSpent = userSpentMap.get(userId) || 0;
      const currentDrawEntries = userEntriesMap.get(userId) || 0;
      // Show accumulated entries if no current draw entries, otherwise show current draw entries
      const majorDrawEntries = currentDrawEntries > 0 ? currentDrawEntries : user.accumulatedEntries || 0;

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
        subscription: user.subscription
          ? {
              packageId: user.subscription.packageId,
              isActive: user.subscription.isActive,
              startDate: user.subscription.startDate,
              endDate: user.subscription.endDate,
              status: user.subscription.status,
            }
          : null,
        totalSpent,
        majorDrawEntries,
        rewardsPoints: user.rewardsPoints || 0,
        accumulatedEntries: user.accumulatedEntries || 0,
      };
    });

    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    const response = {
      success: true,
      data: {
        users: usersWithStats,
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
