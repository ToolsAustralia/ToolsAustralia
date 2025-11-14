import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { protectDebugEndpoint } from "@/lib/debugAuth";

/**
 * DEBUG ONLY: Fix all users in database to ensure pendingChange field exists
 * POST /api/debug/fix-all-users-schema
 */
export async function POST() {
  try {
    // Protect debug endpoint
    const authResult = await protectDebugEndpoint();
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    await connectDB();

    console.log(`🔧 DEBUG: Starting mass schema migration for all users`);

    // Find all users
    const users = await User.find({});
    console.log(`📊 Found ${users.length} users to check`);

    let totalChanges = 0;
    const results = [];

    for (const user of users) {
      let changesMade = false;
      const userResult = {
        userId: user._id,
        email: user.email,
        changes: [] as string[],
        changesMade: false,
      };

      // Check if user has subscription
      if (user.subscription) {
        // Check if pendingChange field exists
        if (!user.subscription.hasOwnProperty("pendingChange")) {
          user.subscription.pendingChange = undefined;
          changesMade = true;
          userResult.changes.push("Added pendingChange field");
        }
      } else {
        // User doesn't have subscription object, create it
        user.subscription = {
          packageId: "",
          startDate: new Date(),
          isActive: false,
          autoRenew: true,
          status: "incomplete",
          pendingChange: undefined,
        };
        changesMade = true;
        userResult.changes.push("Created subscription object with pendingChange");
      }

      // Save if changes were made
      if (changesMade) {
        await user.save();
        totalChanges++;
        userResult.changesMade = true;
      } else {
        userResult.changesMade = false;
      }

      results.push(userResult);
    }

    console.log(`✅ DEBUG: Schema migration completed`);
    console.log(`📊 Total users processed: ${users.length}`);
    console.log(`📊 Total users updated: ${totalChanges}`);

    return NextResponse.json({
      success: true,
      message: "Mass schema migration completed (DEBUG ONLY)",
      data: {
        totalUsers: users.length,
        totalUpdated: totalChanges,
        results: results.slice(0, 10), // Show first 10 results to avoid huge response
        summary: {
          usersWithChanges: totalChanges,
          usersWithoutChanges: users.length - totalChanges,
        },
      },
    });
  } catch (error) {
    console.error("❌ DEBUG: Error in mass schema migration:", error);
    return NextResponse.json({ error: "Failed to migrate all users schema" }, { status: 500 });
  }
}
