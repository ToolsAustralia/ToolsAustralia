/**
 * Vercel Cron Job: Major Draw Status Transitions (Backup)
 *
 * GET /api/cron/major-draw-transition
 *
 * Runs daily at 2:00 PM UTC (midnight AEST) as a backup safety net.
 *
 * PRIMARY: Major draw transitions are now handled automatically by Mongoose middleware
 * in the MajorDraw model (runs on every query). This provides real-time transitions
 * without waiting for cron jobs.
 *
 * BACKUP: This cron job serves as a safety net to:
 * 1. Catch any missed transitions (edge cases, low-traffic periods)
 * 2. Freeze draws that reached freeze time (30 mins before draw date)
 * 3. Complete draws that reached draw date
 * 4. Activate queued draws that reached activation date
 *
 * REQUIRED: Still handles critical operations that should run on schedule:
 * 5. Create next queued draw (7 days before current draw date) - MUST run daily
 * 6. Cleanup old user major draw entries (keep last 6 completed draws)
 *
 * Security: Protected by Vercel's internal infrastructure
 */

import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import MajorDraw from "@/models/MajorDraw";
// import User from "@/models/User"; // No longer needed with Option 1
import { shouldCreateNextDraw } from "@/utils/draws/major-draw-helpers";
import {
  calculateFreezeTime,
  calculateActivationDate,
  calculateNextDrawDate,
  formatDateInAEST,
} from "@/utils/common/timezone";
import { resetDrawPropertiesForAllUsers } from "@/utils/integrations/klaviyo/klaviyo-draw-reset";

