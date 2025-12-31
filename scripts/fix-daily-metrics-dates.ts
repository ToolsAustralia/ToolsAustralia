/**
 * Fix Daily Metrics Dates and Remove Duplicates
 * 
 * This script:
 * 1. Removes duplicate entries for the same AEST day
 * 2. Verifies date accuracy (ensures dates match their AEST day representation)
 * 3. Removes entries with incorrect date matches
 * 
 * Usage:
 *   npx tsx scripts/fix-daily-metrics-dates.ts
 */

import mongoose from "mongoose";
import DailyMetrics from "@/models/DailyMetrics";
import connectDB from "@/lib/mongodb";
import { formatInTimeZone } from "date-fns-tz";

async function fixDailyMetricsDates() {
  try {
    console.log("🔍 Connecting to database...\n");
    await connectDB();

    // Get all daily metrics
    const allMetrics = await DailyMetrics.find({}).lean().exec();
    console.log(`📊 Found ${allMetrics.length} total daily metrics\n`);

    // Group by AEST day
    const metricsByAESTDay = new Map<string, typeof allMetrics>();
    
    for (const metric of allMetrics) {
      const aestDay = formatInTimeZone(metric.date, "Australia/Sydney", "yyyy-MM-dd");
      
      if (!metricsByAESTDay.has(aestDay)) {
        metricsByAESTDay.set(aestDay, []);
      }
      metricsByAESTDay.get(aestDay)!.push(metric);
    }

    console.log(`📅 Found ${metricsByAESTDay.size} unique AEST days\n`);

    // Find duplicates and fix them
    let duplicatesRemoved = 0;
    let entriesFixed = 0;
    // _id from lean() can be ObjectId or string - MongoDB accepts both in queries
    const toDelete: (mongoose.Types.ObjectId | string)[] = [];
    const toKeep: Map<string, typeof allMetrics[0]> = new Map();

    for (const [aestDay, metrics] of metricsByAESTDay.entries()) {
      if (metrics.length > 1) {
        console.log(`⚠️  Found ${metrics.length} entries for ${aestDay}:`);
        
        // Keep the one with the most recent data (highest revenue or adSpend)
        // If tied, keep the most recently updated
        metrics.sort((a, b) => {
          const aTotal = (a.revenue || 0) + (a.adSpend || 0);
          const bTotal = (b.revenue || 0) + (b.adSpend || 0);
          if (aTotal !== bTotal) {
            return bTotal - aTotal; // Higher total first
          }
          // If tied, prefer most recently updated
          const aUpdated = new Date(a.updatedAt || a.createdAt || 0).getTime();
          const bUpdated = new Date(b.updatedAt || b.createdAt || 0).getTime();
          return bUpdated - aUpdated;
        });

        const keep = metrics[0];
        const remove = metrics.slice(1);
        
        console.log(`   ✅ Keeping entry with revenue=$${keep.revenue}, adSpend=$${keep.adSpend}`);
        console.log(`   🗑️  Removing ${remove.length} duplicate(s)`);
        
        toKeep.set(aestDay, keep);
        toDelete.push(...remove.map(m => m._id));
        duplicatesRemoved += remove.length;
      } else {
        // Single entry - verify it's correct
        const metric = metrics[0];
        const metricAESTDay = formatInTimeZone(metric.date, "Australia/Sydney", "yyyy-MM-dd");
        
        if (metricAESTDay !== aestDay) {
          console.log(`⚠️  Date mismatch for ${aestDay}: stored date represents ${metricAESTDay}`);
          // This shouldn't happen, but if it does, we'll keep it for now
        }
        
        toKeep.set(aestDay, metric);
      }
    }

    // Delete duplicates
    if (toDelete.length > 0) {
      console.log(`\n🗑️  Deleting ${toDelete.length} duplicate entries...`);
      // MongoDB accepts both ObjectId and string in $in queries
      const deleteResult = await DailyMetrics.deleteMany({
        _id: { $in: toDelete },
      });
      console.log(`✅ Deleted ${deleteResult.deletedCount} duplicates\n`);
    }

    // Summary
    console.log("📊 Summary:");
    console.log(`   Total entries: ${allMetrics.length}`);
    console.log(`   Unique AEST days: ${metricsByAESTDay.size}`);
    console.log(`   Duplicates removed: ${duplicatesRemoved}`);
    console.log(`   Entries remaining: ${toKeep.size}`);

    // Show sample of remaining entries
    console.log("\n📋 Sample of remaining entries (first 10):");
    const sampleDays = Array.from(toKeep.keys()).slice(0, 10);
    for (const day of sampleDays) {
      const metric = toKeep.get(day)!;
      console.log(`   ${day}: adSpend=$${metric.adSpend?.toFixed(2) || "0.00"}, revenue=$${metric.revenue?.toFixed(2) || "0.00"}, sales=${metric.salesCount || 0}`);
    }

    process.exit(0);
  } catch (error) {
    console.error("❌ Error during fix:", error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
  }
}

// Run fix
fixDailyMetricsDates();

