/**
 * Migration Script: Initialize Klaviyo Draw-Specific Properties
 *
 * OPTIMIZED: Only processes users who have participated in major draws.
 * This matches the cron job's optimized approach for consistency.
 *
 * One-time script to initialize draw-specific properties for existing users.
 * This should be run after deploying the draw-specific segmentation feature.
 *
 * Usage:
 *   npx tsx scripts/migrate-klaviyo-draw-properties.ts
 *
 * @module scripts/migrate-klaviyo-draw-properties
 */
import { config } from "dotenv";
import path from "path";

// Load environment variables from .env.local
config({ path: path.resolve(process.cwd(), ".env.local") });

// Verify Klaviyo configuration is loaded
console.log("\n🔍 Verifying Klaviyo configuration...");
console.log(`   KLAVIYO_PRIVATE_API_KEY: ${process.env.KLAVIYO_PRIVATE_API_KEY ? `Set (${process.env.KLAVIYO_PRIVATE_API_KEY.substring(0, 10)}...)` : "❌ NOT SET"}`);
console.log(`   KLAVIYO_ENABLED: ${process.env.KLAVIYO_ENABLED || "undefined (defaults to true)"}`);
console.log(`   KLAVIYO_MODE: ${process.env.KLAVIYO_MODE || "undefined (defaults to development)"}`);
console.log("");

import connectDB from "../src/lib/mongodb";
import User, { IUser } from "../src/models/User";
import MajorDraw from "../src/models/MajorDraw";
import mongoose from "mongoose";
import { syncUserProfileToKlaviyo } from "../src/utils/integrations/klaviyo/klaviyo-profile-sync";

/**
 * Main migration function
 */
