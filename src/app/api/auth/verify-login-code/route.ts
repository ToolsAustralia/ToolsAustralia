import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { timingSafeEqual } from "crypto";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { signJWT } from "@/lib/jwt";
import { createDistributedRateLimiter, getClientIdentifier } from "@/utils/security/rateLimiter";

const verifyLoginCodeSchema = z.object({
  email: z.string().email("Invalid email address"),
  loginCode: z.string().length(6, "Sign-in code must be 6 characters"),
});

const MAX_ATTEMPTS = 5;

// Per-IP limit so an attacker cannot reset the per-user attempt counter by
// requesting a fresh code and brute-forcing across many codes.
const verifyLoginCodeRateLimiter = createDistributedRateLimiter("auth-verify-login-code", {
  windowMs: 5 * 60 * 1000, // 5 minute window
  maxRequests: 10,
});

// Constant-time comparison so a wrong code leaks nothing via response timing.
function codeMatches(stored: string, provided: string): boolean {
  const a = Buffer.from(stored);
  const b = Buffer.from(provided);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * POST /api/auth/verify-login-code
 * Verify the one-time login code and return a JWT for session creation
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = verifyLoginCodeSchema.parse(body);

    const identifier = getClientIdentifier(
      request.headers.get("x-real-ip"),
      request.headers.get("x-forwarded-for")
    );
    const rateCheck = await verifyLoginCodeRateLimiter.check(identifier);
    if (!rateCheck.success) {
      return NextResponse.json(
        { success: false, error: "Too many attempts. Please wait a moment and try again." },
        { status: 429, headers: { "Retry-After": rateCheck.retryAfterSeconds.toString() } }
      );
    }

    await connectDB();

    const user = await User.findOne({ email: validatedData.email.toLowerCase() });
    if (!user) {
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 404 }
      );
    }

    if (!user.loginCode || !user.loginCodeExpires) {
      return NextResponse.json(
        { success: false, error: "No sign-in code found. Please request a new one." },
        { status: 400 }
      );
    }

    if (new Date() > user.loginCodeExpires) {
      user.loginCode = undefined;
      user.loginCodeExpires = undefined;
      user.loginCodeAttempts = 0;
      await user.save();

      return NextResponse.json(
        { success: false, error: "Sign-in code has expired. Please request a new one." },
        { status: 400 }
      );
    }

    const attempts = user.loginCodeAttempts || 0;
    if (attempts >= MAX_ATTEMPTS) {
      user.loginCode = undefined;
      user.loginCodeExpires = undefined;
      user.loginCodeAttempts = 0;
      await user.save();

      return NextResponse.json(
        { success: false, error: "Too many failed attempts. Please request a new sign-in code." },
        { status: 400 }
      );
    }

    const codeMatch = codeMatches(user.loginCode, validatedData.loginCode.toUpperCase());
    if (!codeMatch) {
      user.loginCodeAttempts = attempts + 1;
      await user.save();

      const remaining = MAX_ATTEMPTS - user.loginCodeAttempts;
      return NextResponse.json(
        {
          success: false,
          error: `Invalid sign-in code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`,
        },
        { status: 400 }
      );
    }

    // Code valid — but a deactivated account must never mint a bridge token.
    // Checked AFTER code validation so account status is only revealed to the
    // inbox holder; the auto-login provider re-checks isActive as a backstop.
    if (user.isActive === false) {
      return NextResponse.json(
        { success: false, error: "This account has been deactivated. Please contact an administrator." },
        { status: 403 }
      );
    }

    // Code valid - clear it and create session token
    user.loginCode = undefined;
    user.loginCodeExpires = undefined;
    user.loginCodeAttempts = 0;
    user.lastLogin = new Date();
    await user.save();

    const token = await signJWT({
      sub: user._id.toString(),
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
    });

    return NextResponse.json({
      success: true,
      message: "Sign-in successful",
      token,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    });
  } catch (error) {
    console.error("Verify login code error:", error);

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
