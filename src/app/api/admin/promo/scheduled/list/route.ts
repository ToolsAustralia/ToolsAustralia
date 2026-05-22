import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import ScheduledPromo from "@/models/ScheduledPromo";
import { formatDateReadable } from "@/utils/common/timezone";

/**
 * GET /api/admin/promo/scheduled/list
 * Get all scheduled promos (excludes soft-deleted by default)
 *
 * Query parameters:
 * - type: Filter by package type (optional)
 * - isActive: Filter by active status (optional)
 * - dateFrom: Filter promos starting after this date (optional)
 * - dateTo: Filter promos ending before this date (optional)
 * - includeDeleted: Include soft-deleted (optional, default false)
 */
export async function GET(request: NextRequest) {
  try {
    const guard = await requirePermission("promos.view");
    if (guard instanceof NextResponse) return guard;

    await connectDB();

    const { searchParams } = new URL(request.url);

    const type = searchParams.get("type") as "membership-packages" | "one-time-packages" | "mini-packages" | null;
    const isActiveParam = searchParams.get("isActive");
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    const includeDeleted = searchParams.get("includeDeleted") === "true";

    const filter: Record<string, unknown> = {};

    if (type) {
      filter.type = type;
    }

    if (isActiveParam !== null && isActiveParam !== undefined && isActiveParam !== "") {
      filter.isActive = isActiveParam === "true";
    }

    if (!includeDeleted) {
      filter.$or = [{ deletedAt: null }, { deletedAt: { $exists: false } }];
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

    const promos = await ScheduledPromo.find(filter)
      .populate("createdBy", "firstName lastName email")
      .sort({ startDate: 1 })
      .lean();

    const now = new Date();
    const promosWithFormattedDates = promos.map((promo) => {
      const p = promo as {
        _id: { toString: () => string };
        type: string;
        multiplier: number;
        startDate: Date;
        endDate: Date;
        isActive: boolean;
        name?: string;
        description?: string;
        deletedAt?: Date;
        createdAt: Date;
        updatedAt: Date;
        createdBy?: { _id: { toString: () => string }; firstName?: string; lastName?: string; email?: string };
      };
      const isCurrentlyActive = p.isActive && !p.deletedAt && now >= p.startDate && now <= p.endDate;
      const isUpcoming = p.isActive && !p.deletedAt && p.startDate > now;
      const isExpired = p.deletedAt || !p.isActive || p.endDate < now;

      return {
        id: p._id.toString(),
        type: p.type,
        multiplier: p.multiplier,
        startDate: p.startDate,
        endDate: p.endDate,
        startDateFormatted: formatDateReadable(p.startDate),
        endDateFormatted: formatDateReadable(p.endDate),
        isActive: p.isActive,
        isCurrentlyActive,
        isUpcoming,
        isExpired,
        name: p.name,
        description: p.description,
        deletedAt: p.deletedAt,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        createdBy: p.createdBy
          ? {
              id: p.createdBy._id.toString(),
              firstName: p.createdBy.firstName,
              lastName: p.createdBy.lastName,
              email: p.createdBy.email,
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
    console.error("❌ Error fetching scheduled promos:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch scheduled promos",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
