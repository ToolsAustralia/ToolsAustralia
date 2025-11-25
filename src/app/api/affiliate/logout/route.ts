import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/affiliate/logout
 * Clear affiliate session
 */
export async function POST(request: NextRequest) {
  const response = NextResponse.json({ success: true });

  // Clear affiliate token cookie
  response.cookies.set("affiliate_token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0,
    path: "/",
  });

  return response;
}

