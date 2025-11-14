/**
 * Partner Discount Queue API Endpoint
 *
 * Provides real-time information about a user's partner discount access
 * including currently active periods and queued future access.
 *
 * GET /api/partner-discount/queue
 * - Returns the user's partner discount queue status
 * - Processes expired periods automatically
 * - Activates next queued item if needed
 *
 * @author Senior Full-Stack Developer
 * @version 1.0.0
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import {
  processPartnerDiscountQueue,
  getQueueSummary,
  calculateActivePartnerDiscountPeriod,
} from "@/utils/partner-discounts/partner-discount-queue";
import { getPackageById } from "@/data/membershipPackages";

/**
 * GET /api/partner-discount/queue
 * Fetch the user's partner discount queue status
 *
 * This endpoint:
 * 1. Authenticates the user
 * 2. Processes any expired queue items
 * 3. Returns current active period and upcoming queued items
 *
 * Response includes:
 * - activePeriod: Currently active partner discount access (if any)
 * - queuedItems: List of upcoming partner discount periods (FIFO order)
 * - totalQueuedDays: Sum of all queued discount days
 * - totalQueuedItems: Count of items in queue
 */
export async function GET() {
  try {
    await connectDB();

    // Get the authenticated user session
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    console.log(`📊 Fetching partner discount queue for user: ${session.user.id}`);

    // Get the user from database
    const user = await User.findById(session.user.id);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Process the queue (expire old items, activate next item if needed)
    const queueChanged = await processPartnerDiscountQueue(user);

    // Save if queue was modified
    if (queueChanged) {
      await user.save();
      console.log(`✅ Queue processed and saved for user: ${session.user.email}`);
    }

    // Get queue summary for display
    const queueSummary = getQueueSummary(user);

    // Get detailed active period info
    const activePeriod = calculateActivePartnerDiscountPeriod(user);

    // Calculate total queued days from ALL queued items (not just first 5)
    const allQueuedItems = user.partnerDiscountQueue?.filter((item) => item.status === "queued") || [];
    const totalAllQueuedDays = allQueuedItems.reduce((sum, item) => sum + item.discountDays, 0);

    // Check if user has active subscription with partner discount benefits
    const isActiveSubscription = user.subscription?.isActive && activePeriod.source === "subscription";
    let subscriptionBenefits = null;

    if (isActiveSubscription && user.subscription?.packageId) {
      const packageInfo = getPackageById(user.subscription.packageId);
      if (packageInfo && packageInfo.shopDiscountPercent) {
        subscriptionBenefits = {
          shopDiscountPercent: packageInfo.shopDiscountPercent,
          packageName: packageInfo.name,
          subscriptionType: packageInfo.type || "subscription",
        };
      }
    }

    console.log(`📊 Active period:`, activePeriod);
    console.log(`📊 Queued items: ${queueSummary.totalQueuedItems}`);
    console.log(`📊 Total queued days: ${queueSummary.totalQueuedDays}`);
    console.log(`📊 Is active subscription: ${isActiveSubscription}`);
    console.log(`📊 Subscription benefits:`, subscriptionBenefits);

    return NextResponse.json({
      success: true,
      data: {
        activePeriod: {
          isActive: activePeriod.isActive,
          source: activePeriod.source,
          packageName: activePeriod.packageName,
          endsAt: activePeriod.endsAt,
          daysRemaining: activePeriod.daysRemaining,
          hoursRemaining: activePeriod.hoursRemaining,
        },
        queuedItems: queueSummary.queuedItems,
        totalQueuedDays: queueSummary.totalQueuedDays,
        totalQueuedItems: queueSummary.totalQueuedItems,
        summary: {
          hasActiveAccess: activePeriod.isActive,
          hasQueuedItems: queueSummary.totalQueuedItems > 0,
          nextActivationDate: queueSummary.queuedItems[0]?.purchaseDate || null,
          totalDaysOfAccessRemaining: activePeriod.daysRemaining + totalAllQueuedDays,
          isActiveSubscription,
          subscriptionBenefits,
        },
      },
    });
  } catch (error) {
    console.error("❌ Error fetching partner discount queue:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch partner discount queue",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/partner-discount/queue/process
 * Manually trigger queue processing (for admin/testing)
 *
 * This can be useful for:
 * - Testing queue activation logic
 * - Manual cleanup of expired items
 * - Debugging queue issues
 */
export async function POST() {
  try {
    await connectDB();

    // Get the authenticated user session
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    console.log(`🔄 Manually processing partner discount queue for user: ${session.user.id}`);

    // Get the user from database
    const user = await User.findById(session.user.id);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Process the queue
    const queueChanged = await processPartnerDiscountQueue(user);

    // Save if queue was modified
    if (queueChanged) {
      await user.save();
      console.log(`✅ Queue processed and saved for user: ${session.user.email}`);
    }

    // Get queue summary
    const queueSummary = getQueueSummary(user);

    return NextResponse.json({
      success: true,
      data: {
        queueProcessed: queueChanged,
        message: queueChanged
          ? "Queue processed successfully - items were activated or expired"
          : "Queue is up to date - no changes made",
        activePeriod: queueSummary.activePeriod,
        queuedItems: queueSummary.queuedItems,
        totalQueuedDays: queueSummary.totalQueuedDays,
        totalQueuedItems: queueSummary.totalQueuedItems,
      },
    });
  } catch (error) {
    console.error("❌ Error processing partner discount queue:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to process partner discount queue",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
