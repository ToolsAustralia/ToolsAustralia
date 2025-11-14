import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { protectDebugEndpoint } from "@/lib/debugAuth";
import { klaviyo } from "@/lib/klaviyo";
import { ensureUserProfileSynced } from "@/utils/integrations/klaviyo/klaviyo-profile-sync";
import { createUserRegisteredEvent } from "@/utils/integrations/klaviyo/klaviyo-events";

/**
 * POST /api/test/klaviyo-user-sync
 * Test endpoint to simulate user registration and profile sync
 * This helps debug Klaviyo integration issues
 */
export async function POST(request: NextRequest) {
  try {
    // Protect debug endpoint
    const authResult = await protectDebugEndpoint();
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    await connectDB();

    // Find or create a test user
    let user = await User.findOne({ email });

    if (!user) {
      // Create a test user
      user = new User({
        firstName: "Test",
        lastName: "User",
        email: email,
        mobile: "+61412345678",
        role: "user",
        profileSetupCompleted: false,
        subscription: {
          packageId: "",
          startDate: new Date(),
          isActive: false,
          autoRenew: true,
          status: "incomplete",
          pendingChange: undefined, // Initialize pendingChange field for subscription management
        }, // Initialize subscription structure for test user
        oneTimePackages: [],
        accumulatedEntries: 10, // Give some test entries
        entryWallet: 0,
        rewardsPoints: 50, // Give some test points
        // ✅ Removed majorDrawEntries - using single source of truth in majordraws collection
        cart: [],
        isEmailVerified: false,
        isMobileVerified: false,
        isActive: true,
        savedPaymentMethods: [],
        upsellPurchases: [],
        upsellStats: {
          totalShown: 0,
          totalAccepted: 0,
          totalDeclined: 0,
          totalDismissed: 0,
          conversionRate: 0,
          lastInteraction: null,
        },
        upsellHistory: [],
        miniDrawPackages: [],
      });

      await user.save();
      console.log(`✅ Created test user: ${user.email}`);
    } else {
      console.log(`✅ Found existing user: ${user.email}`);
    }

    // Test 1: Track user registration event
    console.log("🔍 Testing user registration event...");
    klaviyo.trackEventBackground(createUserRegisteredEvent(user, "email"));

    // Test 2: Sync user profile
    console.log("🔍 Testing profile sync...");
    ensureUserProfileSynced(user);

    // Test 3: Update user with some data and sync again
    console.log("🔍 Testing profile sync after data update...");
    user.accumulatedEntries = 25;
    user.rewardsPoints = 100;
    await user.save();
    ensureUserProfileSynced(user);

    return NextResponse.json({
      success: true,
      message: "Klaviyo user sync test completed",
      user: {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        accumulatedEntries: user.accumulatedEntries,
        rewardsPoints: user.rewardsPoints,
        createdAt: user.createdAt,
      },
      tests: ["User registration event tracked", "Profile synced to Klaviyo", "Profile updated and re-synced"],
      note: "Check your Klaviyo dashboard to see the events and profile data",
    });
  } catch (error) {
    console.error("❌ Klaviyo user sync test failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: "User sync test failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