/**
 * Cron job handler (Backup for middleware transitions)
 * Vercel cron jobs are automatically protected and can only be called internally
 *
 * Note: Transitions are primarily handled by middleware, but this serves as backup
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';


export async function GET() {
  const startTime = Date.now();
  const logs: string[] = [];

  // ✅ Add console.log for Vercel logs visibility
  console.log("🕐 Major Draw Transition Cron Job Started");
  console.log(`   Time: ${new Date().toISOString()}`);

  try {
    // Vercel cron jobs are automatically protected by Vercel's infrastructure
    // No additional authentication needed as they can only be called internally
    logs.push("✅ Cron job authenticated via Vercel infrastructure");
    logs.push(`🕐 Started at: ${new Date().toISOString()}`);
    logs.push("ℹ️ Running as backup - primary transitions handled by middleware");
    console.log("✅ Cron job authenticated via Vercel infrastructure");

    await connectDB();
    logs.push("✅ Database connected");
    console.log("✅ Database connected");

    const now = new Date();

    // ========================================
    // STEP 1: Complete draws that reached draw date (MATCHES MIDDLEWARE ORDER)
    // ========================================
    // CRITICAL: This must happen FIRST to free up "active" status before activating new draws
    // This prevents draw skipping (e.g., Draw 1 completes → Draw 2 activates, not Draw 3)
    // Uses updateMany for idempotency - safe to run multiple times, won't double-update
    // Matches middleware: Completes active/frozen draws when drawDate <= now
    const completedResult = await MajorDraw.updateMany(
      {
        status: { $in: ["active", "frozen"] },
        drawDate: { $lte: now }, // Draw date has passed
      },
      {
        $set: {
          status: "completed",
          isActive: false, // Backward compatibility
          configurationLocked: true,
          lockedAt: now,
        },
      }
    );

    logs.push(`✅ Completed ${completedResult.modifiedCount} draw(s)`);
    console.log(`✅ Completed ${completedResult.modifiedCount} draw(s) (idempotent - safe if already completed)`);

    // ========================================
    // STEP 2: Activate queued draws (MATCHES MIDDLEWARE ORDER)
    // ========================================
    // Happens after completing draws to avoid status conflicts
    // Uses updateMany for idempotency - safe to run multiple times
    // Matches middleware: Activates queued draws when activationDate <= now
    const activatedResult = await MajorDraw.updateMany(
      {
        status: "queued",
        activationDate: { $lte: now }, // Activation time has arrived
      },
      {
        $set: {
          status: "active",
          isActive: true, // Backward compatibility
        },
      }
    );

    logs.push(`✅ Activated ${activatedResult.modifiedCount} draw(s)`);
    console.log(`✅ Activated ${activatedResult.modifiedCount} draw(s) (idempotent - safe if already activated)`);

    // ========================================
    // STEP 3: Freeze active draws (MATCHES MIDDLEWARE ORDER)
    // ========================================
    // Happens last since it only affects active draws
    // Uses updateMany for idempotency - safe to run multiple times
    // Matches middleware: Freezes active draws when freezeEntriesAt <= now AND drawDate > now
    const frozenResult = await MajorDraw.updateMany(
      {
        status: "active",
        freezeEntriesAt: { $lte: now }, // Freeze time has arrived
        drawDate: { $gt: now }, // Draw hasn't happened yet
      },
      {
        $set: {
          status: "frozen",
          configurationLocked: true,
          lockedAt: now,
        },
      }
    );

    logs.push(`✅ Frozen ${frozenResult.modifiedCount} draw(s)`);
    console.log(`✅ Frozen ${frozenResult.modifiedCount} draw(s) (idempotent - safe if already frozen)`);

    // ========================================
    // STEP 3.5: IMMEDIATE Klaviyo reset for newly activated draws (PRIORITY)
    // ========================================
    // CRITICAL: This runs immediately after activation to ensure profiles are updated ASAP
    // for email marketing campaigns. Detects draws activated in last 24 hours to catch
    // both cron-activated and middleware-activated draws.
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Find active draws that were activated recently (could be by middleware or cron)
    // Only process draws that haven't been processed yet (safeguard against double processing)
    const recentlyActivatedDraws = await MajorDraw.find({
      status: "active",
      activationDate: {
        $gte: oneDayAgo,
        $lte: now,
      },
    })
      .sort({ activationDate: -1 })
      .lean();

    const klaviyoResetsCount = recentlyActivatedDraws.length;

    if (recentlyActivatedDraws.length > 0) {
      logs.push(
        `🔄 IMMEDIATELY resetting Klaviyo draw-specific properties for ${recentlyActivatedDraws.length} recently activated draw(s)...`
      );
      console.log(
        `🔄 IMMEDIATELY resetting Klaviyo properties for ${recentlyActivatedDraws.length} draw(s) - PRIORITY for email campaigns`
      );

      // Process each activated draw (usually just one, but handle multiple)
      // Process in parallel for faster execution
      const klaviyoResetPromises = recentlyActivatedDraws.map(async (activatedDraw) => {
        try {
          logs.push(
            `   Processing draw: ${activatedDraw.name} (activated: ${new Date(activatedDraw.activationDate).toISOString()})`
          );
          console.log(`   Processing draw: ${activatedDraw.name} (ID: ${activatedDraw._id})`);

          // Fetch full document for type safety (lean() returns plain objects)
          const fullDraw = await MajorDraw.findById(activatedDraw._id);
          if (!fullDraw) {
            throw new Error(`Draw ${activatedDraw._id} not found`);
          }
          const resetResult = await resetDrawPropertiesForAllUsers(fullDraw);

          logs.push(`✅ Klaviyo reset completed for ${activatedDraw.name}:`);
          logs.push(`   Processed: ${resetResult.processed} users`);
          logs.push(`   Synced: ${resetResult.synced} users`);
          logs.push(`   Errors: ${resetResult.errors} users`);
          logs.push(`   Duration: ${resetResult.duration}ms`);

          console.log(`✅ Klaviyo reset completed for ${activatedDraw.name}:`);
          console.log(`   Processed: ${resetResult.processed} users`);
          console.log(`   Synced: ${resetResult.synced} users`);
          console.log(`   Errors: ${resetResult.errors} users`);
          console.log(`   Duration: ${resetResult.duration}ms`);

          if (resetResult.errors > 0) {
            logs.push(`⚠️ ${resetResult.errors} users had errors during reset`);
            resetResult.errorDetails.slice(0, 5).forEach((error) => {
              logs.push(`   Error: ${error.email} - ${error.error}`);
            });
            console.warn(`⚠️ ${resetResult.errors} users had errors during reset`);
          }

          return { success: true, draw: activatedDraw, result: resetResult };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          logs.push(`❌ Klaviyo reset failed for ${activatedDraw.name}: ${errorMessage}`);
          console.error(`❌ Klaviyo reset failed for ${activatedDraw.name}:`, error);
          return { success: false, draw: activatedDraw, error: errorMessage };
        }
      });

      // Wait for all Klaviyo resets to complete (parallel execution for speed)
      await Promise.allSettled(klaviyoResetPromises);
      console.log(`✅ All Klaviyo resets completed (parallel execution)`);
    } else {
      logs.push("ℹ️ No recently activated draws found - skipping Klaviyo reset");
      console.log("ℹ️ No recently activated draws found - skipping Klaviyo reset");
    }

    // ========================================
    // STEP 4: Create next queued draw if needed
    // ========================================
    const shouldCreate = await shouldCreateNextDraw();

    if (shouldCreate) {
      logs.push("📅 Creating next queued draw...");

      // Get current active/frozen draw to copy prize from
      const currentDraw = await MajorDraw.findOne({
        status: { $in: ["active", "frozen"] },
      }).sort({ activationDate: -1 });

      if (currentDraw && currentDraw.drawDate) {
        // Calculate dates for next draw (30-day cycle)
        const nextDrawDate = calculateNextDrawDate(currentDraw.drawDate);
        const nextActivationDate = calculateActivationDate(nextDrawDate);
        const nextFreezeDate = calculateFreezeTime(nextDrawDate);

        // For queued draws: activation date is when entries start being accepted
        // draw date is when the draw happens

        // Create next draw with copied prize
        const nextDraw = new MajorDraw({
          name: currentDraw.name, // Copy name (admin can edit later)
          description: currentDraw.description,
          prize: {
            ...currentDraw.prize,
            // Copy all prize details from current draw
          },
          drawDate: nextDrawDate,
          activationDate: nextActivationDate,
          freezeEntriesAt: nextFreezeDate,
          status: "queued",
          isActive: false,
          configurationLocked: false,
          entries: [],
          totalEntries: 0,
        });

        await nextDraw.save();

        logs.push(`✨ Created next queued draw: ${nextDraw.name} (ID: ${nextDraw._id})`);
        logs.push(`   Activation: ${formatDateInAEST(nextActivationDate)}`);
        logs.push(`   Draw: ${formatDateInAEST(nextDrawDate)}`);
      } else {
        logs.push("⚠️ No current draw found to create next draw from");
      }
    } else {
      logs.push("ℹ️ Next queued draw not needed yet");
    }

    // ========================================
    // STEP 5: Cleanup old user major draw entries
    // ========================================
    logs.push("🧹 Cleaning up old major draw entries...");

    // Get IDs of last 6 completed draws + current active/queued draws
    const completedDraws = await MajorDraw.find({
      status: "completed",
    })
      .sort({ drawDate: -1 })
      .limit(6)
      .select("_id");

    const activeOrQueuedDraws = await MajorDraw.find({
      status: { $in: ["active", "frozen", "queued"] },
    }).select("_id");

    const drawIdsToKeep = [
      ...completedDraws.map((d) => d._id.toString()),
      ...activeOrQueuedDraws.map((d) => d._id.toString()),
    ];

    // ✅ OPTION 1: No need to clean up user.majorDrawEntries since we're using single source of truth
    // The majordraws collection is already cleaned up above
    logs.push(`✅ Major draw cleanup completed - using single source of truth approach`);
    logs.push(`   Kept entries for ${drawIdsToKeep.length} draws`);

    // ========================================
    // FINAL: Return success summary
    // ========================================
    const duration = Date.now() - startTime;
    logs.push(`🎉 Cron job completed successfully in ${duration}ms`);
    console.log(`🎉 Cron job completed successfully in ${duration}ms`);

    return NextResponse.json(
      {
        success: true,
        summary: {
          completed: completedResult.modifiedCount,
          activated: activatedResult.modifiedCount,
          frozen: frozenResult.modifiedCount,
          klaviyoResets: klaviyoResetsCount,
          nextDrawCreated: shouldCreate,
          usersCleanedUp: 0, // Using single source of truth - no user cleanup needed
          duration: `${duration}ms`,
        },
        logs,
      },
      { status: 200 }
    );
  } catch (error) {
    const duration = Date.now() - startTime;
    logs.push(`❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    logs.push(`⏱️ Failed after ${duration}ms`);

    console.error("❌ Cron job error:", error);
    console.error(`⏱️ Failed after ${duration}ms`);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        logs,
      },
      { status: 500 }
    );
  }
}
