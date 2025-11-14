import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import Promo from "@/models/Promo";
import { z } from "zod";

// Validation schema for query parameters
const historyQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 1)),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 10)),
  type: z.enum(["one-time-packages", "mini-packages"]).optional(),
});

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

    // Parse and validate query parameters
    const { searchParams } = new URL(request.url);
    const queryParams = Object.fromEntries(searchParams.entries());
    const { page, limit, type } = historyQuerySchema.parse(queryParams);

    // Validate pagination parameters
    const validPage = Math.max(1, page);
    const validLimit = Math.min(100, Math.max(1, limit)); // Max 100 items per page
    const skip = (validPage - 1) * validLimit;

    // Build filter object
    const filter: Record<string, string> = {};
    if (type) {
      filter.type = type;
    }

    // Get total count for pagination
    const totalCount = await Promo.countDocuments(filter);

    // Get promos with pagination
    const promos = await Promo.find(filter)
      .populate("createdBy", "firstName lastName email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(validLimit)
      .lean();

    // Calculate additional fields for each promo
    const promosWithDetails = promos.map((promo) => {
      const now = new Date();
      const timeRemaining = promo.endDate.getTime() - now.getTime();
      const isExpired = timeRemaining <= 0;
      const isActive = promo.isActive && !isExpired;

      return {
        id: promo._id,
        type: promo.type,
        multiplier: promo.multiplier,
        startDate: promo.startDate,
        endDate: promo.endDate,
        duration: promo.duration,
        isActive,
        isExpired,
        timeRemaining: Math.max(0, timeRemaining),
        createdAt: promo.createdAt,
        updatedAt: promo.updatedAt,
        createdBy: promo.createdBy
          ? {
              id: promo.createdBy._id,
              name: `${promo.createdBy.firstName} ${promo.createdBy.lastName}`,
              email: promo.createdBy.email,
            }
          : null,
      };
    });

    // Calculate pagination info
    const totalPages = Math.ceil(totalCount / validLimit);
    const hasNextPage = validPage < totalPages;
    const hasPrevPage = validPage > 1;

    return NextResponse.json({
      success: true,
      data: promosWithDetails,
      pagination: {
        currentPage: validPage,
        totalPages,
        totalCount,
        limit: validLimit,
        hasNextPage,
        hasPrevPage,
      },
    });
  } catch (error) {
    console.error("❌ Error fetching promo history:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation error",
          details: error.issues.map((err) => ({
            field: err.path.join("."),
            message: err.message,
          })),
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch promo history",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
