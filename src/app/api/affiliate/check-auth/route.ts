import { NextResponse } from "next/server";
import { getAffiliateSession } from "@/utils/affiliate/get-affiliate-session";

/**
 * GET /api/affiliate/check-auth
 * Check if affiliate is authenticated (client-side check)
 */
export async function GET() {
  try {
    const session = await getAffiliateSession();

    if (!session) {
      return NextResponse.json({
        success: true,
        authenticated: false,
        affiliate: null,
      });
    }

    return NextResponse.json({
      success: true,
      authenticated: true,
      affiliate: {
        affiliateId: session.affiliateId,
        email: session.email,
        username: session.username,
        name: session.name,
      },
    });
  } catch (error) {
    console.error("Error checking affiliate auth:", error);
    return NextResponse.json({
      success: true,
      authenticated: false,
      affiliate: null,
    });
  }
}

