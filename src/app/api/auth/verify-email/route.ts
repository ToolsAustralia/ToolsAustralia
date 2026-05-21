import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";

const verifyEmailSchema = z.object({
  email: z.string().email("Invalid email address"),
  verificationCode: z.string().length(6, "Verification code must be 6 characters"),
});

/**
 * POST /api/auth/verify-email
 * Verify email verification code
 */
export async function POST(request: NextRequest) {
  try {
    // console.log("Email verification code verification request received");

    // Parse and validate request body
    const body = await request.json();
    const validatedData = verifyEmailSchema.parse(body);

    // console.log("Request validation successful");

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

    // Check if verification code exists
    if (!user.emailVerificationCode || !user.emailVerificationExpires) {
      return NextResponse.json(
        {
          success: false,
          error: "No verification code found. Please request a new one.",
        },
        { status: 400 }
      );
    }

    // Check if verification code has expired
    if (new Date() > user.emailVerificationExpires) {
      // Clear expired code
      user.emailVerificationCode = undefined;
      user.emailVerificationExpires = undefined;
      user.emailVerificationAttempts = 0;
      await user.save();

      return NextResponse.json(
        {
          success: false,
          error: "Verification code has expired. Please request a new one.",
        },
        { status: 400 }
      );
    }

    // Check if too many attempts
    const maxAttempts = 5;
    if (user.emailVerificationAttempts && user.emailVerificationAttempts >= maxAttempts) {
      // Clear code after too many attempts
      user.emailVerificationCode = undefined;
      user.emailVerificationExpires = undefined;
      user.emailVerificationAttempts = 0;
      await user.save();

      return NextResponse.json(
        {
          success: false,
          error: "Too many failed attempts. Please request a new verification code.",
        },
        { status: 400 }
      );
    }

    // Verify the code
    if (user.emailVerificationCode !== validatedData.verificationCode.toUpperCase()) {
      // Increment attempts
      user.emailVerificationAttempts = (user.emailVerificationAttempts || 0) + 1;
      await user.save();

      const remainingAttempts = maxAttempts - user.emailVerificationAttempts;

      return NextResponse.json(
        {
          success: false,
          error: `Invalid verification code. ${remainingAttempts} attempts remaining.`,
          remainingAttempts,
        },
        { status: 400 }
      );
    }

    // Verification successful - mark email as verified
    const mergeFromEmail = user.pendingKlaviyoMergeFromEmail;
    user.isEmailVerified = true;
    user.emailVerificationCode = undefined; // Clear the code
    user.emailVerificationExpires = undefined;
    user.emailVerificationAttempts = 0;

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    try {
      const { ensureUserProfileSynced, mergeKlaviyoProfilesAfterEmailChange } = await import(
        "@/utils/integrations/klaviyo/klaviyo-profile-sync"
      );
      if (mergeFromEmail) {
        const mergeResult = await mergeKlaviyoProfilesAfterEmailChange(user, mergeFromEmail);
        if (!mergeResult.merged && mergeResult.error) {
          console.warn("Klaviyo profile merge after email verification (non-critical):", mergeResult.error);
        }
        user.pendingKlaviyoMergeFromEmail = undefined;
        await user.save();
      }
      ensureUserProfileSynced(user);
    } catch (klaviyoError) {
      console.error("Klaviyo import/update error (non-critical):", klaviyoError);
    }

    // console.log(`Email verification successful for user: ${user.email}`);

    // Return success response with user data
    return NextResponse.json({
      success: true,
      message: "Email verified successfully",
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isEmailVerified: user.isEmailVerified,
        isMobileVerified: user.isMobileVerified,
      },
    });
  } catch (error) {
    console.error("Verify email error:", error);

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
