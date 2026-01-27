/**
 * Klaviyo Draw Reset Service
 *
 * Handles bulk reset and recalculation of draw-specific properties when a new major draw activates.
 * Processes users in batches to avoid memory/timeout issues and handles errors gracefully.
 *
 * @module utils/integrations/klaviyo/klaviyo-draw-reset
 */

import connectDB from "@/lib/mongodb";
import User, { IUser } from "@/models/User";
import MajorDraw, { IMajorDraw } from "@/models/MajorDraw";
import mongoose from "mongoose";
import { syncUserProfileToKlaviyo } from "./klaviyo-profile-sync";
import { getTargetDrawForCalculation } from "./klaviyo-draw-calculator";

/**
 * Result of reset operation
 */
export interface ResetResult {
  processed: number;
  synced: number;
  errors: number;
  errorDetails: Array<{ userId: string; email: string; error: string }>;
  duration: number;
}

/**
 * Progress tracking for sync operations
 */
interface SyncProgress {
  isRunning: boolean;
  total: number;
  processed: number;
  synced: number;
  errors: number;
  currentUserEmail?: string;
  startTime?: number;
}

// In-memory progress tracker (only for manual syncs)
let syncProgress: SyncProgress | null = null;

/**
 * Preview result for Klaviyo reset
 */
export interface PreviewResult {
  targetDraw: { id: string; name: string; status: string; activationDate: Date };
  cutoffDate: Date;
  totalUsers: number;
  totalParticipants: number;
  skippedUsers: number;
  reductionPercentage: number;
  sampleUsers: Array<{ userId: string; email: string; name?: string }>;
}

/**
 * Get current sync progress (for manual syncs only)
 */
export function getSyncProgress(): SyncProgress | null {
  return syncProgress;
}

/**
 * Reset draw-specific properties for all users when a new draw activates
 *
 * OPTIMIZED: Only processes users who have participated in major draws (have entries in any draw).
 * This is more accurate than purchase-based filtering because:
 * - Only updates users who actually participated in draws
 * - Excludes users who purchased but didn't participate (e.g., purchased in Draw 1 but not Draw 2)
 * - Aligns with the purpose: resetting draw-specific properties for draw participants
 * This reduces API calls by ~80% (from 5k to ~1k users) while being more accurate.
 *
 * Process:
 * 1. Get target draw and cutoff date
 * 2. Find all users who have entries in any major draw (active, frozen, or completed)
 * 3. Process users in batches of 500 (only users who have participated in draws)
 * 4. For each batch:
 *    - Reset all users' draw-specific properties
 *    - Recalculate for users who purchased after cutoff date
 *    - Sync updated profiles to Klaviyo (batched with Promise.allSettled)
 * 5. Return summary with processed, synced, and error counts
 *
 * @param newDraw - The newly activated major draw (optional, will be fetched if not provided)
 * @param trackProgress - Whether to track progress for manual syncs (default: false)
 * @returns Summary of reset operation
 */
