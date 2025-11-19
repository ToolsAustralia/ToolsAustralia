import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { sign } from "jsonwebtoken";
import { createRateLimiter, getClientIdentifier } from "@/utils/security/rateLimiter";

const rawJwtSecret = process.env.NEXTAUTH_SECRET;
if (!rawJwtSecret) {
  throw new Error("NEXTAUTH_SECRET is required to sign login tokens.");
}
const jwtSecret = rawJwtSecret;

const loginSessionCookie = {
  name: "ta_session_token",
  maxAgeSeconds: 60 * 60 * 24 * 7,
};

const allowedOrigins = [
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://toolsaustralia.com.au",
  "http://localhost:3000",
];

const loginRateLimiter = createRateLimiter("auth-login", {
  windowMs: 60 * 1000, // 1 minute window
  maxRequests: 5, // 5 attempts per minute per IP
});

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export async function POST(request: NextRequest) {
  try {
    // Simple same-origin check: browsers always send the Origin header for POSTs,
    // so blocking mismatched origins protects this endpoint from CSRF attacks.
    const origin = request.headers.get("origin");
    if (origin) {
      const isAllowedOrigin = allowedOrigins.some((allowed) => {
        try {
          return new URL(allowed).origin === origin;
        } catch {
          return false;
        }
      });

      if (!isAllowedOrigin) {
        return NextResponse.json({ error: "Origin not allowed" }, { status: 403 });
      }
    }

    const identifier = getClientIdentifier(request.headers.get("x-real-ip"), request.headers.get("x-forwarded-for"));
    const rateCheck = loginRateLimiter.check(identifier);
    if (!rateCheck.success) {
      return NextResponse.json(
        { error: "Too many login attempts. Please wait a moment before trying again." },
        {
          status: 429,
          headers: {
            "Retry-After": rateCheck.retryAfterSeconds.toString(),
          },
        }
      );
    }

    await connectDB();

    const body = await request.json();
    const validatedData = loginSchema.parse(body);

    // Find user by email
    const user = await User.findOne({ email: validatedData.email });
    if (!user) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    // Check if user has a password set
    if (!user.password) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(validatedData.password, user.password);
    if (!isPasswordValid) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    // Create JWT token
    const token = sign(
      {
        userId: user._id,
        email: user.email,
        role: user.role,
      },
      jwtSecret,
      { expiresIn: "7d" }
    );

    // Return user without password
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password: _, ...userWithoutPassword } = user.toObject();

    const response = NextResponse.json({
      message: "Login successful",
      user: userWithoutPassword,
      token,
    });

    response.cookies.set({
      name: loginSessionCookie.name,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: loginSessionCookie.maxAgeSeconds,
    });

    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Validation error", details: error.issues }, { status: 400 });
    }
    console.error("Error logging in user:", error);
    return NextResponse.json({ error: "Failed to login user" }, { status: 500 });
  }
}
