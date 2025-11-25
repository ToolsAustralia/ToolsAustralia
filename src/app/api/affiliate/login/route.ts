import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateAffiliate, createAffiliateToken } from "@/lib/affiliate-auth";

const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

/**
 * POST /api/affiliate/login
 * Authenticate affiliate and create session
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = loginSchema.parse(body);

    // Authenticate affiliate
    const affiliate = await authenticateAffiliate(validatedData.username, validatedData.password);

    if (!affiliate) {
      return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
    }

    // Create JWT token
    const token = await createAffiliateToken(affiliate);

    // Set cookie with token
    const response = NextResponse.json({
      success: true,
      data: {
        affiliate: {
          id: affiliate._id,
          email: affiliate.email,
          username: affiliate.username,
          name: affiliate.name,
        },
      },
    });

    // Set HTTP-only cookie
    response.cookies.set("affiliate_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: "/",
    });

    return response;
  } catch (error) {
    console.error("Affiliate login error:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid input data", details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
