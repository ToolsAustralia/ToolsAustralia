import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { signJWT } from "../../../../lib/jwt";

const autoLoginSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  email: z.string().email("Invalid email address"),
});

/**
 * POST /api/auth/auto-login
 * Create a session for passwordless users after successful payment
 */
export async function POST(request: NextRequest) {
  try {
    console.log("🔐 Auto-login request received");

    // Parse and validate request body
    const body = await request.json();
    const validatedData = autoLoginSchema.parse(body);

    console.log("✅ Request validation successful");

    // Connect to database
    await connectDB();

    // Find user by ID and email
    const user = await User.findById(validatedData.userId);
    if (!user || user.email !== validatedData.email) {
      return NextResponse.json(
        {
          success: false,
          error: "User not found or email mismatch",
        },
        { status: 404 }
      );
    }

    // Check if user has an active membership OR has ever purchased packages (even if still processing via webhooks)
    const hasActiveSubscription = user.subscription?.isActive;
    const hasActiveOneTimePackages = user.oneTimePackages?.some((pkg: { isActive: boolean }) => pkg.isActive);
    const hasAnyOneTimePackages = user.oneTimePackages && user.oneTimePackages.length > 0;
    const hasStripeCustomerId = user.stripeCustomerId; // Indicates they made a successful payment

    // Allow auto-login if: active subscription OR active one-time packages OR any packages in database OR has Stripe customer ID (meaning they completed payment)
    if (!hasActiveSubscription && !hasActiveOneTimePackages && !hasAnyOneTimePackages && !hasStripeCustomerId) {
      return NextResponse.json(
        {
          success: false,
          error: "No active membership found",
        },
        { status: 403 }
      );
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // ✅ NEW: Update Klaviyo profile with latest login data
    try {
      const { ensureUserProfileSynced } = await import("@/utils/integrations/klaviyo/klaviyo-profile-sync");
      console.log(`📊 Updating Klaviyo profile after auto-login`);
      ensureUserProfileSynced(user);
    } catch (klaviyoError) {
      console.error("Klaviyo import/update error (non-critical):", klaviyoError);
    }

    // Create JWT token for the user
    const token = await signJWT({
      sub: user._id.toString(),
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
    });

    console.log(`✅ Auto-login successful for user: ${user.email}`);

    // Return success with token
    return NextResponse.json({
      success: true,
      message: "Auto-login successful",
      token,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isMobileVerified: user.isMobileVerified,
        hasActiveMembership:
          hasActiveSubscription || hasActiveOneTimePackages || hasAnyOneTimePackages || hasStripeCustomerId,
      },
    });
  } catch (error) {
    console.error("❌ Auto-login error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request data",
          details: error.issues,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 }
    );
  }
}
