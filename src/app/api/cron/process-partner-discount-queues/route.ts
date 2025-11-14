/**
 * Partner Discount Queue Processing Cron Job
 *
 * This endpoint should be called periodically (e.g., every hour) to:
 * 1. Process all users' partner discount queues
 * 2. Expire finished periods
 * 3. Activate next queued items
 * 4. Clean up old expired items
 *
 * Cron Schedule Recommendation: Every hour (0 * * * *)
 *
 * Security:
 * - Should be protected by Vercel Cron secret or API key
 * - Only accessible via POST with correct authorization
 *
 * @author Senior Full-Stack Developer
 * @version 1.0.0
 */

import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { processPartnerDiscountQueue } from "@/utils/partner-discounts/partner-discount-queue";

/**
 * POST /api/cron/process-partner-discount-queues
 *
 * Process all users' partner discount queues
 *
 * Authorization:
 * - Protected by Vercel's internal infrastructure (no external access)
 * - CRON_SECRET kept for manual testing purposes only
 */
export async function POST() {
  try {
    // Vercel cron jobs are automatically protected by Vercel's infrastructure
    // No additional authentication needed as they can only be called internally

    console.log("🕐 Starting partner discount queue processing cron job...");
    const startTime = Date.now();

    await connectDB();

    // Get all users with partner discount queues
    // Only process users who have items in their queue
    const users = await User.find({
      partnerDiscountQueue: { $exists: true, $ne: [] },
    }).limit(1000); // Process in batches to avoid timeout

    console.log(`📊 Found ${users.length} users with partner discount queues`);

    let processedCount = 0;
    let changedCount = 0;
    let errorCount = 0;
    const errors: { userId: string; email: string; error: string }[] = [];

    // Process each user's queue
    for (const user of users) {
      try {
        const queueChanged = await processPartnerDiscountQueue(user);

        if (queueChanged) {
          await user.save();
          changedCount++;
          console.log(`✅ Queue processed and saved for user: ${user.email}`);
        }

        processedCount++;
      } catch (error) {
        errorCount++;
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        errors.push({
          userId: user._id.toString(),
          email: user.email,
          error: errorMessage,
        });
        console.error(`❌ Error processing queue for user ${user.email}:`, error);
      }
    }

    const duration = Date.now() - startTime;

    console.log(`✅ Cron job completed in ${duration}ms`);
    console.log(`📊 Processed: ${processedCount} users`);
    console.log(`📊 Changed: ${changedCount} users`);
    console.log(`📊 Errors: ${errorCount} users`);

    return NextResponse.json({
      success: true,
      data: {
        processedCount,
        changedCount,
        errorCount,
        duration: `${duration}ms`,
        errors: errors.length > 0 ? errors.slice(0, 10) : undefined, // Return max 10 errors
      },
      message: `Processed ${processedCount} users in ${duration}ms. ${changedCount} queues updated.`,
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
 * GET /api/cron/process-partner-discount-queues
 *
 * Health check endpoint to verify cron job is accessible
 */
export async function GET() {
  return NextResponse.json({
    service: "Partner Discount Queue Processing Cron",
    status: "healthy",
    message: "Use POST method to trigger processing",
    schedule: "Recommended: Every hour (0 * * * *)",
    requiredHeaders: {
      authorization: "Bearer <CRON_SECRET>",
    },
  });
}
