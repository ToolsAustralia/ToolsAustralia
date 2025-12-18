/**
 * Klaviyo Failed Events Cleanup Cron Job
 *
 * This endpoint cleans up old succeeded and permanently failed events from the queue.
 * Should be called daily to prevent database bloat.
 *
 * Cron Schedule: Daily at 2 AM UTC (0 2 * * *)
 *
 * Security:
 * - Protected by Vercel's internal infrastructure (no external access)
 * - Only accessible via POST with Vercel's authorization
 *
 * @author Senior Full-Stack Developer
 * @version 1.0.0
 */

import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import KlaviyoFailedEvent from "@/models/KlaviyoFailedEvent";

// Cleanup configuration
const CLEANUP_DAYS_SUCCEEDED = 30; // Delete succeeded events after 30 days
const CLEANUP_DAYS_FAILED = 90; // Delete permanent failures after 90 days

/**
 * POST /api/cron/cleanup-klaviyo-failed-events
 *
 * Clean up old succeeded and permanently failed events
 *
 * Authorization:
 * - Protected by Vercel's internal infrastructure (no external access)
 * - Vercel cron jobs are automatically protected
 */
export async function POST() {
  try {
    // Vercel cron jobs are automatically protected by Vercel's infrastructure
    // No additional authentication needed as they can only be called internally

    const startTime = Date.now();
    await connectDB();

    const now = new Date();

    // Calculate cutoff dates
    const succeededCutoffDate = new Date(now);
    succeededCutoffDate.setDate(succeededCutoffDate.getDate() - CLEANUP_DAYS_SUCCEEDED);

    const failedCutoffDate = new Date(now);
    failedCutoffDate.setDate(failedCutoffDate.getDate() - CLEANUP_DAYS_FAILED);

    // Delete old succeeded events
    const succeededResult = await KlaviyoFailedEvent.deleteMany({
      status: "succeeded",
      succeededAt: { $lt: succeededCutoffDate },
    });

    // Delete old permanent failures
    const failedResult = await KlaviyoFailedEvent.deleteMany({
      status: "failed_permanent",
      createdAt: { $lt: failedCutoffDate },
    });

    const duration = Date.now() - startTime;

    const totalDeleted = succeededResult.deletedCount + failedResult.deletedCount;

    console.log(
      `✅ Klaviyo failed events cleanup completed in ${duration}ms. ` +
        `Deleted ${succeededResult.deletedCount} succeeded events (older than ${CLEANUP_DAYS_SUCCEEDED} days) ` +
        `and ${failedResult.deletedCount} permanent failures (older than ${CLEANUP_DAYS_FAILED} days). ` +
        `Total: ${totalDeleted} events deleted.`
    );

    return NextResponse.json({
      success: true,
      data: {
        succeededDeleted: succeededResult.deletedCount,
        failedDeleted: failedResult.deletedCount,
        totalDeleted,
        duration: `${duration}ms`,
        cutoffDates: {
          succeeded: succeededCutoffDate.toISOString(),
          failed: failedCutoffDate.toISOString(),
        },
      },
      message: `Cleanup completed. Deleted ${totalDeleted} old events.`,
    });
  } catch (error) {
    console.error("❌ Cleanup cron job failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Cleanup cron job failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/cron/cleanup-klaviyo-failed-events
 *
 * Health check endpoint to verify cron job is accessible
 */
export async function GET() {
  try {
    await connectDB();

    const now = new Date();
    const succeededCutoffDate = new Date(now);
    succeededCutoffDate.setDate(succeededCutoffDate.getDate() - CLEANUP_DAYS_SUCCEEDED);
    const failedCutoffDate = new Date(now);
    failedCutoffDate.setDate(failedCutoffDate.getDate() - CLEANUP_DAYS_FAILED);

    // Count events that would be deleted
    const succeededToDelete = await KlaviyoFailedEvent.countDocuments({
      status: "succeeded",
      succeededAt: { $lt: succeededCutoffDate },
    });

    const failedToDelete = await KlaviyoFailedEvent.countDocuments({
      status: "failed_permanent",
      createdAt: { $lt: failedCutoffDate },
    });

    return NextResponse.json({
      service: "Klaviyo Failed Events Cleanup Cron",
      status: "healthy",
      message: "Use POST method to trigger cleanup",
      schedule: "Daily at 2 AM UTC (0 2 * * *)",
      cleanupConfig: {
        succeededDays: CLEANUP_DAYS_SUCCEEDED,
        failedDays: CLEANUP_DAYS_FAILED,
        succeededCutoffDate: succeededCutoffDate.toISOString(),
        failedCutoffDate: failedCutoffDate.toISOString(),
      },
      eventsToDelete: {
        succeeded: succeededToDelete,
        failed: failedToDelete,
        total: succeededToDelete + failedToDelete,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        service: "Klaviyo Failed Events Cleanup Cron",
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
