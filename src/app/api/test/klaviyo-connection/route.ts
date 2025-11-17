import { NextResponse } from "next/server";
import { klaviyo } from "@/lib/klaviyo";

/**
 * POST /api/test/klaviyo-connection
 * Test endpoint to verify Klaviyo API key and basic connectivity
 * This is a more comprehensive test than the health check
 */
export async function POST() {
  try {
    const configStatus = klaviyo.getConfigStatus();

    if (!configStatus.hasApiKey) {
      return NextResponse.json(
        {
          success: false,
          error: "No API key configured",
          recommendation: "Set KLAVIYO_PRIVATE_API_KEY in your environment variables",
        },
        { status: 400 }
      );
    }

    // Test 1: Basic API connectivity
    console.log("🔍 Testing Klaviyo API connectivity...");
    const connectivityTest = await klaviyo.verifyConnection();

    // Test 2: Try to create a test profile (will be cleaned up)
    console.log("🔍 Testing profile creation...");
    const testEmail = `test-${Date.now()}@klaviyo-test.com`;

    try {
      const profileResult = await klaviyo.upsertProfile({
        email: testEmail,
        first_name: "Test",
        last_name: "User",
        properties: {
          user_id: `test-user-${Date.now()}`,
          created_at: new Date().toISOString(),
          is_active: true,
          role: "test",
          is_email_verified: true,
          is_mobile_verified: false,
          has_active_subscription: false,
          accumulated_entries: 0,
          rewards_points: 0,
          total_major_draw_entries: 0,
          total_one_time_packages: 0,
          total_mini_draw_packages: 0,
          total_upsells_purchased: 0,
        },
      });

      console.log("✅ Profile creation test:", profileResult);

      // Test 3: Try to track a test event
      console.log("🔍 Testing event tracking...");
      const eventResult = await klaviyo.trackEvent({
        event: "Test Event",
        customer_properties: {
          email: testEmail,
          first_name: "Test",
          last_name: "User",
        },
        properties: {
          user_id: `test-user-${Date.now()}`,
          test_event: true,
          timestamp: new Date().toISOString(),
        },
      });

      console.log("✅ Event tracking test:", eventResult);

      return NextResponse.json({
        success: true,
        message: "All Klaviyo tests passed",
        results: {
          connectivity: connectivityTest,
          profileCreation: profileResult,
          eventTracking: eventResult,
        },
        config: configStatus,
        testEmail: testEmail,
        note: "Test profile created - you can delete it from Klaviyo dashboard if needed",
      });
    } catch (profileError) {
      console.error("❌ Profile/Event test failed:", profileError);

      return NextResponse.json(
        {
          success: false,
          error: "Profile or event test failed",
          details: profileError instanceof Error ? profileError.message : "Unknown error",
          connectivity: connectivityTest,
          config: configStatus,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("❌ Klaviyo connection test failed:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Connection test failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
