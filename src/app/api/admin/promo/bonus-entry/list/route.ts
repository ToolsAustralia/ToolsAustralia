import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import BonusEntryPromo from "@/models/BonusEntryPromo";
import { convertUTCToAEST, formatDateReadable } from "@/utils/common/timezone";

/**
 * GET /api/admin/promo/bonus-entry/list
 * Get all bonus entry promos (active and inactive)
 *
 * Query parameters:
 * - type: Filter by package type (optional)
 * - isActive: Filter by active status (optional)
 * - dateFrom: Filter promos starting after this date (optional)
 * - dateTo: Filter promos ending before this date (optional)
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

    // Parse query parameters
    const type = searchParams.get("type") as "membership-packages" | "one-time-packages" | "mini-packages" | null;
    const isActiveParam = searchParams.get("isActive");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");

    // Build filter query
    const filter: Record<string, unknown> = {};

    if (type) {
      filter.type = type;
    }

    if (isActiveParam !== null) {
      filter.isActive = isActiveParam === "true";
    }

    if (dateFrom || dateTo) {
      filter.startDate = {};
      if (dateFrom) {
        (filter.startDate as Record<string, unknown>).$gte = new Date(dateFrom);
      }
      if (dateTo) {
        (filter.startDate as Record<string, unknown>).$lte = new Date(dateTo);
      }
    }

    // Fetch all bonus entry promos matching the filter
    const promos = await BonusEntryPromo.find(filter)
      .populate("createdBy", "firstName lastName email")
      .sort({ createdAt: -1 })
      .lean();

    // Map promos to response format with formatted dates
    const now = new Date();
    const promosWithFormattedDates = promos.map((promo) => {
      const isCurrentlyActive = promo.isActive && now >= promo.startDate && now <= promo.endDate;
      const isUpcoming = promo.isActive && promo.startDate > now;
      const isExpired = !promo.isActive || promo.endDate < now;

      return {
        id: promo._id.toString(),
        type: promo.type,
        bonusEntries: promo.bonusEntries,
        startDate: promo.startDate,
        endDate: promo.endDate,
        startDateFormatted: formatDateReadable(promo.startDate),
        endDateFormatted: formatDateReadable(promo.endDate),
        isActive: promo.isActive,
        isCurrentlyActive,
        isUpcoming,
        isExpired,
        description: promo.description,
        createdAt: promo.createdAt,
        updatedAt: promo.updatedAt,
        createdBy: promo.createdBy
          ? {
              id: (promo.createdBy as { _id: { toString: () => string } })._id.toString(),
              firstName: (promo.createdBy as { firstName?: string }).firstName,
              lastName: (promo.createdBy as { lastName?: string }).lastName,
              email: (promo.createdBy as { email?: string }).email,
            }
          : null,
      };
    });

    return NextResponse.json({
      success: true,
      data: promosWithFormattedDates,
      count: promosWithFormattedDates.length,
    });
  } catch (error) {
    console.error("❌ Error fetching bonus entry promos:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch bonus entry promos",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
