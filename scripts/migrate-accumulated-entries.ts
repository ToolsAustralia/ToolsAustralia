#!/usr/bin/env npx tsx

/**
 * Migration Script: Backfill lastMonthAccumulatedEntries
 *
 * This script backfills the lastMonthAccumulatedEntries field for existing users
 * who have active subscriptions but are missing this field.
 *
 * Since the app is only 6 days old, this migration may not be necessary,
 * but it's provided as a safety measure for any edge cases.
 *
 * Usage: npx tsx scripts/migrate-accumulated-entries.ts
 */

import mongoose from "mongoose";
import { config } from "dotenv";
import path from "path";

// Load environment variables
config({ path: path.resolve(process.cwd(), ".env.local") });

// Import models
import User from "@/models/User";
import { getPackageById } from "@/data/membershipPackages";

interface MigrationStats {
  totalUsers: number;
  usersWithSubscriptions: number;
  usersNeedingMigration: number;
  usersMigrated: number;
  usersSkipped: number;
  errors: number;
}

async function migrateAccumulatedEntries() {
  const stats: MigrationStats = {
    totalUsers: 0,
    usersWithSubscriptions: 0,
    usersNeedingMigration: 0,
    usersMigrated: 0,
    usersSkipped: 0,
    errors: 0,
  };

  try {
    console.log("🔄 Starting Accumulated Entries Migration...\n");

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI!);
    console.log("✅ Connected to MongoDB\n");

    // Find all users
    const allUsers = await User.find({});
    stats.totalUsers = allUsers.length;
    console.log(`📊 Total users in database: ${stats.totalUsers}\n`);

    // Filter users with active subscriptions
    const usersWithSubscriptions = allUsers.filter(
      (user) => user.subscription && user.subscription.isActive && user.subscription.packageId
    );
    stats.usersWithSubscriptions = usersWithSubscriptions.length;
    console.log(`📊 Users with active subscriptions: ${stats.usersWithSubscriptions}\n`);

    // Filter users needing migration (have subscription but missing lastMonthAccumulatedEntries)
    const usersNeedingMigration = usersWithSubscriptions.filter(
      (user) => user.subscription && user.subscription.lastMonthAccumulatedEntries === undefined
    );
    stats.usersNeedingMigration = usersNeedingMigration.length;
    console.log(`📊 Users needing migration: ${stats.usersNeedingMigration}\n`);

    if (usersNeedingMigration.length === 0) {
      console.log("✅ No users need migration. All users already have lastMonthAccumulatedEntries set.\n");
      await mongoose.disconnect();
      return;
    }

    console.log("🔄 Starting migration process...\n");

    // Process each user
    for (const user of usersNeedingMigration) {
      try {
        if (!user.subscription || !user.subscription.packageId) {
          console.log(`   ⚠️  Skipping user ${user.email}: Invalid subscription data`);
          stats.usersSkipped++;
          continue;
        }

        const packageId = user.subscription.packageId.toString();
        const membershipPackage = getPackageById(packageId);

        if (!membershipPackage) {
          console.log(`   ⚠️  Skipping user ${user.email}: Package not found (${packageId})`);
          stats.usersSkipped++;
          continue;
        }

        const baseEntries = membershipPackage.entriesPerMonth || 0;

        // Calculate lastMonthAccumulatedEntries from current accumulatedEntries
        // Strategy: Use current accumulatedEntries if available, otherwise use baseEntries
        let lastMonthAccumulatedEntries: number;

        if (user.accumulatedEntries && user.accumulatedEntries > 0) {
          // If user has accumulated entries, use that as the last month's value
          // This assumes they've had at least one renewal
          lastMonthAccumulatedEntries = user.accumulatedEntries;
        } else {
          // If no accumulated entries, assume this is their first month
          // Set to base entries (no promo applied in migration)
          lastMonthAccumulatedEntries = baseEntries;
        }

        // Update user atomically
        await User.findByIdAndUpdate(
          user._id,
          {
            $set: {
              "subscription.lastMonthAccumulatedEntries": lastMonthAccumulatedEntries,
            },
          },
          { new: false }
        );

        console.log(
          `   ✅ Migrated user ${user.email}: lastMonthAccumulatedEntries = ${lastMonthAccumulatedEntries} (package: ${membershipPackage.name}, baseEntries: ${baseEntries})`
        );
        stats.usersMigrated++;
      } catch (error) {
        console.error(`   ❌ Error migrating user ${user.email}:`, error);
        stats.errors++;
      }
    }

    // Print summary
    console.log("\n📊 Migration Summary:");
    console.log(`   Total users: ${stats.totalUsers}`);
    console.log(`   Users with subscriptions: ${stats.usersWithSubscriptions}`);
    console.log(`   Users needing migration: ${stats.usersNeedingMigration}`);
    console.log(`   Users migrated: ${stats.usersMigrated}`);
    console.log(`   Users skipped: ${stats.usersSkipped}`);
    console.log(`   Errors: ${stats.errors}`);

    if (stats.errors === 0 && stats.usersMigrated > 0) {
      console.log("\n✅ Migration completed successfully!");
    } else if (stats.errors > 0) {
      console.log("\n⚠️  Migration completed with errors. Please review the logs above.");
    } else {
      console.log("\n✅ No migration needed.");
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
migrateAccumulatedEntries()
  .then(() => {
    console.log("\n✅ Script completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Script failed:", error);
    process.exit(1);
  });
