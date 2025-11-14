import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { protectDebugEndpoint } from "@/lib/debugAuth";

/**
 * DEBUG ONLY: Migrate user schema to ensure pendingChange field exists
 * POST /api/debug/migrate-user-schema
 */
export async function POST() {
  try {
    // Protect debug endpoint
    const authResult = await protectDebugEndpoint();
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    await connectDB();

    // Get the user
    const user = await User.findById(authResult.user.id);
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    console.log(`🔧 DEBUG: Migrating user schema for: ${user.email}`);
    console.log(`🔧 Current subscription:`, user.subscription);

    let changesMade = false;

    // Ensure subscription object exists
    if (!user.subscription) {
      user.subscription = {
        packageId: "",
        startDate: new Date(),
        isActive: false,
        autoRenew: true,
        status: "incomplete",
        pendingChange: undefined, // Initialize pendingChange field
      };
      changesMade = true;
      console.log(`✅ Created subscription object with pendingChange field`);
    }

    // Ensure pendingChange field exists (even if undefined)
    if (user.subscription && !user.subscription.hasOwnProperty("pendingChange")) {
      // Add the field as undefined to ensure it exists in the schema
      user.subscription.pendingChange = undefined;
      changesMade = true;
      console.log(`✅ Added pendingChange field`);
    }

    // Save if changes were made
    if (changesMade) {
      await user.save();
      console.log(`✅ Schema migration completed for user: ${user.email}`);
    } else {
      console.log(`ℹ️ No schema changes needed for user: ${user.email}`);
    }

    return NextResponse.json({
      success: true,
      message: "Schema migration completed (DEBUG ONLY)",
      data: {
        changesMade,
        subscription: {
          packageId: user.subscription?.packageId,
          isActive: user.subscription?.isActive,
          autoRenew: user.subscription?.autoRenew,
          status: user.subscription?.status,
          pendingChange: user.subscription?.pendingChange,
          hasPendingChangeField: user.subscription?.hasOwnProperty("pendingChange"),
        },
      },
    });
  } catch (error) {
    console.error("❌ DEBUG: Error migrating user schema:", error);
    return NextResponse.json({ error: "Failed to migrate user schema" }, { status: 500 });
  }
}
