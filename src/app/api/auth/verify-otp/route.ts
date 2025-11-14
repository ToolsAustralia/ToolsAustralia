import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";

const verifyOTPSchema = z.object({
  email: z.string().email("Invalid email address"),
  otpCode: z.string().length(6, "OTP code must be 6 digits"),
});

/**
 * POST /api/auth/verify-otp
 * Verify SMS OTP and authenticate user
 */
export async function POST(request: NextRequest) {
  try {
    console.log("🔐 OTP verification request received");

    // Parse and validate request body
    const body = await request.json();
    const validatedData = verifyOTPSchema.parse(body);

    console.log("✅ Request validation successful");

    // Connect to database
    await connectDB();

    // Find user by email
    const user = await User.findOne({ email: validatedData.email });
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: "User not found",
        },
        { status: 404 }
      );
    }

    // Check if user has an active membership
    const hasActiveSubscription = user.subscription?.isActive;
    const hasActiveOneTimePackages = user.oneTimePackages?.some((pkg: { isActive: boolean }) => pkg.isActive);

    if (!hasActiveSubscription && !hasActiveOneTimePackages) {
      return NextResponse.json(
        {
          success: false,
          error: "No active membership found. Please purchase a membership first.",
        },
        { status: 403 }
      );
    }

    // Check if OTP code exists
    if (!user.smsOtpCode || !user.smsOtpExpires) {
      return NextResponse.json(
        {
          success: false,
          error: "No OTP code found. Please request a new one.",
        },
        { status: 400 }
      );
    }

    // Check if OTP has expired
    if (new Date() > user.smsOtpExpires) {
      // Clear expired OTP
      user.smsOtpCode = undefined;
      user.smsOtpExpires = undefined;
      user.smsOtpAttempts = 0;
      await user.save();

      return NextResponse.json(
        {
          success: false,
          error: "OTP code has expired. Please request a new one.",
        },
        { status: 400 }
      );
    }

    // Check attempt limit (max 5 attempts per OTP)
    const maxAttempts = 5;
    if ((user.smsOtpAttempts || 0) >= maxAttempts) {
      // Clear OTP after max attempts
      user.smsOtpCode = undefined;
      user.smsOtpExpires = undefined;
      user.smsOtpAttempts = 0;
      await user.save();

      return NextResponse.json(
        {
          success: false,
          error: "Too many failed attempts. Please request a new OTP code.",
        },
        { status: 429 }
      );
    }

    // Verify OTP code
    if (user.smsOtpCode !== validatedData.otpCode) {
      // Increment attempt counter
      user.smsOtpAttempts = (user.smsOtpAttempts || 0) + 1;
      await user.save();

      const remainingAttempts = maxAttempts - user.smsOtpAttempts;

      return NextResponse.json(
        {
          success: false,
          error: `Invalid OTP code. ${remainingAttempts} attempts remaining.`,
          remainingAttempts,
        },
        { status: 400 }
      );
    }

    // OTP is valid - clear it and update user
    user.smsOtpCode = undefined;
    user.smsOtpExpires = undefined;
    user.smsOtpAttempts = 0;
    user.lastLogin = new Date();
    user.isMobileVerified = true; // Mark mobile as verified
    await user.save();

    // ✅ NEW: Update Klaviyo profile with latest login data
    try {
      const { ensureUserProfileSynced } = await import("@/utils/integrations/klaviyo/klaviyo-profile-sync");
      console.log(`📊 Updating Klaviyo profile after OTP login`);
      ensureUserProfileSynced(user);
    } catch (klaviyoError) {
      console.error("Klaviyo import/update error (non-critical):", klaviyoError);
    }

    console.log(`✅ OTP verification successful for user: ${user.email}`);

    // Return success response with user data
    return NextResponse.json({
      success: true,
      message: "OTP verified successfully",
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isMobileVerified: user.isMobileVerified,
        hasActiveMembership: hasActiveSubscription || hasActiveOneTimePackages,
      },
    });
  } catch (error) {
    console.error("❌ Verify OTP error:", error);

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
