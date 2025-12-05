#!/usr/bin/env npx tsx

/**
 * Migration Script: Backfill lastMonthAccumulatedEntries
 *
 * This script backfills the lastMonthAccumulatedEntries field for existing users
 * who have active subscriptions but are missing this field.
 *
 * ASSUMPTION: All existing users registered during the 10x promo period,
 * so we set lastMonthAccumulatedEntries = baseEntries × 10
 *
 * PRODUCTION USAGE:
 * 1. Test on staging first: npx tsx scripts/migrate-accumulated-entries.ts
 * 2. Backup database before running in production
 * 3. Run in production: npx tsx scripts/migrate-accumulated-entries.ts
 * 4. Verify results before deploying new code
 *
 * Usage: npx tsx scripts/migrate-accumulated-entries.ts
 *        OR: npm run migrate:accumulated-entries
 */

import mongoose from "mongoose";
import { config } from "dotenv";
import path from "path";

// Load environment variables
config({ path: path.resolve(process.cwd(), ".env.local") });

// Import models
import User from "@/models/User";
import { getPackageById } from "@/data/membershipPackages";

// ✅ PROMO MULTIPLIER: All users registered during 10x promo
const PROMO_MULTIPLIER = 10;

interface MigrationStats {
  totalUsers: number;
  usersWithSubscriptions: number;
  usersNeedingMigration: number;
  usersMigrated: number;
  usersSkipped: number;
  errors: number;
  migrationDetails: Array<{
    email: string;
    packageId: string;
    baseEntries: number;
    lastMonthAccumulatedEntries: number;
  }>;
}

async function migrateAccumulatedEntries() {
  const stats: MigrationStats = {
    totalUsers: 0,
    usersWithSubscriptions: 0,
    usersNeedingMigration: 0,
    usersMigrated: 0,
    usersSkipped: 0,
    errors: 0,
    migrationDetails: [],
  };

  try {
    console.log("🔄 Starting Accumulated Entries Migration...\n");
    console.log(`📊 Assumption: All users registered during ${PROMO_MULTIPLIER}x promo\n`);

    // Detect environment
    const isProduction = process.env.NODE_ENV === "production";
    const environment = isProduction ? "PRODUCTION" : "STAGING/DEVELOPMENT";
    console.log(`🌍 Environment: ${environment}\n`);

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

    // ✅ SAFETY CHECK: Confirm before proceeding
    console.log("⚠️  WARNING: This will update database records!");
    console.log(`   ${stats.usersNeedingMigration} users will be migrated.\n`);
    console.log("   Press Ctrl+C to cancel, or wait 5 seconds to continue...\n");
    await new Promise((resolve) => setTimeout(resolve, 5000));

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

        if (baseEntries === 0) {
          console.log(`   ⚠️  Skipping user ${user.email}: Package has no base entries (${packageId})`);
          stats.usersSkipped++;
          continue;
        }

        // ✅ CALCULATION: lastMonthAccumulatedEntries = baseEntries × 10 (10x promo)
        // This represents what they accumulated in their first month with the promo
        const lastMonthAccumulatedEntries = baseEntries * PROMO_MULTIPLIER;

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

        // Store migration details for verification
        stats.migrationDetails.push({
          email: user.email,
          packageId: packageId,
          baseEntries: baseEntries,
          lastMonthAccumulatedEntries: lastMonthAccumulatedEntries,
        });

        console.log(
          `   ✅ Migrated user ${user.email}: lastMonthAccumulatedEntries = ${lastMonthAccumulatedEntries} (${baseEntries} base × ${PROMO_MULTIPLIER}x promo, package: ${membershipPackage.name})`
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

    // Print detailed migration results
    if (stats.migrationDetails.length > 0) {
      console.log("\n📋 Migration Details:");
      stats.migrationDetails.forEach((detail) => {
        console.log(
          `   ${detail.email}: ${detail.packageId} → ${detail.lastMonthAccumulatedEntries} (${detail.baseEntries} × ${PROMO_MULTIPLIER})`
        );
      });
    }

    if (stats.errors === 0 && stats.usersMigrated > 0) {
      console.log("\n✅ Migration completed successfully!");
      console.log("\n📝 Next Steps:");
      console.log("   1. Verify the migration results above");
      console.log("   2. Test a renewal for one of the migrated users");
      console.log("   3. Deploy the updated code with accumulated entries logic");
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
