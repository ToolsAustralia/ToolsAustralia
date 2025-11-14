import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { sendSMSOTP, generateOTP, checkRateLimit, validateMobileNumber } from "@/lib/sms";

const sendOTPSchema = z.object({
  email: z.string().email("Invalid email address"),
  mobile: z.string().min(1, "Mobile number is required"),
});

/**
 * POST /api/auth/send-otp
 * Send SMS OTP for passwordless login
 */
export async function POST(request: NextRequest) {
  try {
    console.log("📱 SMS OTP request received");

    // Parse and validate request body
    const body = await request.json();
    const validatedData = sendOTPSchema.parse(body);

    console.log("✅ Request validation successful");

    // Validate mobile number format
    if (!validateMobileNumber(validatedData.mobile)) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid Australian mobile number format",
        },
        { status: 400 }
      );
    }

    // Check rate limiting
    const rateLimitResult = checkRateLimit(validatedData.email);
    if (!rateLimitResult.allowed) {
      const resetTimeMinutes = Math.ceil((rateLimitResult.resetTime - Date.now()) / 60000);
      return NextResponse.json(
        {
          success: false,
          error: `Too many OTP requests. Please try again in ${resetTimeMinutes} minutes.`,
          rateLimit: {
            remainingAttempts: rateLimitResult.remainingAttempts,
            resetTime: rateLimitResult.resetTime,
          },
        },
        { status: 429 }
      );
    }

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

    // Generate OTP code
    const otpCode = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Update user with OTP code
    user.smsOtpCode = otpCode;
    user.smsOtpExpires = expiresAt;
    user.smsOtpAttempts = 0; // Reset attempts
    await user.save();

    console.log(`✅ OTP code generated for user: ${user.email}`);

    // Send SMS OTP
    const smsResult = await sendSMSOTP(validatedData.mobile, otpCode, user.firstName);

    if (!smsResult.success) {
      // Clear OTP from database if SMS failed
      user.smsOtpCode = undefined;
      user.smsOtpExpires = undefined;
      await user.save();

      return NextResponse.json(
        {
          success: false,
          error: smsResult.error || "Failed to send SMS",
        },
        { status: 500 }
      );
    }

    console.log(`✅ SMS OTP sent successfully to ${validatedData.mobile}`);

    return NextResponse.json({
      success: true,
      message: "OTP sent successfully",
      rateLimit: {
        remainingAttempts: rateLimitResult.remainingAttempts,
        resetTime: rateLimitResult.resetTime,
      },
    });
  } catch (error) {
    console.error("❌ Send OTP error:", error);

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
