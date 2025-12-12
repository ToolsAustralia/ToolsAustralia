import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import BonusEntryPromo from "@/models/BonusEntryPromo";
import { formatDateReadable } from "@/utils/common/timezone";

/**
 * GET /api/admin/promo/bonus-entry/active
 * Get currently active bonus entry promo for a specific type
 *
 * Query parameters:
 * - type: Package type (required) - "membership-packages", "one-time-packages", or "mini-packages"
 *
 * Returns the promo that is currently active based on current AEST time
 */
export async function GET(request: NextRequest) {
  try {
    // Check admin authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    // Get user from database to verify admin role
    const { default: User } = await import("@/models/User");
    const user = await User.findOne({ email: session.user.email });
    if (!user || user.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") as "membership-packages" | "one-time-packages" | "mini-packages" | null;

    if (!type) {
      return NextResponse.json({ error: "Type parameter is required" }, { status: 400 });
    }

    if (!["membership-packages", "one-time-packages", "mini-packages"].includes(type)) {
      return NextResponse.json({ error: "Invalid type parameter" }, { status: 400 });
    }

    // Get currently active promo for this type
    // A promo is active if:
    // 1. isActive is true
    // 2. Current time is between startDate and endDate
    const now = new Date();
    const activePromo = await BonusEntryPromo.findOne({
      type,
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now },
    })
      .populate("createdBy", "firstName lastName email")
      .sort({ createdAt: -1 })
      .lean();

    if (!activePromo) {
      return NextResponse.json({
        success: true,
        data: null,
        message: `No active bonus entry promo found for ${type}`,
      });
    }

    // Format response
    const formattedPromo = {
      id: activePromo._id.toString(),
      type: activePromo.type,
      bonusEntries: activePromo.bonusEntries,
      startDate: activePromo.startDate,
      endDate: activePromo.endDate,
      startDateFormatted: formatDateReadable(activePromo.startDate),
      endDateFormatted: formatDateReadable(activePromo.endDate),
      isActive: activePromo.isActive,
      description: activePromo.description,
      createdAt: activePromo.createdAt,
      createdBy: activePromo.createdBy
        ? {
            id: (activePromo.createdBy as { _id: { toString: () => string } })._id.toString(),
            firstName: (activePromo.createdBy as { firstName?: string }).firstName,
            lastName: (activePromo.createdBy as { lastName?: string }).lastName,
            email: (activePromo.createdBy as { email?: string }).email,
          }
        : null,
    };

    return NextResponse.json({
      success: true,
      data: formattedPromo,
    });
  } catch (error) {
    console.error("❌ Error fetching active bonus entry promo:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch active bonus entry promo",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
