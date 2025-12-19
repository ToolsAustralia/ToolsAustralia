#!/usr/bin/env npx tsx

/**
 * Migration Script: Update packageType from "subscription" to "membership"
 *
 * This script migrates all payment-related packageType fields from "subscription" to "membership"
 * to establish a single source of truth and eliminate confusion.
 *
 * AFFECTED COLLECTIONS:
 * 1. PaymentEvent collection - packageType field
 * 2. User.partnerDiscountQueue array - packageType field in nested documents
 *
 * PRODUCTION USAGE:
 * 1. Test on staging first: npx tsx scripts/migrate-package-type-subscription-to-membership.ts
 * 2. Backup database before running in production
 * 3. Run in production: npx tsx scripts/migrate-package-type-subscription-to-membership.ts
 * 4. Verify results after migration
 *
 * Usage: npx tsx scripts/migrate-package-type-subscription-to-membership.ts [--dry-run]
 *        OR: npm run migrate:package-type
 */

import mongoose from "mongoose";
import { config } from "dotenv";
import path from "path";

// Load environment variables
config({ path: path.resolve(process.cwd(), ".env.local") });

// Import models
import PaymentEvent from "@/models/PaymentEvent";
import User from "@/models/User";

// Check for dry-run mode
const isDryRun = process.argv.includes("--dry-run") || process.argv.includes("-d");

interface MigrationStats {
  // PaymentEvent stats
  paymentEventTotal: number;
  paymentEventAffected: number;
  paymentEventUpdated: number;
  paymentEventErrors: number;
  paymentEventSamples: Array<{
    _id: string;
    userId: string;
    packageType: string;
    eventType: string;
  }>;

  // User.partnerDiscountQueue stats
  usersWithQueue: number;
  queueItemsAffected: number;
  queueItemsUpdated: number;
  queueItemsErrors: number;
  queueSamples: Array<{
    userId: string;
    email: string;
    queueItemCount: number;
  }>;
}

