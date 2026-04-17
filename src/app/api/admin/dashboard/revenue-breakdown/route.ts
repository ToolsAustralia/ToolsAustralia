import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import { fetchNetBenefitsGrantedInRange } from "@/utils/payment/payment-event-net-queries";
import MajorDraw from "@/models/MajorDraw";
import { formatInTimeZone } from "date-fns-tz";
import { startOfMonth, subDays, subMonths, subYears } from "date-fns";
import { getStartOfTodayInAEST, createAESTDateAsUTC, getWebsiteLaunchDateUTC } from "@/utils/common/timezone";

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
    const period = (searchParams.get("period") as "days" | "months" | "years" | "major-draws") || "months";
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");

    console.log("📊 Fetching revenue breakdown...", { period });

    const now = new Date();
    // Calculate end of today in AEST (same as stats API for consistency)
    const todayYear = parseInt(formatInTimeZone(now, AEST_TIMEZONE, "yyyy"), 10);
    const todayMonth = parseInt(formatInTimeZone(now, AEST_TIMEZONE, "M"), 10);
    const todayDay = parseInt(formatInTimeZone(now, AEST_TIMEZONE, "d"), 10);
    const endOfToday = createAESTDateAsUTC(todayYear, todayMonth, todayDay, 23, 59);
    endOfToday.setUTCSeconds(59, 999);
    
    let startDate: Date;
    let endDate: Date = endOfToday;

    // Calculate date range based on period
    if (startDateParam && endDateParam) {
      // Parse dates and normalize to AEST timezone (similar to stats API)
      const startDateParsed = new Date(startDateParam);
      const endDateParsed = new Date(endDateParam);
      
      // Get date components in AEST
      const startYear = parseInt(formatInTimeZone(startDateParsed, AEST_TIMEZONE, "yyyy"), 10);
      const startMonth = parseInt(formatInTimeZone(startDateParsed, AEST_TIMEZONE, "M"), 10);
      const startDay = parseInt(formatInTimeZone(startDateParsed, AEST_TIMEZONE, "d"), 10);
      
      const endYear = parseInt(formatInTimeZone(endDateParsed, AEST_TIMEZONE, "yyyy"), 10);
      const endMonth = parseInt(formatInTimeZone(endDateParsed, AEST_TIMEZONE, "M"), 10);
      const endDay = parseInt(formatInTimeZone(endDateParsed, AEST_TIMEZONE, "d"), 10);
      
      // Set startDate to start of day (00:00:00) in AEST
      startDate = createAESTDateAsUTC(startYear, startMonth, startDay, 0, 0);
      
      // Set endDate to end of day (23:59:59.999) in AEST
      const endDayStart = createAESTDateAsUTC(endYear, endMonth, endDay, 0, 0);
      const nextDay = new Date(endDayStart);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      endDate = new Date(nextDay.getTime() - 1);
    } else {
      // Default ranges based on period
      switch (period) {
        case "days":
          // Last 30 days
          startDate = subDays(getStartOfTodayInAEST(), 29);
          endDate = endOfToday;
          break;
        case "months":
          // Last 12 months
          startDate = subMonths(startOfMonth(now), 11);
          endDate = endOfToday;
          break;
        case "years":
          // For all-time totals, use website launch date to ensure consistency with stats API
          // This ensures the revenue breakdown matches the dashboard stats "all-time" totals
          startDate = getWebsiteLaunchDateUTC();
          endDate = endOfToday;
          break;
        case "major-draws":
          // For major draws, we'll fetch all draws and use their date ranges
          // Set a wide range to capture all draws
          startDate = subYears(now, 5);
          endDate = endOfToday;
          break;
        default:
          startDate = subMonths(startOfMonth(now), 11);
      }
    }

    // Net revenue: BenefitsGranted in range excluding rows with RefundProcessed (Option B)
    const revenueEventsRaw = await fetchNetBenefitsGrantedInRange(startDate, endDate);
    const revenueEvents = [...revenueEventsRaw].sort(
      (a, b) => new Date(a.timestamp ?? 0).getTime() - new Date(b.timestamp ?? 0).getTime()
    );

    // Initialize chart data based on period
    const chartData: ChartData[] = [];
    const dataMap = new Map<string, ChartData>();

    // Handle major-draws period separately
    if (period === "major-draws") {
      // Fetch all major draws sorted by activationDate
      const majorDraws = await MajorDraw.find({
        activationDate: { $exists: true, $ne: null },
        drawDate: { $exists: true, $ne: null },
      })
        .sort({ activationDate: 1 })
        .select("name activationDate drawDate")
        .lean();

      // Create a map of draw periods
      const drawMap = new Map<string, { name: string; activationDate: Date; drawDate: Date }>();
      
      majorDraws.forEach((draw) => {
        const drawKey = draw.activationDate.toISOString();
        drawMap.set(drawKey, {
          name: draw.name,
          activationDate: new Date(draw.activationDate),
          drawDate: new Date(draw.drawDate),
        });
      });

      // Process each payment event and assign to draw period
      revenueEvents.forEach((event) => {
        const eventTimestamp = new Date(event.timestamp);
        const price = event.data?.price || 0;

        // Find which draw period this event belongs to
        let assignedDraw: { name: string; activationDate: Date; drawDate: Date; key: string } | null = null;

        for (const [drawKey, draw] of drawMap.entries()) {
          if (eventTimestamp >= draw.activationDate && eventTimestamp <= draw.drawDate) {
            assignedDraw = { ...draw, key: drawKey };
            break;
          }
        }

        // If event doesn't fall within any draw, skip it (or could create "Gap" entries)
        if (!assignedDraw) {
          return;
        }

        // Get or create data entry for this draw
        if (!dataMap.has(assignedDraw.key)) {
          dataMap.set(assignedDraw.key, {
            date: assignedDraw.name,
            dateKey: assignedDraw.activationDate.toISOString(),
            oneTime: 0,
            memberships: 0,
            miniDraw: 0,
            total: 0,
          });
        }

        const periodData = dataMap.get(assignedDraw.key)!;

        // Categorize revenue by package type
        if (event.packageType === "membership") {
          periodData.memberships += price;
        } else if (event.packageType === "mini-draw") {
          periodData.miniDraw += price;
        } else {
          periodData.oneTime += price;
        }

        periodData.total += price;
      });

      // Fill in draws with no revenue (for complete chart)
      drawMap.forEach((draw, drawKey) => {
        if (!dataMap.has(drawKey)) {
          dataMap.set(drawKey, {
            date: draw.name,
            dateKey: draw.activationDate.toISOString(),
            oneTime: 0,
            memberships: 0,
            miniDraw: 0,
            total: 0,
          });
        }
      });
    } else {
      // Process each payment event for days/months/years periods
      revenueEvents.forEach((event) => {
        const eventDate = new Date(event.timestamp);
        const price = event.data?.price || 0;

        let key: string;
        let label: string;

        if (period === "days") {
          // Group by day - convert to AEST timezone first
          const eventYear = parseInt(formatInTimeZone(eventDate, AEST_TIMEZONE, "yyyy"), 10);
          const eventMonth = parseInt(formatInTimeZone(eventDate, AEST_TIMEZONE, "M"), 10);
          const eventDay = parseInt(formatInTimeZone(eventDate, AEST_TIMEZONE, "d"), 10);
          const dayStart = createAESTDateAsUTC(eventYear, eventMonth, eventDay, 0, 0);
          key = dayStart.toISOString();
          label = formatInTimeZone(dayStart, AEST_TIMEZONE, "MMM d");
        } else if (period === "months") {
          // Group by month - convert to AEST timezone first
          const eventYear = parseInt(formatInTimeZone(eventDate, AEST_TIMEZONE, "yyyy"), 10);
          const eventMonth = parseInt(formatInTimeZone(eventDate, AEST_TIMEZONE, "M"), 10);
          const monthStart = createAESTDateAsUTC(eventYear, eventMonth, 1, 0, 0);
          key = monthStart.toISOString();
          label = formatInTimeZone(monthStart, AEST_TIMEZONE, "MMM yyyy");
        } else {
          // Group by year - convert to AEST timezone first
          const eventYear = parseInt(formatInTimeZone(eventDate, AEST_TIMEZONE, "yyyy"), 10);
          const yearStart = createAESTDateAsUTC(eventYear, 1, 1, 0, 0);
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

      // Fill in missing periods (for days, months, years views)
      if (period === "days") {
        // Get AEST components for start and end dates
        const startYear = parseInt(formatInTimeZone(startDate, AEST_TIMEZONE, "yyyy"), 10);
        const startMonth = parseInt(formatInTimeZone(startDate, AEST_TIMEZONE, "M"), 10);
        const startDay = parseInt(formatInTimeZone(startDate, AEST_TIMEZONE, "d"), 10);
        
        const endYear = parseInt(formatInTimeZone(endDate, AEST_TIMEZONE, "yyyy"), 10);
        const endMonth = parseInt(formatInTimeZone(endDate, AEST_TIMEZONE, "M"), 10);
        const endDay = parseInt(formatInTimeZone(endDate, AEST_TIMEZONE, "d"), 10);
        
        let currentYear = startYear;
        let currentMonth = startMonth;
        let currentDay = startDay;
        
        while (
          currentYear < endYear ||
          (currentYear === endYear && currentMonth < endMonth) ||
          (currentYear === endYear && currentMonth === endMonth && currentDay <= endDay)
        ) {
          const dayStart = createAESTDateAsUTC(currentYear, currentMonth, currentDay, 0, 0);
          const key = dayStart.toISOString();
          
          if (!dataMap.has(key)) {
            dataMap.set(key, {
              date: formatInTimeZone(dayStart, AEST_TIMEZONE, "MMM d"),
              dateKey: key,
              oneTime: 0,
              memberships: 0,
              miniDraw: 0,
              total: 0,
            });
          }
          
          // Move to next day in AEST
          const nextDate = new Date(dayStart);
          nextDate.setUTCDate(nextDate.getUTCDate() + 1);
          currentYear = parseInt(formatInTimeZone(nextDate, AEST_TIMEZONE, "yyyy"), 10);
          currentMonth = parseInt(formatInTimeZone(nextDate, AEST_TIMEZONE, "M"), 10);
          currentDay = parseInt(formatInTimeZone(nextDate, AEST_TIMEZONE, "d"), 10);
        }
      } else if (period === "months") {
        const startYear = parseInt(formatInTimeZone(startDate, AEST_TIMEZONE, "yyyy"), 10);
        const startMonth = parseInt(formatInTimeZone(startDate, AEST_TIMEZONE, "M"), 10);
        
        const endYear = parseInt(formatInTimeZone(endDate, AEST_TIMEZONE, "yyyy"), 10);
        const endMonth = parseInt(formatInTimeZone(endDate, AEST_TIMEZONE, "M"), 10);
        
        let currentYear = startYear;
        let currentMonth = startMonth;
        
        while (currentYear < endYear || (currentYear === endYear && currentMonth <= endMonth)) {
          const monthStart = createAESTDateAsUTC(currentYear, currentMonth, 1, 0, 0);
          const key = monthStart.toISOString();
          
          if (!dataMap.has(key)) {
            dataMap.set(key, {
              date: formatInTimeZone(monthStart, AEST_TIMEZONE, "MMM yyyy"),
              dateKey: key,
              oneTime: 0,
              memberships: 0,
              miniDraw: 0,
              total: 0,
            });
          }
          
          // Move to next month
          currentMonth++;
          if (currentMonth > 12) {
            currentMonth = 1;
            currentYear++;
          }
        }
      } else {
        // Years
        const startYear = parseInt(formatInTimeZone(startDate, AEST_TIMEZONE, "yyyy"), 10);
        const endYear = parseInt(formatInTimeZone(endDate, AEST_TIMEZONE, "yyyy"), 10);
        
        for (let year = startYear; year <= endYear; year++) {
          const yearStart = createAESTDateAsUTC(year, 1, 1, 0, 0);
          const key = yearStart.toISOString();
          
          if (!dataMap.has(key)) {
            dataMap.set(key, {
              date: formatInTimeZone(yearStart, AEST_TIMEZONE, "yyyy"),
              dateKey: key,
              oneTime: 0,
              memberships: 0,
              miniDraw: 0,
              total: 0,
            });
          }
        }
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
