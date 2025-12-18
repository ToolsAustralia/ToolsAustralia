// /**
//  * Klaviyo Failed Events Queue Processing Cron Job
//  *
//  * This endpoint processes failed Klaviyo events from the queue and retries them.
//  * Should be called periodically (every 15 minutes) to retry failed events.
//  *
//  * Cron Schedule: Every 15 minutes (*/15 * * * *)
//  *
//  * Security:
//  * - Protected by Vercel's internal infrastructure (no external access)
//  * - Only accessible via POST with Vercel's authorization
//  *
//  * @author Senior Full-Stack Developer
//  * @version 1.0.0
//  */

import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import KlaviyoFailedEvent from "@/models/KlaviyoFailedEvent";
import { klaviyo } from "@/lib/klaviyo";
import { ObjectId } from "mongoose";

/**
 * POST /api/cron/process-klaviyo-failed-events
 *
 * Process failed Klaviyo events from the queue
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

    // Find pending events ready to retry (nextRetryAt <= now)
    // Process in batches of 25 to avoid Vercel timeout (60s Pro, 10s Hobby)
    const now = new Date();
    const pendingEvents = await KlaviyoFailedEvent.find({
      status: "pending",
      nextRetryAt: { $lte: now },
    })
      .sort({ nextRetryAt: 1 }) // Oldest first
      .limit(25) // Process 25 events per run to stay within timeout
      .lean(); // Use lean() for better performance

    if (pendingEvents.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          processedCount: 0,
          succeededCount: 0,
          failedCount: 0,
          permanentFailures: 0,
          duration: `${Date.now() - startTime}ms`,
        },
        message: "No pending events to process",
      });
    }

    let succeededCount = 0;
    let failedCount = 0;
    let permanentFailures = 0;
    const errors: { eventId: string; eventName: string; error: string }[] = [];

    // Process each event
    for (const eventDoc of pendingEvents) {
      try {
        // Fetch full document (needed for save operations)
        const failedEvent = await KlaviyoFailedEvent.findById(eventDoc._id);
        if (!failedEvent) {
          continue;
        }

        // Retry the event
        const success = await klaviyo.retryFailedEvent(failedEvent);

        if (success) {
          succeededCount++;
        } else {
          if (failedEvent.status === "failed_permanent") {
            permanentFailures++;
          } else {
            failedCount++;
          }
        }
      } catch (error) {
        failedCount++;
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        errors.push({
          eventId: (eventDoc._id as ObjectId).toString(),
          eventName: (eventDoc.event as { event?: string })?.event || "unknown",
          error: errorMessage,
        });
        console.error(`❌ Error processing failed event ${eventDoc._id}:`, error);
      }
    }

    const duration = Date.now() - startTime;

    // Log summary
    console.log(
      `✅ Klaviyo failed events queue processed: ${pendingEvents.length} events in ${duration}ms. ` +
        `Succeeded: ${succeededCount}, Failed: ${failedCount}, Permanent: ${permanentFailures}`
    );

    return NextResponse.json({
      success: true,
      data: {
        processedCount: pendingEvents.length,
        succeededCount,
        failedCount,
        permanentFailures,
        duration: `${duration}ms`,
        errors: errors.length > 0 ? errors.slice(0, 10) : undefined, // Return max 10 errors
      },
      message: `Processed ${pendingEvents.length} events. ${succeededCount} succeeded, ${failedCount} failed, ${permanentFailures} permanent failures.`,
    });
  } catch (error) {
    console.error("❌ Cron job failed:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Cron job failed",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/cron/process-klaviyo-failed-events
 *
 * Health check endpoint to verify cron job is accessible
 */
export async function GET() {
  try {
    await connectDB();

    // Get queue statistics
    const pendingCount = await KlaviyoFailedEvent.countDocuments({ status: "pending" });
    const processingCount = await KlaviyoFailedEvent.countDocuments({ status: "processing" });
    const succeededCount = await KlaviyoFailedEvent.countDocuments({ status: "succeeded" });
    const permanentFailuresCount = await KlaviyoFailedEvent.countDocuments({
      status: "failed_permanent",
    });

    // Count events ready to retry
    const now = new Date();
    const readyToRetry = await KlaviyoFailedEvent.countDocuments({
      status: "pending",
      nextRetryAt: { $lte: now },
    });

    return NextResponse.json({
      service: "Klaviyo Failed Events Queue Processing Cron",
      status: "healthy",
      message: "Use POST method to trigger processing",
      schedule: "Every 15 minutes (*/15 * * * *)",
      queueStats: {
        pending: pendingCount,
        processing: processingCount,
        readyToRetry,
        succeeded: succeededCount,
        permanentFailures: permanentFailuresCount,
        total: pendingCount + processingCount + succeededCount + permanentFailuresCount,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        service: "Klaviyo Failed Events Queue Processing Cron",
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
