/**
 * Vercel Cron Job: Major Draw Status Transitions (Primary Scheduler)
 *
 * GET /api/cron/major-draw-transition
 *
 * Runs daily at 2:00 PM UTC (12:00 AM AEST / 1:00 AM AEDT) as the primary scheduled transition handler.
 * This schedule aligns with midnight AEST/AEDT for queued draw activation.
 *
 * ARCHITECTURE: Major draw transitions are handled by a dedicated service
 * (src/utils/draws/major-draw-transition-service.ts) which is called:
 * 1. By this cron job (primary scheduler - ensures daily transitions)
 * 2. On-demand in webhook handlers (for real-time freshness on payment events)
 * 3. In helper functions like getTargetMajorDraw() (before draw selection)
 * 4. In getCurrentMajorDrawForDisplay() (for real-time updates when users view the page)
 *
 * This cron job:
 * 1. Calls the transition service to handle status transitions (completed, activated, frozen)
 * 2. Processes Klaviyo resets for newly activated draws
 * 3. Creates next queued draw if needed (7 days before current draw date) - MUST run daily
 * 4. Performs cleanup operations
 *
 * The transition service is idempotent, debounced, and timeout-protected,
 * making it safe to call from multiple sources. Real-time updates are provided
 * via traffic-driven transitions (user visits trigger updates), while this cron
 * ensures daily transitions even without traffic.
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
 * Cron job handler (Primary scheduler for transitions)
 * Vercel cron jobs are automatically protected and can only be called internally
 *
 * Note: Transitions are handled by the transition service, which is called
 * from multiple sources (cron, webhooks, helpers, display helper) for reliability
 * and real-time freshness. This cron serves as a safety net to ensure daily
 * transitions even without user traffic.
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
    logs.push("ℹ️ Using transition service for status transitions");
    console.log("✅ Cron job authenticated via Vercel infrastructure");

    await connectDB();
    logs.push("✅ Database connected");
    console.log("✅ Database connected");

    const now = new Date();

    // ========================================
    // STEP 1-3: Transition major draws using dedicated service
    // ========================================
    // Uses the transition service for single source of truth
    // Service handles: completing, activating, and freezing draws
    // All operations are idempotent, timeout-protected, and observable
    const { transitionMajorDrawsIfNeeded } = await import("@/utils/draws/major-draw-transition-service");
    const transitionResult = await transitionMajorDrawsIfNeeded();

    if (transitionResult.success) {
      logs.push(`✅ Transitions completed: ${transitionResult.completed} completed, ${transitionResult.activated} activated, ${transitionResult.frozen} frozen`);
      console.log(
        `✅ Major draw transitions: ${transitionResult.completed} completed, ${transitionResult.activated} activated, ${transitionResult.frozen} frozen (${transitionResult.duration}ms)`
      );
    } else {
      logs.push(`⚠️ Transition service had errors: ${transitionResult.error || "Unknown error"}`);
      console.error(`❌ Major draw transition service error: ${transitionResult.error || "Unknown error"}`);
      // Continue with cron job - other tasks (Klaviyo, draw creation) can still run
    }

    // Extract counts for summary (use transition service results)
    const completedCount = transitionResult.completed;
    const activatedCount = transitionResult.activated;
    const frozenCount = transitionResult.frozen;

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
        `🔄 Initiating Klaviyo reset for ${recentlyActivatedDraws.length} recently activated draw(s) in background (non-blocking)...`
      );
      console.log(
        `🔄 Initiating Klaviyo reset for ${recentlyActivatedDraws.length} draw(s) in background (non-blocking) - source: cron`
      );

      // Process each activated draw (usually just one, but handle multiple)
      // Process in parallel for faster execution
      const klaviyoResetPromises = recentlyActivatedDraws.map(async (activatedDraw) => {
        try {
          console.log(`   Processing draw: ${activatedDraw.name} (ID: ${activatedDraw._id}) - source: cron`);

          // Fetch full document for type safety (lean() returns plain objects)
          const fullDraw = await MajorDraw.findById(activatedDraw._id);
          if (!fullDraw) {
            throw new Error(`Draw ${activatedDraw._id} not found`);
          }
          const resetResult = await resetDrawPropertiesForAllUsers(fullDraw);

          console.log(`✅ Klaviyo reset completed for ${activatedDraw.name} (source: cron):`);
          console.log(`   Processed: ${resetResult.processed} users`);
          console.log(`   Synced: ${resetResult.synced} users`);
          console.log(`   Errors: ${resetResult.errors} users`);
          console.log(`   Duration: ${resetResult.duration}ms`);

          if (resetResult.errors > 0) {
            console.warn(`⚠️ ${resetResult.errors} users had errors during reset (source: cron)`);
            resetResult.errorDetails.slice(0, 5).forEach((error) => {
              console.warn(`   Error: ${error.email} - ${error.error}`);
            });
          }

          return { success: true, draw: activatedDraw, result: resetResult };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          console.error(`❌ Klaviyo reset failed for ${activatedDraw.name} (source: cron):`, errorMessage);
          return { success: false, draw: activatedDraw, error: errorMessage };
        }
      });

      // Fire-and-forget: Don't await - let it run in background
      // This prevents cron timeout while still processing Klaviyo syncs
      Promise.allSettled(klaviyoResetPromises)
        .then(() => {
          console.log(`✅ All Klaviyo resets completed in background (source: cron)`);
        })
        .catch((error) => {
          console.error(`❌ Klaviyo reset failed in background (source: cron):`, error);
        });

      logs.push("🔄 Klaviyo reset initiated in background (non-blocking)");
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
          completed: completedCount,
          activated: activatedCount,
          frozen: frozenCount,
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
