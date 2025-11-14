import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import PaymentEvent from "@/models/PaymentEvent";

export interface ChartData {
  month: string;
  oneTime: number; // Combined: one-time, upsell, mini-draw packages
  memberships: number; // subscription packages
  total: number;
}

/**
 * GET /api/admin/dashboard/revenue-breakdown
 * Get revenue breakdown by month for the last 12 months
 */
export async function GET() {
  try {
    await connectDB();

    // Verify admin authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("📊 Fetching revenue breakdown...");

    const now = new Date();
    const twelveMonthsAgo = new Date(now.getFullYear() - 1, now.getMonth(), 1);

    // Get all successful payments from the last 12 months
    const revenueEvents = await PaymentEvent.find({
      eventType: "BenefitsGranted",
      timestamp: { $gte: twelveMonthsAgo },
    }).sort({ timestamp: 1 });

    // Initialize chart data for the last 12 months
    const chartData: ChartData[] = [];
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    for (let i = 0; i < 12; i++) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);

      chartData.push({
        month: monthNames[monthDate.getMonth()],
        oneTime: 0,
        memberships: 0,
        total: 0,
      });
    }

    // Process each payment event
    revenueEvents.forEach((event) => {
      const eventDate = new Date(event.timestamp);
      const price = event.data?.price || 0;

      // Find the corresponding month in chart data
      const monthIndex = chartData.findIndex((data) => {
        const dataMonth = new Date(now.getFullYear(), now.getMonth() - 11 + chartData.indexOf(data), 1);
        return dataMonth.getMonth() === eventDate.getMonth() && dataMonth.getFullYear() === eventDate.getFullYear();
      });

      if (monthIndex !== -1) {
        const monthData = chartData[monthIndex];

        // Categorize revenue by package type
        if (event.packageType === "subscription") {
          monthData.memberships += price;
        } else {
          // All non-subscription payments: one-time, upsell, mini-draw
          monthData.oneTime += price;
        }

        monthData.total += price;
      }
    });

    // Calculate totals for the current period
    const currentMonthTotal = chartData[chartData.length - 1]?.total || 0;
    const previousMonthTotal = chartData[chartData.length - 2]?.total || 0;
    const growthRate =
      previousMonthTotal > 0 ? Math.round(((currentMonthTotal - previousMonthTotal) / previousMonthTotal) * 100) : 0;

    console.log(`✅ Revenue breakdown calculated for ${chartData.length} months`);

    return NextResponse.json({
      success: true,
      data: {
        chartData,
        currentMonthTotal,
        previousMonthTotal,
        growthRate,
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
