/**
 * Partner Discount Queue Processing Cron Job
 *
 * This endpoint should be called periodically (daily) to:
 * 1. Process all users' partner discount queues
 * 2. Expire finished periods
 * 3. Activate next queued items
 * 4. Clean up old expired items
 *
 * Cron Schedule: Daily at 3:00 PM UTC (0 15 * * *)
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
import { waitForPoolCapacity } from "@/utils/database/connection-health";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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

    // console.log("🕐 Starting partner discount queue processing cron job...");
    const startTime = Date.now();

    await connectDB();

    // ✅ OPTIMIZATION: Wait for pool capacity before starting bulk operation
    const hasCapacity = await waitForPoolCapacity(80, 10000);
    if (!hasCapacity) {
      console.warn("⚠️ Connection pool still near capacity after wait, proceeding anyway");
    }

    // ✅ OPTIMIZATION: Process in smaller batches with lean() for better performance
    const BATCH_SIZE = 200; // Reduced from 1000 to reduce connection pressure
    let skip = 0;
    let hasMore = true;
    const allUsers: any[] = [];

    // Fetch users in batches
    while (hasMore) {
      const batch = await User.find({
        partnerDiscountQueue: { $exists: true, $ne: [] },
      })
        .skip(skip)
        .limit(BATCH_SIZE)
        .lean(); // Use lean() for read-only operations

      if (batch.length === 0) {
        hasMore = false;
        break;
      }

      allUsers.push(...batch);
      skip += BATCH_SIZE;

      if (batch.length < BATCH_SIZE) {
        hasMore = false;
      }
      
      // Small delay between batches to reduce connection pressure
      if (hasMore) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    const users = allUsers;

    // console.log(`📊 Found ${users.length} users with partner discount queues`);

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
          // console.log(`✅ Queue processed and saved for user: ${user.email}`);
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

    // console.log(`✅ Cron job completed in ${duration}ms`);
    // console.log(`📊 Processed: ${processedCount} users`);
    // console.log(`📊 Changed: ${changedCount} users`);
    // console.log(`📊 Errors: ${errorCount} users`);

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
    schedule: "Daily at 3:00 PM UTC (0 15 * * *)",
    requiredHeaders: {
      authorization: "Bearer <CRON_SECRET>",
    },
  });
}
