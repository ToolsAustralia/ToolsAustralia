import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import {
  sendEmailVerificationCode,
  generateEmailVerificationCode,
  checkEmailRateLimit,
  getEmailVerificationExpiry,
} from "@/lib/email";

const sendEmailVerificationSchema = z.object({
  email: z.string().email("Invalid email address"),
});

/**
 * POST /api/auth/send-email-verification
 * Send email verification code to user
 */
export async function POST(request: NextRequest) {
  try {
    console.log("Email verification request received");

    // Parse and validate request body
    const body = await request.json();
    const validatedData = sendEmailVerificationSchema.parse(body);

    console.log("Request validation successful");

    // Check rate limiting
    const rateLimitResult = checkEmailRateLimit(validatedData.email);
    if (!rateLimitResult.allowed) {
      const resetTimeMinutes = Math.ceil((rateLimitResult.resetTime - Date.now()) / 60000);
      return NextResponse.json(
        {
          success: false,
          error: `Too many email verification requests. Please try again in ${resetTimeMinutes} minutes.`,
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

    // Check if user is already email verified
    if (user.isEmailVerified) {
      return NextResponse.json(
        {
          success: false,
          error: "Email is already verified",
        },
        { status: 400 }
      );
    }

    // Generate verification code
    const verificationCode = generateEmailVerificationCode();
    const expiresAt = getEmailVerificationExpiry();

    // Update user with verification code
    user.emailVerificationCode = verificationCode;
    user.emailVerificationExpires = expiresAt;
    user.emailVerificationAttempts = 0; // Reset attempts
    await user.save();

    console.log(`Email verification code generated for user: ${user.email}`);

    // Send email verification code
    const emailResult = await sendEmailVerificationCode(validatedData.email, verificationCode, user.firstName);

    if (!emailResult.success) {
      // Clear verification code from database if email failed
      user.emailVerificationCode = undefined;
      user.emailVerificationExpires = undefined;
      await user.save();

      return NextResponse.json(
        {
          success: false,
          error: emailResult.error || "Failed to send email verification",
        },
        { status: 500 }
      );
    }

    console.log(`Email verification sent successfully to ${validatedData.email}`);

    return NextResponse.json({
      success: true,
      message: "Email verification code sent successfully",
      rateLimit: {
        remainingAttempts: rateLimitResult.remainingAttempts,
        resetTime: rateLimitResult.resetTime,
      },
    });
  } catch (error) {
    console.error("Send email verification error:", error);

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
