/**
 * Cleanup Script: Remove Zero-Value Daily Metrics
 * 
 * This script removes DailyMetrics entries that have no actual data
 * (adSpend = 0 AND revenue = 0 AND salesCount = 0).
 * 
 * These entries may have been created before we implemented the
 * "only store days with data" logic, or from incorrect dateRange matching.
 * 
 * Usage:
 *   npx tsx scripts/cleanup-zero-daily-metrics.ts
 */

import mongoose from "mongoose";
import DailyMetrics from "@/models/DailyMetrics";
import connectDB from "@/lib/mongodb";

async function cleanupZeroDailyMetrics() {
  try {
    console.log("🔍 Connecting to database...\n");
    await connectDB();

    // Find all zero-value entries
    const zeroEntries = await DailyMetrics.find({
      $and: [
        { adSpend: 0 },
        { revenue: 0 },
        { salesCount: 0 },
      ],
    })
      .select("date adSpend revenue salesCount")
      .lean();

    console.log(`📊 Found ${zeroEntries.length} zero-value entries\n`);

    if (zeroEntries.length === 0) {
      console.log("✅ No zero-value entries to clean up!");
      process.exit(0);
    }

    // Show sample of what will be deleted
    console.log("📋 Sample entries to be deleted:");
    zeroEntries.slice(0, 10).forEach((entry) => {
      console.log(`   - ${entry.date.toISOString().split("T")[0]}: adSpend=$${entry.adSpend}, revenue=$${entry.revenue}, sales=${entry.salesCount}`);
    });
    if (zeroEntries.length > 10) {
      console.log(`   ... and ${zeroEntries.length - 10} more`);
    }

    console.log("\n🗑️  Deleting zero-value entries...");

    // Delete all zero-value entries
    const result = await DailyMetrics.deleteMany({
      $and: [
        { adSpend: 0 },
        { revenue: 0 },
        { salesCount: 0 },
      ],
    });

    console.log(`✅ Deleted ${result.deletedCount} zero-value entries\n`);

    // Verify cleanup
    const remainingZero = await DailyMetrics.countDocuments({
      $and: [
        { adSpend: 0 },
        { revenue: 0 },
        { salesCount: 0 },
      ],
    });

    if (remainingZero === 0) {
      console.log("✅ Cleanup complete! No zero-value entries remaining.");
    } else {
      console.log(`⚠️  Warning: ${remainingZero} zero-value entries still remain.`);
    }

    // Show summary of remaining entries
    const totalEntries = await DailyMetrics.countDocuments();
    const entriesWithData = await DailyMetrics.countDocuments({
      $or: [
        { adSpend: { $gt: 0 } },
        { revenue: { $gt: 0 } },
        { salesCount: { $gt: 0 } },
      ],
    });

    console.log(`\n📊 Summary:`);
    console.log(`   Total entries: ${totalEntries}`);
    console.log(`   Entries with data: ${entriesWithData}`);
    console.log(`   Zero-value entries: ${remainingZero}`);

    process.exit(0);
  } catch (error) {
    console.error("❌ Error during cleanup:", error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
  }
}

// Run cleanup
cleanupZeroDailyMetrics();

