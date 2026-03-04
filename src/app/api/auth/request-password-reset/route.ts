import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { z } from "zod";
import crypto from "crypto";
import {
  emailService,
  checkPasswordResetRateLimit,
  getPasswordResetExpiry,
  getPasswordResetExpiryMinutes,
} from "@/lib/email/";

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

    const rateLimit = checkPasswordResetRateLimit(email);
    if (!rateLimit.allowed) {
      const retryAfterSeconds = Math.ceil((rateLimit.resetTime - Date.now()) / 1000);
      const retryAfterMinutes = Math.ceil(retryAfterSeconds / 60);
      return NextResponse.json(
        {
          success: false,
          error: `You can request a password reset only once every 5 minutes. Please try again after ${retryAfterMinutes} minute${retryAfterMinutes === 1 ? '' : 's'}.`,
          retryAfterSeconds,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfterSeconds),
          },
        }
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
    const expiresAt = getPasswordResetExpiry();

    user.passwordResetToken = resetToken;
    user.passwordResetExpires = expiresAt;
    await user.save();

    // In development, use request origin so reset link points to localhost when testing locally
    let baseUrl = (process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
    if (process.env.NODE_ENV === "development") {
      try {
        const requestOrigin = request.headers.get("origin") || request.headers.get("referer")?.replace(/\/$/, "");
        if (requestOrigin) {
          const originUrl = new URL(requestOrigin);
          baseUrl = originUrl.origin;
        } else {
          const url = new URL(request.url);
          baseUrl = url.origin;
        }
      } catch {
        baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
      }
    }

    const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`;
    await emailService.sendPasswordResetEmail(user.email, {
      userName: user.firstName,
      resetUrl,
      resetCode,
      expiryMinutes: getPasswordResetExpiryMinutes(),
    });

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