export async function resetDrawPropertiesForAllUsers(
  _newDraw?: IMajorDraw,
  trackProgress: boolean = false
): Promise<ResetResult> {
  const startTime = Date.now();
  let processed = 0;
  let synced = 0;
  let errors = 0;
  const errorDetails: Array<{ userId: string; email: string; error: string }> = [];

  try {
    await connectDB();

    // Get target draw and cutoff date
    const drawInfo = await getTargetDrawForCalculation();

    if (!drawInfo) {
      throw new Error("No target draw found for reset operation");
    }

    const { targetDraw, cutoffDate } = drawInfo;

    console.log(`🔄 Starting draw reset for draw: ${targetDraw.name} (ID: ${targetDraw._id})`);
    console.log(`📅 Cutoff date: ${cutoffDate.toISOString()}`);

    // ✅ OPTIMIZATION: Only process users who have participated in major draws
    // This is more accurate than purchase-based filtering because:
    // - Only updates users who actually participated in draws
    // - Excludes users who purchased in Draw 1 but didn't participate in Draw 2
    // - Aligns with purpose: resetting draw-specific properties for draw participants
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

    // If no users found, return early
    if (uniqueUserIds.length === 0) {
      console.log(`⚠️ No users found with major draw entries - skipping reset`);
      return {
        processed: 0,
        synced: 0,
        errors: 0,
        errorDetails: [],
        duration: Date.now() - startTime,
      };
    }

    // Convert to ObjectIds for MongoDB query
    const userIdsObjectIds = uniqueUserIds.map((id) => new mongoose.Types.ObjectId(id));

    // Query to find users by their IDs
    const participantsQuery = {
      _id: { $in: userIdsObjectIds },
    };

    // Get total counts for logging and optimization metrics
    const [totalParticipants, totalUsers] = await Promise.all([
      User.countDocuments(participantsQuery),
      User.countDocuments({}), // Total users
    ]);
    const skippedUsers = totalUsers - totalParticipants;
    const reductionPercentage = totalUsers > 0 ? Math.round((skippedUsers / totalUsers) * 100) : 0;
    
    console.log(`📊 Found ${totalParticipants} users with major draw participation (optimized query)`);
    console.log(`   Total users: ${totalUsers}, Skipping: ${skippedUsers} non-participants (~${reductionPercentage}% reduction)`);

    // Initialize progress tracking if requested
    if (trackProgress) {
      syncProgress = {
        isRunning: true,
        total: totalParticipants,
        processed: 0,
        synced: 0,
        errors: 0,
        startTime: Date.now(),
      };
    }

    // Process users in batches of 500 (for fetching from DB)
    const BATCH_SIZE = 500;
    // Process Klaviyo syncs in smaller concurrent batches to avoid rate limits
    // Klaviyo rate limit is typically 10 requests/second, so we use 5 concurrent to be safe
    const CONCURRENT_SYNC_LIMIT = 5;
    // Delay between batches to respect rate limits (milliseconds)
    const BATCH_DELAY_MS = 2000; // 2 seconds between batches
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
      console.log(`   ⚡ Rate limiting: Processing ${CONCURRENT_SYNC_LIMIT} users concurrently to avoid Klaviyo rate limits`);

      // Process users with rate limiting - split into smaller concurrent batches
      for (let i = 0; i < users.length; i += CONCURRENT_SYNC_LIMIT) {
        const concurrentBatch = users.slice(i, i + CONCURRENT_SYNC_LIMIT);
        
        // Process each user in the concurrent batch
        const syncPromises = concurrentBatch.map(async (user) => {
          const userEmail = user.email || "unknown";
          
          try {
            // Update progress tracking - show current user being processed
            if (trackProgress && syncProgress) {
              syncProgress.currentUserEmail = userEmail;
            }
            
            const currentProcessed = processed + 1; // For logging only
            console.log(`🔄 Syncing user: ${userEmail} (${currentProcessed}/${totalParticipants})`);
            
            // Sync to Klaviyo (this will update the profile with new draw-specific properties)
            // Note: draw-specific properties are calculated inside syncUserProfileToKlaviyo
            // via userToKlaviyoProfile -> calculateDrawSpecificPropertiesForUser
            await syncUserProfileToKlaviyo(user as IUser);

            // Increment counters after successful sync
            processed++;
            synced++;
            
            // Update progress tracking
            if (trackProgress && syncProgress) {
              syncProgress.processed = processed;
              syncProgress.synced = synced;
              syncProgress.currentUserEmail = userEmail; // Keep showing last synced user
            }
            
            console.log(`✅ Successfully synced user: ${userEmail} (${processed}/${totalParticipants})`);
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            
            // Increment counters after error
            processed++;
            errors++;
            
            // Update progress tracking
            if (trackProgress && syncProgress) {
              syncProgress.processed = processed;
              syncProgress.errors = errors;
              syncProgress.currentUserEmail = userEmail; // Keep showing last user (even if error)
            }
            
            errorDetails.push({
              userId: String(user._id),
              email: userEmail,
              error: errorMessage,
            });
            console.error(`❌ Error processing user ${userEmail} (${processed}/${totalParticipants}):`, errorMessage);
          }
        });

        // Wait for all syncs in this concurrent batch to complete
        await Promise.allSettled(syncPromises);
        
        // Add delay between concurrent batches to respect rate limits
        if (i + CONCURRENT_SYNC_LIMIT < users.length) {
          await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
        }
      }

      // Check if there are more users
      if (users.length < BATCH_SIZE) {
        hasMore = false;
      } else {
        skip += BATCH_SIZE;
      }
    }

    const duration = Date.now() - startTime;

    // Update final progress
    if (trackProgress && syncProgress) {
      syncProgress.processed = processed;
      syncProgress.synced = synced;
      syncProgress.errors = errors;
      syncProgress.currentUserEmail = undefined;
      syncProgress.isRunning = false;
      
      // Clear progress after a delay to allow final poll
      setTimeout(() => {
        syncProgress = null;
      }, 5000); // Keep progress for 5 seconds after completion
    }

    console.log(`✅ Draw reset completed (OPTIMIZED - only draw participants):`);
    console.log(`   Total participants found: ${totalParticipants} users`);
    console.log(`   Processed: ${processed} users`);
    console.log(`   Synced: ${synced} users`);
    console.log(`   Errors: ${errors} users`);
    console.log(`   Duration: ${duration}ms`);
    console.log(`   ⚡ Optimization: Skipped ${skippedUsers} non-participants (~${reductionPercentage}% reduction)`);

    return {
      processed,
      synced,
      errors,
      errorDetails: errorDetails.slice(0, 100), // Limit to first 100 errors for response size
      duration,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`❌ Draw reset failed after ${duration}ms:`, errorMessage);

    // Clear progress on error
    if (trackProgress) {
      syncProgress = null;
    }

    return {
      processed,
      synced,
      errors: errors + 1,
      errorDetails: [
        ...errorDetails,
        {
          userId: "system",
          email: "system",
          error: errorMessage,
        },
      ],
      duration,
    };
  }
}

