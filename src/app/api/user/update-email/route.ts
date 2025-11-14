import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { z } from "zod";
import {
  sendEmailVerificationCode,
  generateEmailVerificationCode,
  checkEmailRateLimit,
  getEmailVerificationExpiry,
} from "@/lib/email";

const updateEmailSchema = z.object({
  newEmail: z.string().email("Invalid email address"),
});

/**
 * POST /api/user/update-email
 * Update user's email address and send verification code to new email
 */
export async function POST(request: NextRequest) {
  try {
    console.log("📧 Email update request received");

    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse and validate request body
    const body = await request.json();
    const validatedData = updateEmailSchema.parse(body);

    console.log("✅ Request validation successful");

    // Check if new email is different from current email
    if (validatedData.newEmail.toLowerCase() === session.user.email.toLowerCase()) {
      return NextResponse.json(
        {
          success: false,
          error: "New email must be different from current email",
        },
        { status: 400 }
      );
    }

    // Check rate limiting for the new email
    const rateLimitResult = checkEmailRateLimit(validatedData.newEmail);
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

    // Find current user
    const user = await User.findOne({ email: session.user.email });
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: "User not found",
        },
        { status: 404 }
      );
    }

    // Check if new email already exists (excluding current user)
    const existingUser = await User.findOne({
      email: validatedData.newEmail.toLowerCase(),
      _id: { $ne: user._id },
    });
    if (existingUser) {
      return NextResponse.json(
        {
          success: false,
          error: "Email already taken",
          field: "email",
          message: "An account with this email address already exists. Please use a different email.",
        },
        { status: 400 }
      );
    }

    // Generate verification code for new email
    const verificationCode = generateEmailVerificationCode();
    const expiresAt = getEmailVerificationExpiry();

    // Update user's email and verification status
    user.email = validatedData.newEmail.toLowerCase();
    user.emailVerificationCode = verificationCode;
    user.emailVerificationExpires = expiresAt;
    user.emailVerificationAttempts = 0;
    user.isEmailVerified = false; // Reset verification status

    await user.save();

    console.log(`✅ User email updated from ${session.user.email} to ${validatedData.newEmail}`);

    // Send verification code to new email
    try {
      await sendEmailVerificationCode(validatedData.newEmail, verificationCode, user.firstName);
      console.log(`✅ Verification code sent to new email: ${validatedData.newEmail}`);
    } catch (emailError) {
      console.error("❌ Failed to send verification email:", emailError);
      // Don't fail the request if email sending fails - user can request resend
    }

    return NextResponse.json({
      success: true,
      message: "Email updated successfully. Verification code sent to new email.",
      user: {
        id: user._id.toString(),
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isEmailVerified: user.isEmailVerified,
      },
    });
  } catch (error) {
    console.error("❌ Email update error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid input",
          details: error.issues,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
