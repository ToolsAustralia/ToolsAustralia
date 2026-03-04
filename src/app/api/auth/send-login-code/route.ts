import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import {
  emailService,
  generateEmailVerificationCode,
  checkLoginCodeRateLimit,
  getLoginCodeExpiry,
  getLoginCodeExpiryMinutes,
} from "@/lib/email/";

const sendLoginCodeSchema = z.object({
  email: z.string().email("Invalid email address"),
});

/**
 * POST /api/auth/send-login-code
 * Send a one-time login code to the user's email for passwordless sign-in
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = sendLoginCodeSchema.parse(body);

    const rateLimitResult = checkLoginCodeRateLimit(validatedData.email);
    if (!rateLimitResult.allowed) {
      const resetMinutes = Math.ceil((rateLimitResult.resetTime - Date.now()) / 60000);
      return NextResponse.json(
        {
          success: false,
          error: `You can request a sign-in code only once every 5 minutes. Please try again after ${resetMinutes} minute${resetMinutes === 1 ? "" : "s"}.`,
        },
        { status: 429 }
      );
    }

    await connectDB();

    const user = await User.findOne({ email: validatedData.email.toLowerCase() });
    if (!user) {
      return NextResponse.json(
        { success: false, error: "No account found with this email address." },
        { status: 404 }
      );
    }

    if (!user.isEmailVerified) {
      return NextResponse.json(
        { success: false, error: "Please verify your email first before using sign-in codes." },
        { status: 400 }
      );
    }

    const loginCode = generateEmailVerificationCode();
    const expiresAt = getLoginCodeExpiry();

    user.loginCode = loginCode;
    user.loginCodeExpires = expiresAt;
    user.loginCodeAttempts = 0;
    await user.save();

    const expiryMinutes = getLoginCodeExpiryMinutes();
    const emailResult = await emailService.sendLoginCodeEmail(user.email, {
      userName: user.firstName,
      loginCode,
      expiryMinutes,
    });

    if (!emailResult.success) {
      user.loginCode = undefined;
      user.loginCodeExpires = undefined;
      await user.save();

      return NextResponse.json(
        { success: false, error: emailResult.error || "Failed to send sign-in code" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Sign-in code sent to your email",
    });
  } catch (error) {
    console.error("Send login code error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Invalid request data", details: error.issues },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