/**
 * Get preview of users who will be synced to Klaviyo
 * Returns information about target draw, user counts, and sample users without actually syncing
 *
 * @returns Preview data including target draw info, user counts, and sample users
 */
export async function getUsersForKlaviyoResetPreview(): Promise<PreviewResult> {
  try {
    await connectDB();

    // Get target draw and cutoff date
    const drawInfo = await getTargetDrawForCalculation();

    if (!drawInfo) {
      throw new Error("No target draw found for preview");
    }

    const { targetDraw, cutoffDate } = drawInfo;

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

    // Convert to ObjectIds for MongoDB query
    const userIdsObjectIds = uniqueUserIds.map((id) => new mongoose.Types.ObjectId(id));

    // Query to find users by their IDs
    const participantsQuery = {
      _id: { $in: userIdsObjectIds },
    };

    // Get total counts
    const [totalParticipants, totalUsers] = await Promise.all([
      User.countDocuments(participantsQuery),
      User.countDocuments({}), // Total users
    ]);
    const skippedUsers = totalUsers - totalParticipants;
    const reductionPercentage = totalUsers > 0 ? Math.round((skippedUsers / totalUsers) * 100) : 0;

    // Get sample users (first 50) for preview
    const sampleUsers = await User.find(participantsQuery)
      .limit(50)
      .select("_id email firstName lastName")
      .lean();

    const sampleUsersFormatted = sampleUsers.map((user) => ({
      userId: String(user._id),
      email: user.email || "unknown",
      name: user.firstName && user.lastName 
        ? `${user.firstName} ${user.lastName}` 
        : user.firstName || user.lastName || undefined,
    }));

    return {
      targetDraw: {
        id: String(targetDraw._id),
        name: targetDraw.name,
        status: targetDraw.status,
        activationDate: targetDraw.activationDate,
      },
      cutoffDate,
      totalUsers,
      totalParticipants,
      skippedUsers,
      reductionPercentage,
      sampleUsers: sampleUsersFormatted,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`❌ Preview failed:`, errorMessage);
    throw error;
  }
}

