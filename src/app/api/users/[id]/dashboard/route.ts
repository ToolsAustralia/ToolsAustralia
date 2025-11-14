import { NextRequest, NextResponse } from "next/server";
import { getSampleUser, getRecentOrders } from "@/data";

/**
 * GET /api/users/[id]/dashboard
 * Get user dashboard data
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = getSampleUser(id);

    if (!user) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });
    }

    // Get dashboard-specific data
    // Note: Mini draws should be fetched from database in production
    const recentOrders = getRecentOrders(5).filter((order) => order.user === id);

    // Return user profile (no sensitive information in mock data)
    const userProfile = user;

    return NextResponse.json({
      success: true,
      data: {
        user: userProfile,
        activeMiniDraws: [], // Mini draws should be fetched from database
        recentOrders,
      },
    });
  } catch (error) {
    console.error("Error fetching dashboard data:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch dashboard data" }, { status: 500 });
  }
}
