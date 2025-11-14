import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { klaviyo } from "@/lib/klaviyo";
import { userToKlaviyoProfile } from "@/utils/integrations/klaviyo/klaviyo-helpers";

/**
 * POST /api/test/debug-klaviyo-profile
 * Debug endpoint to test Klaviyo profile sync with detailed logging
 */
export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    await connectDB();

    // Find the user
    const user = await User.findOne({ email });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    console.log(`🔍 DEBUG: Found user: ${user.email}`);
    console.log(`🔍 DEBUG: User ID: ${user._id}`);
    console.log(`🔍 DEBUG: Has active subscription: ${user.subscription?.isActive}`);
    console.log(`🔍 DEBUG: Subscription tier: ${user.subscription?.packageId}`);
    console.log(`🔍 DEBUG: Accumulated entries: ${user.accumulatedEntries}`);
    console.log(`🔍 DEBUG: Rewards points: ${user.rewardsPoints}`);

    // Check Klaviyo configuration
    console.log(`🔍 DEBUG: KLAVIYO_ENABLED: ${process.env.KLAVIYO_ENABLED}`);
    console.log(`🔍 DEBUG: KLAVIYO_MODE: ${process.env.KLAVIYO_MODE}`);
    console.log(`🔍 DEBUG: Has API key: ${!!process.env.KLAVIYO_PRIVATE_API_KEY}`);

    // Generate profile data
    const profileData = userToKlaviyoProfile(user);
    console.log(`🔍 DEBUG: Generated profile data:`, JSON.stringify(profileData, null, 2));

    // Test Klaviyo client configuration
    const isConfigured = (klaviyo as unknown as { isConfigured?: () => boolean }).isConfigured?.() || false;
    console.log(`🔍 DEBUG: Klaviyo client configured: ${isConfigured}`);

    // Try to sync profile and capture the result
    console.log(`🔍 DEBUG: Attempting to sync profile to Klaviyo...`);
    // ✅ CRITICAL FIX: await the async userToKlaviyoProfile function
    const awaitedProfileData = await profileData;
    const result = await klaviyo.upsertProfile(awaitedProfileData);
    console.log(`🔍 DEBUG: Klaviyo sync result:`, result);

    return NextResponse.json({
      success: true,
      message: "Debug completed",
      debug: {
        user: {
          email: user.email,
          userId: user._id.toString(),
          hasActiveSubscription: user.subscription?.isActive,
          subscriptionTier: user.subscription?.packageId,
          accumulatedEntries: user.accumulatedEntries,
          rewardsPoints: user.rewardsPoints,
          // ✅ Removed majorDrawEntries - using single source of truth from majordraws collection
        },
        klaviyoConfig: {
          enabled: process.env.KLAVIYO_ENABLED,
          mode: process.env.KLAVIYO_MODE,
          hasApiKey: !!process.env.KLAVIYO_PRIVATE_API_KEY,
          clientConfigured: isConfigured,
        },
        profileData: profileData,
        syncResult: result,
      },
    });
  } catch (error) {
    console.error("❌ DEBUG: Profile sync error:", error);
    return NextResponse.json(
      {
        error: "Debug failed",
        details: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
