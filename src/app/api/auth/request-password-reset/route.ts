import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { z } from "zod";
import crypto from "crypto";
import { emailService, passwordResetRateLimiter } from "@/lib/email";

const requestSchema = z.object({
  email: z.string().email("Invalid email"),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input", issues: parsed.error.issues }, { status: 400 });
    }

    const { email } = parsed.data;

    const rateLimit = passwordResetRateLimiter.checkLimit(email);
    if (!rateLimit.allowed) {
      const resetMinutes = Math.ceil((rateLimit.resetTime - Date.now()) / 60000);
      return NextResponse.json(
        {
          success: false,
          error: `Too many requests. Try again in ${resetMinutes} minutes.`,
          rateLimit,
        },
        { status: 429 }
      );
    }

    await connectDB();
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return NextResponse.json(
        { success: false, error: "No account found with this email address. Please check your email and try again." },
        { status: 404 }
      );
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetCode = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 60 minutes

    user.passwordResetToken = resetToken;
    user.passwordResetExpires = expiresAt;
    await user.save();

    const resetUrl = `${
      process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || ""
    }/reset-password?token=${resetToken}`;
    
    const emailResult = await emailService.sendPasswordResetEmail(user.email, {
      userName: user.firstName || 'User',
      resetUrl,
      resetCode,
      expiryMinutes: 60,
    });

    if (!emailResult.success) {
      console.error('Failed to send password reset email:', emailResult.error);
      return NextResponse.json(
        {
          success: false,
          error: emailResult.error || 'Failed to send password reset email',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Password reset email sent",
      rateLimit,
    });
  } catch (error) {
    console.error("Request password reset error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error", details: error instanceof Error ? error.message : "Unknown" },
      { status: 500 }
    );
  }
}