async function migrateKlaviyoDrawProperties() {
  const startTime = Date.now();
  let processed = 0;
  let synced = 0;
  let errors = 0;
  const errorDetails: Array<{ userId: string; email: string; error: string }> = [];
  const syncedEmails: string[] = []; // Track successfully synced user emails

  try {
    console.log("🔄 Starting Klaviyo draw-specific properties migration...");
    console.log("📝 OPTIMIZED: Only processing users who have participated in major draws");
    await connectDB();

    // Log cutoff date information at start
    console.log("\n📅 Step 0: Getting cutoff date information...");
    const { getTargetDrawForCalculation } = await import(
      "../src/utils/integrations/klaviyo/klaviyo-draw-calculator"
    );
    const drawInfo = await getTargetDrawForCalculation();
    if (drawInfo) {
      console.log(`   Target Draw: ${drawInfo.targetDraw.name} (ID: ${drawInfo.targetDraw._id})`);
      console.log(`   Target Draw Status: ${drawInfo.targetDraw.status}`);
      console.log(`   Target Draw Activation: ${drawInfo.targetDraw.activationDate.toISOString()}`);
      console.log(`   Cutoff Date: ${drawInfo.cutoffDate.toISOString()}`);
      console.log(`   (This should be the previous draw's freezeEntriesAt)`);
      
      // Find and log previous draw info
      const MajorDraw = (await import("../src/models/MajorDraw")).default;
      const previousDraw = await MajorDraw.findOne({
        drawDate: { $lt: drawInfo.targetDraw.activationDate },
      })
        .sort({ drawDate: -1 })
        .select("name status drawDate freezeEntriesAt");
      
      if (previousDraw) {
        console.log(`   Previous Draw: ${previousDraw.name} (Status: ${previousDraw.status})`);
        console.log(`   Previous Draw Date: ${previousDraw.drawDate?.toISOString() || "N/A"}`);
        console.log(`   Previous Draw Freeze: ${previousDraw.freezeEntriesAt?.toISOString() || "N/A"}`);
      } else {
        console.log(`   Previous Draw: None found (using target draw's activationDate as cutoff)`);
      }
    } else {
      console.warn(`⚠️ Could not get target draw for calculation`);
    }
    console.log("");

    // ✅ OPTIMIZATION: Only process users who have participated in major draws
    // This matches the cron job's optimized approach for consistency
    console.log(`🔍 Finding users who have participated in major draws...`);
    
    // Find all major draws that have entries (active, frozen, or completed)
    const majorDrawsWithEntries = await MajorDraw.find({
      status: { $in: ["active", "frozen", "completed"] },
      "entries.0": { $exists: true }, // Has at least one entry
    }).select("entries.userId");

    // Extract all unique user IDs from all draws
    const userIdsWithEntries = new Set<string>();
    majorDrawsWithEntries.forEach((draw) => {
      if (draw.entries && draw.entries.length > 0) {
        draw.entries.forEach((entry: { userId: mongoose.Types.ObjectId | string }) => {
          const userId = entry.userId instanceof mongoose.Types.ObjectId 
            ? entry.userId.toString() 
            : String(entry.userId);
          userIdsWithEntries.add(userId);
        });
      }
    });

    const uniqueUserIds = Array.from(userIdsWithEntries);
    console.log(`📊 Found ${uniqueUserIds.length} unique users who have participated in major draws`);

    // Get total user count for comparison
    const totalUsers = await User.countDocuments({});
    const skippedUsers = totalUsers - uniqueUserIds.length;
    const reductionPercentage = totalUsers > 0 ? Math.round((skippedUsers / totalUsers) * 100) : 0;
    
    console.log(`   Total users: ${totalUsers}, Skipping: ${skippedUsers} non-participants (~${reductionPercentage}% reduction)`);

    if (uniqueUserIds.length === 0) {
      console.log(`⚠️ No users found with major draw entries - nothing to migrate`);
      process.exit(0);
    }

    // Convert to ObjectIds for MongoDB query
    const userIdsObjectIds = uniqueUserIds.map((id) => new mongoose.Types.ObjectId(id));

    // Query to find users by their IDs
    const participantsQuery = {
      _id: { $in: userIdsObjectIds },
    };

    // Process users in batches of 500
    const BATCH_SIZE = 500;
    let skip = 0;
    let hasMore = true;

    while (hasMore) {
      // ✅ OPTIMIZED: Fetch only users who have participated in major draws
      const users = await User.find(participantsQuery)
        .skip(skip)
        .limit(BATCH_SIZE)
        .lean();

      if (users.length === 0) {
        hasMore = false;
        break;
      }

      console.log(`📦 Processing batch: ${skip + 1} to ${skip + users.length} users`);

      // Process each user in the batch
      const syncPromises = users.map(async (user) => {
        try {
          // Calculate draw-specific properties first to log them
          const { calculateDrawSpecificPropertiesForUser } = await import(
            "../src/utils/integrations/klaviyo/klaviyo-draw-calculator"
          );
          const drawProps = await calculateDrawSpecificPropertiesForUser(user as IUser);
          
          // Log draw-specific properties for first user in batch and specific test user
          const userEmail = user.email || "unknown";
          if (skip === 0 && processed === 0) {
            console.log(`\n📊 Sample user draw-specific properties (${userEmail}):`);
            console.log(`   current_draw_id: ${drawProps?.current_draw_id || "undefined"}`);
            console.log(`   current_draw_name: ${drawProps?.current_draw_name || "undefined"}`);
            console.log(`   current_draw_start_date: ${drawProps?.current_draw_start_date || "undefined"}`);
            console.log(`   current_draw_subscription_active: ${drawProps?.current_draw_subscription_active}`);
            console.log(`   current_draw_one_time_packages: ${drawProps?.current_draw_one_time_packages}`);
            console.log(`   current_draw_entries: ${drawProps?.current_draw_entries ?? 0}`);
            
            // Show what will be sent to Klaviyo (after cleanProperties filtering)
            console.log(`\n📤 Properties that will be sent to Klaviyo:`);
            console.log(`   current_draw_id: ${drawProps?.current_draw_id ? `"${drawProps.current_draw_id}"` : "undefined (will be filtered)"}`);
            console.log(`   current_draw_name: ${drawProps?.current_draw_name ? `"${drawProps.current_draw_name}"` : "undefined (will be filtered)"}`);
            console.log(`   current_draw_start_date: ${drawProps?.current_draw_start_date ? `"${drawProps.current_draw_start_date}"` : "undefined (will be filtered)"}`);
            console.log(`   current_draw_subscription_active: ${drawProps?.current_draw_subscription_active ?? false} (always sent)`);
            console.log(`   current_draw_one_time_packages: ${drawProps?.current_draw_one_time_packages ?? 0} (always sent)`);
            console.log(`   current_draw_entries: ${drawProps?.current_draw_entries ?? 0} (always sent)`);
          }
          
          // Log for the specific test user
          if (userEmail === "renewalsub3@mail.com") {
            console.log(`\n🔍 DEBUG: Test user ${userEmail} draw-specific properties:`);
            console.log(`   Calculated Properties:`);
            console.log(`     current_draw_id: ${drawProps?.current_draw_id || "undefined"}`);
            console.log(`     current_draw_name: ${drawProps?.current_draw_name || "undefined"}`);
            console.log(`     current_draw_start_date: ${drawProps?.current_draw_start_date || "undefined"}`);
            console.log(`     current_draw_subscription_active: ${drawProps?.current_draw_subscription_active}`);
            console.log(`     current_draw_one_time_packages: ${drawProps?.current_draw_one_time_packages}`);
            console.log(`     current_draw_entries: ${drawProps?.current_draw_entries ?? 0}`);
            if (user.subscription) {
              console.log(`   User Subscription Details:`);
              console.log(`     startDate: ${user.subscription.startDate}`);
              console.log(`     isActive: ${user.subscription.isActive}`);
              // Show cutoff comparison
              if (drawInfo) {
                const subStart = new Date(user.subscription.startDate);
                const isAfterCutoff = subStart >= drawInfo.cutoffDate;
                console.log(`     Cutoff Date: ${drawInfo.cutoffDate.toISOString()}`);
                console.log(`     Subscription started after cutoff: ${isAfterCutoff ? "✅ YES" : "❌ NO"}`);
                console.log(`     Expected current_draw_subscription_active: ${user.subscription.isActive ? "true (active subscription)" : "false"}`);
              }
            }
          }
          
          // Sync profile to Klaviyo (will automatically calculate draw-specific properties)
          await syncUserProfileToKlaviyo(user as IUser);
          processed++;
          synced++;
          syncedEmails.push(userEmail);
          // Log every 10th user for progress tracking
          if (synced % 10 === 0) {
            console.log(`   ✅ Synced: ${userEmail} (${synced}/${uniqueUserIds.length})`);
          }
        } catch (error) {
          errors++;
          const errorMessage = error instanceof Error ? error.message : String(error);
          errorDetails.push({
            userId: String(user._id),
            email: user.email || "unknown",
            error: errorMessage,
          });
          console.error(`❌ Error processing user ${user.email}:`, errorMessage);
        }
      });

      // Wait for all syncs in this batch to complete
      await Promise.allSettled(syncPromises);

      // Log progress
      const progress = (skip + users.length) / uniqueUserIds.length * 100;
      console.log(`✅ Progress: ${(skip + users.length).toLocaleString()} / ${uniqueUserIds.length.toLocaleString()} (${progress.toFixed(1)}%)`);

      // Check if there are more users
      if (users.length < BATCH_SIZE) {
        hasMore = false;
      } else {
        skip += BATCH_SIZE;
      }
    }

    const duration = Date.now() - startTime;

    console.log("\n✅ Migration completed (OPTIMIZED - only draw participants):");
    console.log(`   Total participants found: ${uniqueUserIds.length.toLocaleString()} users`);
    console.log(`   Processed: ${processed.toLocaleString()} users`);
    console.log(`   Synced: ${synced.toLocaleString()} users`);
    console.log(`   Errors: ${errors.toLocaleString()} users`);
    console.log(`   Duration: ${(duration / 1000).toFixed(2)}s`);
    console.log(`   ⚡ Optimization: Skipped ${skippedUsers.toLocaleString()} non-participants (~${reductionPercentage}% reduction)`);

    // Log successfully synced user emails
    if (syncedEmails.length > 0) {
      console.log(`\n📧 Successfully synced ${syncedEmails.length} user(s):`);
      if (syncedEmails.length <= 50) {
        // Show all emails if 50 or fewer
        syncedEmails.forEach((email, index) => {
          console.log(`   ${index + 1}. ${email}`);
        });
      } else {
        // Show first 20 and last 10, with summary
        console.log(`   (Showing first 20 and last 10 of ${syncedEmails.length} total)`);
        syncedEmails.slice(0, 20).forEach((email, index) => {
          console.log(`   ${index + 1}. ${email}`);
        });
        console.log(`   ... (${syncedEmails.length - 30} more users) ...`);
        syncedEmails.slice(-10).forEach((email, index) => {
          console.log(`   ${syncedEmails.length - 9 + index}. ${email}`);
        });
      }
    }

    if (errors > 0) {
      console.log(`\n⚠️ ${errors} users had errors during migration`);
      console.log("First 10 errors:");
      errorDetails.slice(0, 10).forEach((error, index) => {
        console.log(`   ${index + 1}. ${error.email}: ${error.error}`);
      });
    }

    console.log("\n📋 Next steps:");
    console.log("   1. Verify in Klaviyo dashboard that profiles have draw-specific properties");
    console.log("   2. Check that Dec 27-29 purchases are correctly attributed to Draw 2");
    console.log("   3. Verify segments are working correctly");

    process.exit(0);
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`\n❌ Migration failed after ${(duration / 1000).toFixed(2)}s:`, errorMessage);
    console.error(error);
    process.exit(1);
  }
}

// Run migration
migrateKlaviyoDrawProperties();

