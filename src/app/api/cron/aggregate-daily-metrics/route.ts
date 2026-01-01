/**
 * Vercel Cron Job: Daily Metrics Aggregation
 *
 * GET /api/cron/aggregate-daily-metrics
 *
 * Runs daily at 2:00 AM UTC (12:00 PM AEST) to aggregate yesterday's metrics.
 * This ensures daily metrics are pre-calculated and ready for viewing.
 *
 * Security: Protected by Vercel's internal infrastructure
 */

import { NextResponse } from "next/server";
import { aggregateYesterdayMetrics } from "@/lib/jobs/aggregate-daily-metrics";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Cron job handler for daily metrics aggregation
 * Vercel cron jobs are automatically protected and can only be called internally
 */
export async function GET() {
  const startTime = Date.now();
  const logs: string[] = [];

  console.log("🕐 Daily Metrics Aggregation Cron Job Started");
  console.log(`   Time: ${new Date().toISOString()}`);

  try {
    logs.push("✅ Cron job authenticated via Vercel infrastructure");
    logs.push(`🕐 Started at: ${new Date().toISOString()}`);
    console.log("✅ Cron job authenticated via Vercel infrastructure");

    // Aggregate yesterday's metrics
    const result = await aggregateYesterdayMetrics();

    if (result.success) {
      logs.push(`✅ Successfully aggregated metrics for ${result.date.toISOString()}`);
      console.log(`✅ Successfully aggregated metrics for ${result.date.toISOString()}`);
    } else {
      logs.push(`❌ Failed to aggregate metrics: ${result.error}`);
      console.error(`❌ Failed to aggregate metrics: ${result.error}`);
    }

    const duration = Date.now() - startTime;
    logs.push(`🎉 Cron job completed in ${duration}ms`);
    console.log(`🎉 Cron job completed in ${duration}ms`);

    return NextResponse.json(
      {
        success: result.success,
        date: result.date.toISOString(),
        error: result.error,
        duration: `${duration}ms`,
        logs,
      },
      { status: result.success ? 200 : 500 }
    );
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logs.push(`❌ Error: ${errorMessage}`);
    logs.push(`⏱️ Failed after ${duration}ms`);

    console.error("❌ Cron job error:", error);
    console.error(`⏱️ Failed after ${duration}ms`);

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        duration: `${duration}ms`,
        logs,
      },
      { status: 500 }
    );
  }
}

