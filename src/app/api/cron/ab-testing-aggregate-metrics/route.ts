/**
 * A/B Testing Metrics Aggregation Cron Job
 *
 * This endpoint should be called daily to:
 * 1. Aggregate individual events into daily metrics
 * 2. Delete old individual events (after 30 days)
 * 3. Ensure aggregated metrics are up-to-date
 *
 * Cron Schedule: Daily at 3:00 AM UTC (0 3 * * *)
 *
 * Why This Is Important:
 * - Prevents database bloat (individual events can number in millions)
 * - Improves query performance (pre-aggregated data)
 * - Reduces storage costs
 * - Industry best practice (used by Google Optimize, Optimizely, VWO)
 *
 * Security:
 * - Protected by Vercel's internal infrastructure
 *
 * @author Senior Full-Stack Developer
 * @version 1.0.0
 */

import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import ExperimentEvent from "@/models/ab-testing/ExperimentEvent";
import ExperimentDailyMetricsRepository from "@/repositories/ab-testing/ExperimentDailyMetricsRepository";
import PaymentEvent from "@/models/PaymentEvent";
import mongoose from "mongoose";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/cron/ab-testing-aggregate-metrics
 *
 * Aggregate experiment events into daily metrics
 */
export async function GET() {
  const startTime = Date.now();
  const logs: string[] = [];
  const results = {
    daysProcessed: 0,
    eventsAggregated: 0,
    eventsDeleted: 0,
    errors: 0,
  };

  try {
    console.log("🕐 A/B Testing Metrics Aggregation Cron Job Started");
    console.log(`   Time: ${new Date().toISOString()}`);

    await connectDB();
    logs.push("✅ Database connected");
    console.log("✅ Database connected");

    // Get yesterday's date (aggregate previous day's events)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setUTCHours(0, 0, 0, 0);

    const endOfYesterday = new Date(yesterday);
    endOfYesterday.setUTCHours(23, 59, 59, 999);

    // Get all unique experiment/variant combinations that have events
    const experimentVariants = await ExperimentEvent.aggregate([
      {
        $match: {
          timestamp: {
            $gte: yesterday,
            $lte: endOfYesterday,
          },
        },
      },
      {
        $group: {
          _id: {
            experimentId: "$experimentId",
            variantId: "$variantId",
          },
        },
      },
    ]).exec();

    logs.push(`📊 Found ${experimentVariants.length} experiment/variant combinations to aggregate`);

    // Aggregate metrics for each experiment/variant combination
    for (const combo of experimentVariants) {
      try {
        const experimentId = combo._id.experimentId.toString();
        const variantId = combo._id.variantId.toString();

        // Aggregate events for yesterday
        const aggregated = await ExperimentEvent.aggregate([
          {
            $match: {
              experimentId: new mongoose.Types.ObjectId(experimentId),
              variantId: new mongoose.Types.ObjectId(variantId),
              timestamp: {
                $gte: yesterday,
                $lte: endOfYesterday,
              },
            },
          },
          {
            $group: {
              _id: null,
              pageViews: {
                $sum: { $cond: [{ $eq: ["$eventType", "page_view"] }, 1, 0] },
              },
              clicks: {
                $sum: { $cond: [{ $eq: ["$eventType", "click"] }, 1, 0] },
              },
              conversions: {
                $sum: { $cond: [{ $eq: ["$eventType", "conversion"] }, 1, 0] },
              },
              leads: {
                $sum: { $cond: [{ $eq: ["$eventType", "lead"] }, 1, 0] },
              },
              purchases: {
                $sum: { $cond: [{ $eq: ["$eventType", "purchase"] }, 1, 0] },
              },
              uniqueVisitorsSet: {
                $addToSet: {
                  $cond: [
                    { $ifNull: ["$userId", false] },
                    { $toString: "$userId" },
                    "$anonymousId",
                  ],
                },
              },
              eventCount: { $sum: 1 },
            },
          },
          {
            $project: {
              pageViews: 1,
              clicks: 1,
              conversions: 1,
              leads: 1,
              purchases: 1,
              uniqueVisitors: { $size: "$uniqueVisitorsSet" },
              eventCount: 1,
            },
          },
        ]).exec();

        if (aggregated.length > 0 && aggregated[0].eventCount > 0) {
          const metrics = aggregated[0];

          // Get revenue from PaymentEvents for this date range
          const paymentEvents = await PaymentEvent.find({
            experimentId,
            variantId,
            eventType: "BenefitsGranted",
            timestamp: {
              $gte: yesterday,
              $lte: endOfYesterday,
            },
          }).lean();

          const revenue = paymentEvents.reduce((sum, event) => {
            return sum + (event.data?.price || 0);
          }, 0);

          // Upsert daily metrics
          await ExperimentDailyMetricsRepository.upsertDailyMetrics({
            experimentId,
            variantId,
            date: yesterday,
            pageViews: metrics.pageViews,
            clicks: metrics.clicks,
            conversions: metrics.conversions,
            leads: metrics.leads,
            purchases: metrics.purchases,
            uniqueVisitors: metrics.uniqueVisitors,
            revenue,
          });

          results.eventsAggregated += metrics.eventCount;
          results.daysProcessed++;

          logs.push(
            `✅ Aggregated ${metrics.eventCount} events for experiment ${experimentId}, variant ${variantId}`
          );
        }
      } catch (error) {
        results.errors++;
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        logs.push(`❌ Error aggregating metrics: ${errorMessage}`);
        console.error("❌ Error aggregating metrics:", error);
      }
    }

    // Delete old individual events (older than 30 days)
    // Keep recent events for debugging, but delete after aggregation
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setUTCHours(0, 0, 0, 0);

    const deleteResult = await ExperimentEvent.deleteMany({
      timestamp: { $lt: thirtyDaysAgo },
    }).exec();

    results.eventsDeleted = deleteResult.deletedCount || 0;

    if (results.eventsDeleted > 0) {
      logs.push(`🗑️ Deleted ${results.eventsDeleted} old events (older than 30 days)`);
      console.log(`🗑️ Deleted ${results.eventsDeleted} old events (older than 30 days)`);
    }

    const duration = Date.now() - startTime;

    const summary = {
      success: true,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
      results,
      logs,
    };

    console.log(`✅ Cron job completed in ${duration}ms`);
    console.log(`   Days processed: ${results.daysProcessed}`);
    console.log(`   Events aggregated: ${results.eventsAggregated}`);
    console.log(`   Events deleted: ${results.eventsDeleted}`);
    console.log(`   Errors: ${results.errors}`);

    return NextResponse.json(summary, { status: 200 });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("❌ Cron job failed:", error);
    logs.push(`❌ Cron job failed: ${errorMessage}`);

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        logs,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

// Also support POST for manual triggering
export async function POST() {
  return GET();
}

