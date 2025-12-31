#!/usr/bin/env npx tsx

/**
 * Re-aggregate Daily Metrics
 * 
 * This script:
 * 1. Optionally deletes existing DailyMetrics (to start fresh with new logic)
 * 2. Re-aggregates metrics using the fixed date matching logic
 * 3. Only stores days with actual data
 * 
 * Usage:
 *   npx tsx scripts/re-aggregate-daily-metrics.ts [--delete-existing]
 * 
 * Options:
 *   --delete-existing: Delete all existing DailyMetrics before re-aggregating
 */

import mongoose from "mongoose";
import { config } from "dotenv";
import path from "path";
import { subMonths, startOfMonth, endOfMonth } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

// Load environment variables
config({ path: path.resolve(process.cwd(), ".env.local") });

// Import models and services
import connectDB from "@/lib/mongodb";
import { DailyMetricsService } from "@/services/metrics/DailyMetricsService";
import DailyMetrics from "@/models/DailyMetrics";

const dailyMetricsService = new DailyMetricsService();

async function reAggregateDailyMetrics() {
  try {
    const deleteExisting = process.argv.includes("--delete-existing");
    
    console.log("🔄 Starting Daily Metrics Re-aggregation...\n");

    // Connect to MongoDB
    await connectDB();
    console.log("✅ Connected to MongoDB\n");

    // Delete existing metrics if requested
    if (deleteExisting) {
      console.log("🗑️  Deleting existing DailyMetrics...");
      const deleteResult = await DailyMetrics.deleteMany({});
      console.log(`✅ Deleted ${deleteResult.deletedCount} existing entries\n`);
    } else {
      const existingCount = await DailyMetrics.countDocuments();
      console.log(`📊 Found ${existingCount} existing entries (will be updated if they exist)\n`);
    }

    // Get date range for last 3 months
    const today = new Date();
    const threeMonthsAgo = subMonths(today, 3);
    
    // Get start of 3 months ago and end of current month (both in AEST)
    const startYear = parseInt(formatInTimeZone(threeMonthsAgo, "Australia/Sydney", "yyyy"), 10);
    const startMonth = parseInt(formatInTimeZone(threeMonthsAgo, "Australia/Sydney", "M"), 10);
    const startDay = 1; // Start from first day of month
    
    const endYear = parseInt(formatInTimeZone(today, "Australia/Sydney", "yyyy"), 10);
    const endMonth = parseInt(formatInTimeZone(today, "Australia/Sydney", "M"), 10);
    const endDay = parseInt(formatInTimeZone(today, "Australia/Sydney", "d"), 10);
    
    // Create dates in AEST, then convert to UTC for queries
    const { createAESTDateAsUTC } = await import("@/utils/common/timezone");
    const startDate = createAESTDateAsUTC(startYear, startMonth, startDay, 0, 0);
    const endDate = createAESTDateAsUTC(endYear, endMonth, endDay, 23, 59);
    endDate.setUTCSeconds(59, 999);

    console.log(`📅 Re-aggregating metrics from ${formatInTimeZone(startDate, "Australia/Sydney", "yyyy-MM-dd")} to ${formatInTimeZone(endDate, "Australia/Sydney", "yyyy-MM-dd")} (AEST)\n`);

    // Re-aggregate using the fixed logic
    console.log("🔄 Aggregating daily metrics with fixed date matching logic...\n");
    await dailyMetricsService.ensureDailyMetricsAggregated(startDate, endDate);

    // Verify the data
    const metricsCount = await DailyMetrics.countDocuments({
      date: { $gte: startDate, $lte: endDate },
    });

    // Show sample of aggregated data
    const sampleMetrics = await DailyMetrics.find({
      date: { $gte: startDate, $lte: endDate },
    })
      .sort({ date: -1 })
      .limit(10)
      .lean();

    console.log(`\n✅ Successfully re-aggregated ${metricsCount} days of metrics\n`);
    
    if (sampleMetrics.length > 0) {
      console.log("📋 Sample of re-aggregated metrics (most recent 10):");
      for (const metric of sampleMetrics) {
        const metricDate = formatInTimeZone(metric.date, "Australia/Sydney", "yyyy-MM-dd");
        console.log(`   ${metricDate}: adSpend=$${metric.adSpend?.toFixed(2) || "0.00"}, revenue=$${metric.revenue?.toFixed(2) || "0.00"}, sales=${metric.salesCount || 0}, conversions=${metric.conversions || 0}`);
      }
    }

    console.log("\n✅ Re-aggregation complete!");
    console.log("\n💡 The new logic ensures:");
    console.log("   - Accurate date matching (no off-by-one day errors)");
    console.log("   - No duplicate entries");
    console.log("   - Only days with actual data are stored");
    console.log("   - Conversions are from daily insights only");

    process.exit(0);
  } catch (error) {
    console.error("❌ Error during re-aggregation:", error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
  }
}

// Run re-aggregation
reAggregateDailyMetrics();