async function migratePackageType() {
  const stats: MigrationStats = {
    paymentEventTotal: 0,
    paymentEventAffected: 0,
    paymentEventUpdated: 0,
    paymentEventErrors: 0,
    paymentEventSamples: [],
    usersWithQueue: 0,
    queueItemsAffected: 0,
    queueItemsUpdated: 0,
    queueItemsErrors: 0,
    queueSamples: [],
  };

  try {
    console.log("🔄 Starting PackageType Migration: subscription → membership\n");
    console.log(`📋 Mode: ${isDryRun ? "DRY RUN (no changes will be made)" : "LIVE (will update database)"}\n`);

    // Detect environment
    const isProduction = process.env.NODE_ENV === "production";
    const environment = isProduction ? "PRODUCTION" : "STAGING/DEVELOPMENT";
    console.log(`🌍 Environment: ${environment}\n`);

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI!);
    console.log("✅ Connected to MongoDB\n");

    // ==========================================
    // PHASE 1: PaymentEvent Collection
    // ==========================================
    console.log("📊 Phase 1: Analyzing PaymentEvent collection...\n");

    // Count total PaymentEvents
    stats.paymentEventTotal = await PaymentEvent.countDocuments({});
    console.log(`   Total PaymentEvent records: ${stats.paymentEventTotal}`);

    // Count affected PaymentEvents (packageType === "subscription")
    stats.paymentEventAffected = await PaymentEvent.countDocuments({ packageType: "subscription" });
    console.log(`   PaymentEvents with packageType="subscription": ${stats.paymentEventAffected}`);

    // Get sample records for verification
    if (stats.paymentEventAffected > 0) {
      const samples = await PaymentEvent.find({ packageType: "subscription" })
        .limit(5)
        .select("_id userId packageType eventType")
        .lean();
      stats.paymentEventSamples = samples.map((s) => ({
        _id: s._id,
        userId: s.userId.toString(),
        packageType: s.packageType,
        eventType: s.eventType,
      }));
      console.log(`   Sample affected records: ${stats.paymentEventSamples.length}`);
    }

    console.log("");

    // ==========================================
    // PHASE 2: User.partnerDiscountQueue Array
    // ==========================================
    console.log("📊 Phase 2: Analyzing User.partnerDiscountQueue array...\n");

    // Count users with partnerDiscountQueue
    const usersWithQueue = await User.countDocuments({ partnerDiscountQueue: { $exists: true, $ne: [] } });
    stats.usersWithQueue = usersWithQueue;
    console.log(`   Users with partnerDiscountQueue: ${stats.usersWithQueue}`);

    // Count affected queue items (packageType === "subscription")
    // We need to aggregate to count nested array items
    const queueAggregation = await User.aggregate([
      { $match: { "partnerDiscountQueue.packageType": "subscription" } },
      { $unwind: "$partnerDiscountQueue" },
      { $match: { "partnerDiscountQueue.packageType": "subscription" } },
      { $count: "total" },
    ]);

    stats.queueItemsAffected = queueAggregation[0]?.total || 0;
    console.log(`   Queue items with packageType="subscription": ${stats.queueItemsAffected}`);

    // Get sample users for verification
    if (stats.queueItemsAffected > 0) {
      const sampleUsers = await User.find({ "partnerDiscountQueue.packageType": "subscription" })
        .limit(5)
        .select("_id email partnerDiscountQueue")
        .lean();

      stats.queueSamples = sampleUsers.map((user) => {
        // Type assertion for lean() query result
        type QueueItem = { packageType: string };
        const queueItems = (user.partnerDiscountQueue as QueueItem[] | undefined) || [];
        const affectedItems = queueItems.filter((item) => item.packageType === "subscription");
        return {
          userId: user._id.toString(),
          email: user.email || "unknown",
          queueItemCount: affectedItems.length,
        };
      });
      console.log(`   Sample affected users: ${stats.queueSamples.length}`);
    }

    console.log("");

    // ==========================================
    // PHASE 3: Summary and Confirmation
    // ==========================================
    console.log("📊 Migration Summary:\n");
    console.log(`   PaymentEvent records to update: ${stats.paymentEventAffected}`);
    console.log(`   User.partnerDiscountQueue items to update: ${stats.queueItemsAffected}`);
    console.log(`   Total records affected: ${stats.paymentEventAffected + stats.queueItemsAffected}\n`);

    if (stats.paymentEventAffected === 0 && stats.queueItemsAffected === 0) {
      console.log("✅ No records need migration. All packageType values are already 'membership'.\n");
      await mongoose.disconnect();
      return;
    }

    // Show sample records
    if (stats.paymentEventSamples.length > 0) {
      console.log("📋 Sample PaymentEvent records to be updated:");
      stats.paymentEventSamples.forEach((sample, idx) => {
        console.log(
          `   ${idx + 1}. ID: ${sample._id}, User: ${sample.userId}, Type: ${sample.packageType}, Event: ${
            sample.eventType
          }`
        );
      });
      console.log("");
    }

    if (stats.queueSamples.length > 0) {
      console.log("📋 Sample User.partnerDiscountQueue items to be updated:");
      stats.queueSamples.forEach((sample, idx) => {
        console.log(`   ${idx + 1}. User: ${sample.email} (${sample.userId}), Queue items: ${sample.queueItemCount}`);
      });
      console.log("");
    }

    // Safety check for live mode
    if (!isDryRun) {
      console.log("⚠️  WARNING: This will update database records!");
      console.log(`   ${stats.paymentEventAffected} PaymentEvent records will be updated`);
      console.log(`   ${stats.queueItemsAffected} User.partnerDiscountQueue items will be updated`);
      console.log(`   Total: ${stats.paymentEventAffected + stats.queueItemsAffected} records\n`);
      console.log("   Press Ctrl+C to cancel, or wait 5 seconds to continue...\n");
      await new Promise((resolve) => setTimeout(resolve, 5000));
    } else {
      console.log("ℹ️  DRY RUN MODE: No changes will be made. Remove --dry-run flag to execute migration.\n");
    }

    // ==========================================
    // PHASE 4: Execute Migration
    // ==========================================
    if (isDryRun) {
      console.log("✅ Dry run completed. No changes made.\n");
      await mongoose.disconnect();
      return;
    }

    console.log("🔄 Starting migration process...\n");

    // Update PaymentEvent collection
    if (stats.paymentEventAffected > 0) {
      console.log("📝 Updating PaymentEvent collection...");
      try {
        const result = await PaymentEvent.updateMany(
          { packageType: "subscription" },
          { $set: { packageType: "membership" } }
        );
        stats.paymentEventUpdated = result.modifiedCount;
        console.log(`   ✅ Updated ${stats.paymentEventUpdated} PaymentEvent records\n`);
      } catch (error) {
        console.error(`   ❌ Error updating PaymentEvent collection:`, error);
        stats.paymentEventErrors++;
      }
    }

    // Update User.partnerDiscountQueue array
    if (stats.queueItemsAffected > 0) {
      console.log("📝 Updating User.partnerDiscountQueue array...");
      try {
        // Use arrayFilters to update nested array items
        const result = await User.updateMany(
          { "partnerDiscountQueue.packageType": "subscription" },
          { $set: { "partnerDiscountQueue.$[elem].packageType": "membership" } },
          {
            arrayFilters: [{ "elem.packageType": "subscription" }],
          }
        );
        stats.queueItemsUpdated = result.modifiedCount;
        console.log(`   ✅ Updated ${stats.queueItemsUpdated} users (affecting queue items)\n`);
      } catch (error) {
        console.error(`   ❌ Error updating User.partnerDiscountQueue:`, error);
        stats.queueItemsErrors++;
      }
    }

    // ==========================================
    // PHASE 5: Verification
    // ==========================================
    console.log("🔍 Verifying migration results...\n");

    // Verify PaymentEvent
    const remainingPaymentEvents = await PaymentEvent.countDocuments({ packageType: "subscription" });
    if (remainingPaymentEvents === 0) {
      console.log("   ✅ PaymentEvent: No 'subscription' values remaining");
    } else {
      console.log(`   ⚠️  PaymentEvent: ${remainingPaymentEvents} records still have packageType='subscription'`);
    }

    // Verify User.partnerDiscountQueue
    const remainingQueueItems = await User.aggregate([
      { $match: { "partnerDiscountQueue.packageType": "subscription" } },
      { $unwind: "$partnerDiscountQueue" },
      { $match: { "partnerDiscountQueue.packageType": "subscription" } },
      { $count: "total" },
    ]);
    const remainingCount = remainingQueueItems[0]?.total || 0;
    if (remainingCount === 0) {
      console.log("   ✅ User.partnerDiscountQueue: No 'subscription' values remaining");
    } else {
      console.log(`   ⚠️  User.partnerDiscountQueue: ${remainingCount} items still have packageType='subscription'`);
    }

    console.log("");

    // ==========================================
    // PHASE 6: Final Summary
    // ==========================================
    console.log("📊 Final Migration Summary:\n");
    console.log("   PaymentEvent Collection:");
    console.log(`      Total records: ${stats.paymentEventTotal}`);
    console.log(`      Records updated: ${stats.paymentEventUpdated}`);
    console.log(`      Errors: ${stats.paymentEventErrors}`);
    console.log("");
    console.log("   User.partnerDiscountQueue:");
    console.log(`      Users with queue: ${stats.usersWithQueue}`);
    console.log(`      Users updated: ${stats.queueItemsUpdated}`);
    console.log(`      Errors: ${stats.queueItemsErrors}`);
    console.log("");

    if (
      stats.paymentEventErrors === 0 &&
      stats.queueItemsErrors === 0 &&
      remainingPaymentEvents === 0 &&
      remainingCount === 0
    ) {
      console.log("✅ Migration completed successfully!\n");
      console.log("📝 Next Steps:");
      console.log("   1. Verify the migration results above");
      console.log("   2. Check admin dashboards display correctly");
      console.log("   3. Verify payment history shows correctly");
      console.log("   4. Test partner discount queue functionality");
      console.log("   5. Monitor error logs for 24-48 hours");
    } else {
      console.log("⚠️  Migration completed with issues. Please review the logs above.");
      if (remainingPaymentEvents > 0 || remainingCount > 0) {
        console.log("   Some records may need manual review.");
      }
    }
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("\n✅ Disconnected from MongoDB");
  }
}

// Run migration
migratePackageType()
  .then(() => {
    console.log("\n✅ Script completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Script failed:", error);
    process.exit(1);
  });
