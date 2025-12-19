import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import PaymentEvent from "@/models/PaymentEvent";
import { formatInTimeZone } from "date-fns-tz";
import { startOfDay, startOfMonth, startOfYear, subDays, subMonths, subYears } from "date-fns";
import { getStartOfTodayInAEST } from "@/utils/common/timezone";

const AEST_TIMEZONE = "Australia/Sydney";

export interface ChartData {
  date: string; // Date label (e.g., "Jan 15", "2024", "Jan")
  dateKey: string; // ISO date string for filtering (e.g., "2025-01-15T00:00:00.000Z")
  oneTime: number; // One-time packages (excluding mini-draw)
  memberships: number; // Subscription packages
  miniDraw: number; // Mini-draw packages
  total: number;
}

/**
 * GET /api/admin/dashboard/revenue-breakdown
 * Get revenue breakdown by period (days, months, or years)
 *
 * Query Parameters:
 * - period: "days" | "months" | "years" (default: "months")
 * - startDate: ISO date string (optional, defaults to appropriate range)
 * - endDate: ISO date string (optional, defaults to now)
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
    const period = (searchParams.get("period") as "days" | "months" | "years") || "months";
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");

    console.log("📊 Fetching revenue breakdown...", { period });

    const now = new Date();
    let startDate: Date;
    let endDate: Date = now;

    // Calculate date range based on period
    if (startDateParam && endDateParam) {
      startDate = new Date(startDateParam);
      endDate = new Date(endDateParam);
    } else {
      // Default ranges based on period
      switch (period) {
        case "days":
          // Last 30 days
          startDate = subDays(getStartOfTodayInAEST(), 29);
          endDate = now;
          break;
        case "months":
          // Last 12 months
          startDate = subMonths(startOfMonth(now), 11);
          endDate = now;
          break;
        case "years":
          // Last 5 years
          startDate = subYears(startOfYear(now), 4);
          endDate = now;
          break;
        default:
          startDate = subMonths(startOfMonth(now), 11);
      }
    }

    // Get all successful payments in the date range
    const revenueEvents = await PaymentEvent.find({
      eventType: "BenefitsGranted",
      timestamp: { $gte: startDate, $lte: endDate },
    }).sort({ timestamp: 1 });

    // Initialize chart data based on period
    const chartData: ChartData[] = [];
    const dataMap = new Map<string, ChartData>();

    // Process each payment event
    revenueEvents.forEach((event) => {
      const eventDate = new Date(event.timestamp);
      const price = event.data?.price || 0;

      let key: string;
      let label: string;

      if (period === "days") {
        // Group by day
        const dayStart = startOfDay(eventDate);
        key = dayStart.toISOString();
        label = formatInTimeZone(dayStart, AEST_TIMEZONE, "MMM d");
      } else if (period === "months") {
        // Group by month
        const monthStart = startOfMonth(eventDate);
        key = monthStart.toISOString();
        label = formatInTimeZone(monthStart, AEST_TIMEZONE, "MMM yyyy");
      } else {
        // Group by year
        const yearStart = startOfYear(eventDate);
        key = yearStart.toISOString();
        label = formatInTimeZone(yearStart, AEST_TIMEZONE, "yyyy");
      }

      // Get or create data entry for this period
      if (!dataMap.has(key)) {
        dataMap.set(key, {
          date: label,
          dateKey: key, // Store ISO date string for filtering
          oneTime: 0,
          memberships: 0,
          miniDraw: 0,
          total: 0,
        });
      }

      const periodData = dataMap.get(key)!;

      // Categorize revenue by package type
      if (event.packageType === "membership") {
        periodData.memberships += price;
      } else if (event.packageType === "mini-draw") {
        periodData.miniDraw += price;
      } else {
        // One-time packages and upsells (not mini-draw)
        periodData.oneTime += price;
      }

      periodData.total += price;
    });

    // Fill in missing periods (for days view especially)
    if (period === "days") {
      const currentDate = startOfDay(startDate);
      const endDay = startOfDay(endDate);
      while (currentDate <= endDay) {
        const key = currentDate.toISOString();
        if (!dataMap.has(key)) {
          dataMap.set(key, {
            date: formatInTimeZone(currentDate, AEST_TIMEZONE, "MMM d"),
            dateKey: key,
            oneTime: 0,
            memberships: 0,
            miniDraw: 0,
            total: 0,
          });
        }
        currentDate.setDate(currentDate.getDate() + 1);
      }
    } else if (period === "months") {
      const currentMonth = startOfMonth(startDate);
      const endMonth = startOfMonth(endDate);
      while (currentMonth <= endMonth) {
        const key = currentMonth.toISOString();
        if (!dataMap.has(key)) {
          dataMap.set(key, {
            date: formatInTimeZone(currentMonth, AEST_TIMEZONE, "MMM yyyy"),
            dateKey: key,
            oneTime: 0,
            memberships: 0,
            miniDraw: 0,
            total: 0,
          });
        }
        currentMonth.setMonth(currentMonth.getMonth() + 1);
      }
    } else {
      // Years
      const currentYear = startOfYear(startDate);
      const endYear = startOfYear(endDate);
      while (currentYear <= endYear) {
        const key = currentYear.toISOString();
        if (!dataMap.has(key)) {
          dataMap.set(key, {
            date: formatInTimeZone(currentYear, AEST_TIMEZONE, "yyyy"),
            dateKey: key,
            oneTime: 0,
            memberships: 0,
            miniDraw: 0,
            total: 0,
          });
        }
        currentYear.setFullYear(currentYear.getFullYear() + 1);
      }
    }

    // Convert map to array and sort by date
    chartData.push(...Array.from(dataMap.values()));
    chartData.sort((a, b) => {
      // Sort by the original key (ISO date string) if available
      const aIndex = Array.from(dataMap.keys()).find((k) => dataMap.get(k) === a);
      const bIndex = Array.from(dataMap.keys()).find((k) => dataMap.get(k) === b);
      if (aIndex && bIndex) {
        return new Date(aIndex).getTime() - new Date(bIndex).getTime();
      }
      return 0;
    });

    // Calculate totals and growth
    const totalRevenue = chartData.reduce((sum, d) => sum + d.total, 0);
    const oneTimeTotal = chartData.reduce((sum, d) => sum + d.oneTime, 0);
    const membershipsTotal = chartData.reduce((sum, d) => sum + d.memberships, 0);
    const miniDrawTotal = chartData.reduce((sum, d) => sum + d.miniDraw, 0);

    // Calculate growth (compare last period to previous period)
    const lastPeriod = chartData[chartData.length - 1]?.total || 0;
    const previousPeriod = chartData[chartData.length - 2]?.total || 0;
    const growthRate = previousPeriod > 0 ? Math.round(((lastPeriod - previousPeriod) / previousPeriod) * 100) : 0;

    console.log(`✅ Revenue breakdown calculated: ${chartData.length} ${period}`);

    return NextResponse.json({
      success: true,
      data: {
        chartData,
        totals: {
          total: totalRevenue,
          oneTime: oneTimeTotal,
          memberships: membershipsTotal,
          miniDraw: miniDrawTotal,
        },
        growthRate,
        period,
      },
    });
  } catch (error) {
    console.error("❌ Error fetching revenue breakdown:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch revenue breakdown",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
