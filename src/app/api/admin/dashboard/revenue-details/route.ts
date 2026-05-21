import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { fetchNetBenefitsGrantedWithMatch } from "@/utils/payment/payment-event-net-queries";
import { getStartOfTodayInAEST, createAESTDateAsUTC, getWebsiteLaunchDateUTC } from "@/utils/common/timezone";
import { subDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

/**
 * GET /api/admin/dashboard/revenue-details
 * Get detailed user list for a specific revenue category
 *
 * Query Parameters:
 * - category: "membership-purchase" | "membership-renewal" | "one-time-purchase" | "additional-one-time" | "mini-draw" | "upsell"
 * - dateRange: "today" | "yesterday" | "all-time" | "custom" | "current-draw" | "last-draw"
 * - startDate: ISO date string (required if dateRange is "custom" or draw-based)
 * - endDate: ISO date string (required if dateRange is "custom" or draw-based)
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 50, max: 100)
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    // Verify admin authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get("category") as
      | "membership-purchase"
      | "membership-renewal"
      | "one-time-purchase"
      | "additional-one-time"
      | "mini-draw"
      | "upsell"
      | null;
    const dateRange = (searchParams.get("dateRange") as
      | "today"
      | "yesterday"
      | "all-time"
      | "custom"
      | "current-draw"
      | "last-draw") || "today";
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));

    if (!category) {
      return NextResponse.json({ error: "category parameter is required" }, { status: 400 });
    }

    // Calculate date range (same logic as stats endpoint)
    let startDate: Date;
    let endDate: Date;

    const startOfToday = getStartOfTodayInAEST();
    const AEST_TIMEZONE = "Australia/Sydney";

    const now = new Date();
    const todayYear = parseInt(formatInTimeZone(now, AEST_TIMEZONE, "yyyy"), 10);
    const todayMonth = parseInt(formatInTimeZone(now, AEST_TIMEZONE, "M"), 10);
    const todayDay = parseInt(formatInTimeZone(now, AEST_TIMEZONE, "d"), 10);
    const endOfToday = createAESTDateAsUTC(todayYear, todayMonth, todayDay, 23, 59);
    endOfToday.setUTCSeconds(59, 999);

    endDate = endOfToday;

    switch (dateRange) {
      case "today":
        startDate = startOfToday;
        endDate = endOfToday;
        break;
      case "yesterday":
        const yesterdayStart = subDays(startOfToday, 1);
        startDate = yesterdayStart;
        endDate = new Date(startOfToday.getTime() - 1);
        break;
      case "current-draw":
      case "last-draw": {
        if (!startDateParam || !endDateParam) {
          return NextResponse.json(
            { error: "startDate and endDate are required for draw-based ranges" },
            { status: 400 }
          );
        }
        const drawStartDateParsed = new Date(startDateParam);
        const drawEndDateParsed = new Date(endDateParam);

        const drawStartYear = parseInt(formatInTimeZone(drawStartDateParsed, AEST_TIMEZONE, "yyyy"), 10);
        const drawStartMonth = parseInt(formatInTimeZone(drawStartDateParsed, AEST_TIMEZONE, "M"), 10);
        const drawStartDay = parseInt(formatInTimeZone(drawStartDateParsed, AEST_TIMEZONE, "d"), 10);

        const drawEndYear = parseInt(formatInTimeZone(drawEndDateParsed, AEST_TIMEZONE, "yyyy"), 10);
        const drawEndMonth = parseInt(formatInTimeZone(drawEndDateParsed, AEST_TIMEZONE, "M"), 10);
        const drawEndDay = parseInt(formatInTimeZone(drawEndDateParsed, AEST_TIMEZONE, "d"), 10);

        startDate = createAESTDateAsUTC(drawStartYear, drawStartMonth, drawStartDay, 0, 0);

        const drawNextDayStart = createAESTDateAsUTC(drawEndYear, drawEndMonth, drawEndDay, 0, 0);
        const drawNextDay = new Date(drawNextDayStart);
        drawNextDay.setUTCDate(drawNextDay.getUTCDate() + 1);
        endDate = new Date(drawNextDay.getTime() - 1);
        break;
      }
      case "all-time":
        startDate = getWebsiteLaunchDateUTC();
        endDate = endOfToday;
        break;
      case "custom":
        if (!startDateParam || !endDateParam) {
          return NextResponse.json({ error: "startDate and endDate are required for custom range" }, { status: 400 });
        }
        const startDateParsed = new Date(startDateParam);
        const endDateParsed = new Date(endDateParam);

        const startYear = parseInt(formatInTimeZone(startDateParsed, AEST_TIMEZONE, "yyyy"), 10);
        const startMonth = parseInt(formatInTimeZone(startDateParsed, AEST_TIMEZONE, "M"), 10);
        const startDay = parseInt(formatInTimeZone(startDateParsed, AEST_TIMEZONE, "d"), 10);

        const endYear = parseInt(formatInTimeZone(endDateParsed, AEST_TIMEZONE, "yyyy"), 10);
        const endMonth = parseInt(formatInTimeZone(endDateParsed, AEST_TIMEZONE, "M"), 10);
        const endDay = parseInt(formatInTimeZone(endDateParsed, AEST_TIMEZONE, "d"), 10);

        startDate = createAESTDateAsUTC(startYear, startMonth, startDay, 0, 0);

        const nextDayStart = createAESTDateAsUTC(endYear, endMonth, endDay, 0, 0);
        const nextDay = new Date(nextDayStart);
        nextDay.setUTCDate(nextDay.getUTCDate() + 1);
        endDate = new Date(nextDay.getTime() - 1);
        break;
      default:
        startDate = startOfToday;
    }

    // Build query based on category
    const eventQuery: Record<string, unknown> = {
      eventType: "BenefitsGranted",
      timestamp: { $gte: startDate, $lte: endDate },
    };

    if (category === "membership-purchase") {
      eventQuery.packageType = "membership";
      eventQuery["data.billingReason"] = { $ne: "subscription_cycle" };
    } else if (category === "membership-renewal") {
      eventQuery.packageType = "membership";
      eventQuery["data.billingReason"] = "subscription_cycle";
    } else if (category === "one-time-purchase") {
      eventQuery.packageType = "one-time";
      eventQuery.$or = [
        { packageId: { $regex: /-pack$/, $not: { $regex: /^additional-/ } } },
        { packageId: { $exists: false } },
        { packageId: "" },
      ];
    } else if (category === "additional-one-time") {
      eventQuery.packageType = "one-time";
      eventQuery.packageId = { $regex: /^additional-/ };
    } else if (category === "mini-draw") {
      eventQuery.packageType = "mini-draw";
    } else if (category === "upsell") {
      eventQuery.packageType = "upsell";
    }

    // Net revenue: same filters but exclude BenefitsGranted with RefundProcessed (Option B)
    const paymentEventsRaw = await fetchNetBenefitsGrantedWithMatch(eventQuery, {
      userId: 1,
      packageType: 1,
      packageId: 1,
      packageName: 1,
      data: 1,
      timestamp: 1,
      _id: 1,
    });
    const paymentEvents = [...paymentEventsRaw].sort(
      (a, b) => new Date(b.timestamp ?? 0).getTime() - new Date(a.timestamp ?? 0).getTime()
    );

    // Group events by user
    const userEventsMap = new Map<string, typeof paymentEvents>();

    for (const event of paymentEvents) {
      const userId = event.userId?.toString() || "";
      if (!userId) continue;

      if (!userEventsMap.has(userId)) {
        userEventsMap.set(userId, []);
      }
      userEventsMap.get(userId)!.push(event);
    }

    // Get user IDs for lookup
    const userIds = Array.from(userEventsMap.keys());
    const totalUsers = userIds.length;
    const totalPurchases = paymentEvents.length;
    const totalRevenue = paymentEvents.reduce((sum, event) => sum + (event.data?.price || 0), 0);

    // Paginate user IDs
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedUserIds = userIds.slice(startIndex, endIndex);

    // Fetch user details
    const users = await User.find({ _id: { $in: paginatedUserIds } })
      .select("firstName lastName email mobile")
      .lean();

    // Build response data
    const usersData = paginatedUserIds.map((userId) => {
      const user = users.find((u) => u._id.toString() === userId);
      const userEvents = userEventsMap.get(userId) || [];
      const purchases = userEvents.map((event) => ({
        paymentEventId: event._id,
        timestamp: event.timestamp instanceof Date ? event.timestamp.toISOString() : "",
        amount: event.data?.price || 0,
        packageId: event.packageId,
        packageName: event.packageName,
        billingReason: event.data?.billingReason,
      }));

      const totalContributed = purchases.reduce((sum, p) => sum + p.amount, 0);

      return {
        userId,
        userInfo: user
          ? {
              firstName: user.firstName || "",
              lastName: user.lastName || "",
              email: user.email || "",
              mobile: user.mobile || undefined,
            }
          : {
              firstName: "Unknown",
              lastName: "",
              email: "",
              mobile: undefined,
            },
        purchases,
        totalContributed,
        purchaseCount: purchases.length,
      };
    });

    // Calculate pagination
    const totalPages = Math.ceil(totalUsers / limit);

    return NextResponse.json({
      success: true,
      data: {
        category,
        totalRevenue,
        totalPurchases,
        totalUsers,
        users: usersData,
        pagination: {
          currentPage: page,
          totalPages,
          totalCount: totalUsers,
          limit,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1,
        },
      },
    });
  } catch (error) {
    console.error("❌ Error fetching revenue details:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch revenue details",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
