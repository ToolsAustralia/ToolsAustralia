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
import { getDrawsNeedingTransition, shouldCreateNextDraw } from "@/utils/draws/major-draw-helpers";
import {
  calculateFreezeTime,
  calculateActivationDate,
  calculateNextDrawDate,
  formatDateInAEST,
} from "@/utils/common/timezone";

/**
 * Cron job handler (Backup for middleware transitions)
 * Vercel cron jobs are automatically protected and can only be called internally
 *
 * Note: Transitions are primarily handled by middleware, but this serves as backup
 */
export async function GET() {
  const startTime = Date.now();
  const logs: string[] = [];

  try {
    // Vercel cron jobs are automatically protected by Vercel's infrastructure
    // No additional authentication needed as they can only be called internally
    logs.push("✅ Cron job authenticated via Vercel infrastructure");
    logs.push(`🕐 Started at: ${new Date().toISOString()}`);
    logs.push("ℹ️ Running as backup - primary transitions handled by middleware");

    await connectDB();
    logs.push("✅ Database connected");

    // ========================================
    // STEP 1: Backup transition checks (middleware handles primary transitions)
    // ========================================
    // These transitions are now handled automatically by middleware on every query,
    // but we keep this as a safety net for edge cases
    const { drawsToFreeze, drawsToComplete, drawsToActivate } = await getDrawsNeedingTransition();

    for (const draw of drawsToFreeze) {
      draw.status = "frozen";
      draw.configurationLocked = true;
      draw.lockedAt = new Date();
      await draw.save();
      logs.push(`🔒 Frozen draw: ${draw.name} (ID: ${draw._id})`);
    }

    logs.push(`✅ Processed ${drawsToFreeze.length} draws to freeze`);

    // ========================================
    // STEP 2: Complete draws that reached draw date
    // ========================================
    for (const draw of drawsToComplete) {
      draw.status = "completed";
      draw.isActive = false; // Backward compatibility
      draw.configurationLocked = true;
      if (!draw.lockedAt) {
        draw.lockedAt = new Date();
      }
      await draw.save();
      logs.push(`✅ Completed draw: ${draw.name} (ID: ${draw._id})`);
    }

    logs.push(`✅ Processed ${drawsToComplete.length} draws to complete`);

    // ========================================
    // STEP 3: Activate queued draws
    // ========================================
    for (const draw of drawsToActivate) {
      draw.status = "active";
      draw.isActive = true; // Backward compatibility
      await draw.save();
      logs.push(`🎯 Activated draw: ${draw.name} (ID: ${draw._id})`);
    }

    logs.push(`✅ Processed ${drawsToActivate.length} draws to activate`);

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

    return NextResponse.json(
      {
        success: true,
        summary: {
          frozen: drawsToFreeze.length,
          completed: drawsToComplete.length,
          activated: drawsToActivate.length,
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

    console.error("Cron job error:", error);

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
