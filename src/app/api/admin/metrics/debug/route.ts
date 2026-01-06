import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import PaymentEvent from "@/models/PaymentEvent";
import FacebookAdsInsight from "@/models/FacebookAdsInsight";
import { subDays, startOfDay, endOfDay } from "date-fns";

/**
 * GET /api/admin/metrics/debug
 * Debug endpoint to check what data exists and why aggregation might be returning zeros
 */
export async function GET(request: NextRequest) {
  try {
    // 1. Authentication & Authorization
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Admin access required" } },
        { status: 401 }
      );
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const daysBack = parseInt(searchParams.get("days") || "7", 10);
    
    const today = new Date();
    const startDate = subDays(today, daysBack);
    const startOfRange = startOfDay(startDate);
    const endOfRange = endOfDay(today);

    // Check PaymentEvents
    const paymentEvents = await PaymentEvent.find({
      eventType: "BenefitsGranted",
      timestamp: { $gte: startOfRange, $lte: endOfRange },
    })
      .select("timestamp data.price packageType")
      .lean()
      .limit(10);

    const paymentEventCount = await PaymentEvent.countDocuments({
      eventType: "BenefitsGranted",
      timestamp: { $gte: startOfRange, $lte: endOfRange },
    });

    const totalRevenue = paymentEvents.reduce((sum, e) => sum + (e.data?.price || 0), 0);

    // Check FacebookAdsInsights
    const facebookAds = await FacebookAdsInsight.find({
      date: { $gte: startOfRange, $lte: endOfRange },
      level: "account",
    })
      .select("date metrics")
      .lean()
      .limit(10);

    const facebookAdsCount = await FacebookAdsInsight.countDocuments({
      date: { $gte: startOfRange, $lte: endOfRange },
      level: "account",
    });

    return NextResponse.json({
      dateRange: {
        start: startOfRange.toISOString(),
        end: endOfRange.toISOString(),
        days: daysBack,
      },
      paymentEvents: {
        count: paymentEventCount,
        sample: paymentEvents.map((e) => ({
          timestamp: e.timestamp,
          price: e.data?.price,
          packageType: e.packageType,
        })),
        totalRevenue,
      },
      facebookAds: {
        count: facebookAdsCount,
        sample: facebookAds.map((a) => ({
          date: a.date,
          spend: a.metrics?.spend,
          revenue: a.metrics?.revenue,
          conversions: a.metrics?.conversions,
        })),
      },
      note: "DailyMetrics model removed - metrics are now aggregated on-the-fly from source data",
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          code: "DEBUG_ERROR",
          message: error instanceof Error ? error.message : "Unknown error",
        },
      },
      { status: 500 }
    );
  }
}

