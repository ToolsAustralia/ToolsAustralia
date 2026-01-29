import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import ScheduledPromo from "@/models/ScheduledPromo";
import { z } from "zod";
import mongoose from "mongoose";
import { validateScheduledPromoOverlap } from "@/utils/promo/validate-scheduled-promo-overlap";

type RouteParams = { params: Promise<{ id: string }> };

const updateScheduledPromoSchema = z.object({
  type: z.enum(["membership-packages", "one-time-packages", "mini-packages"]).optional(),
  multiplier: z.union([z.literal(2), z.literal(3), z.literal(5), z.literal(10)]).optional(),
  startDate: z.string().datetime("Invalid start date format").optional(),
  endDate: z.string().datetime("Invalid end date format").optional(),
  name: z.string().max(200, "Name cannot exceed 200 characters").optional().nullable(),
  description: z.string().max(500, "Description cannot exceed 500 characters").optional().nullable(),
  isActive: z.boolean().optional(),
});

/**
 * PATCH /api/admin/promo/scheduled/[id]
 * Update a scheduled promo. Disallows overlapping date ranges per type (excluding this document).
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const { default: User } = await import("@/models/User");
    const user = await User.findOne({ email: session.user.email });
    if (!user || user.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid promo ID" }, { status: 400 });
    }

    const body = await request.json();
    const validatedData = updateScheduledPromoSchema.parse(body);

    const promo = await ScheduledPromo.findById(id);
    if (!promo) {
      return NextResponse.json({ error: "Scheduled promo not found" }, { status: 404 });
    }

    const type = validatedData.type ?? promo.type;
    const startDate = validatedData.startDate !== undefined ? new Date(validatedData.startDate) : promo.startDate;
    const endDate = validatedData.endDate !== undefined ? new Date(validatedData.endDate) : promo.endDate;

    if (startDate >= endDate) {
      return NextResponse.json({ success: false, error: "Start date must be before end date" }, { status: 400 });
    }

    const overlapping = await validateScheduledPromoOverlap(type, startDate, endDate, id);
    if (overlapping) {
      return NextResponse.json(
        {
          success: false,
          error: "Overlapping scheduled promo",
          conflict: {
            existingPromo: {
              id: String(overlapping._id),
              type: overlapping.type,
              multiplier: overlapping.multiplier,
              startDate: overlapping.startDate,
              endDate: overlapping.endDate,
            },
            message: `Another scheduled promo for ${type} exists in this date range. Please choose a different range.`,
          },
        },
        { status: 409 }
      );
    }

    if (validatedData.type !== undefined) promo.type = validatedData.type;
    if (validatedData.multiplier !== undefined) promo.multiplier = validatedData.multiplier;
    if (validatedData.startDate !== undefined) promo.startDate = new Date(validatedData.startDate);
    if (validatedData.endDate !== undefined) promo.endDate = new Date(validatedData.endDate);
    if (validatedData.name !== undefined) promo.name = validatedData.name ?? undefined;
    if (validatedData.description !== undefined) promo.description = validatedData.description ?? undefined;
    if (validatedData.isActive !== undefined) promo.isActive = validatedData.isActive;

    await promo.save();

    console.log(`✅ Updated scheduled promo ${id}`, { updatedBy: user.email });

    return NextResponse.json({
      success: true,
      message: "Scheduled promo updated successfully",
      data: {
        id: String(promo._id),
        type: promo.type,
        multiplier: promo.multiplier,
        startDate: promo.startDate,
        endDate: promo.endDate,
        isActive: promo.isActive,
        name: promo.name,
        description: promo.description,
        updatedAt: promo.updatedAt,
      },
    });
  } catch (error) {
    console.error("❌ Error updating scheduled promo:", error);

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
        error: "Failed to update scheduled promo",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/promo/scheduled/[id]
 * Soft delete: set isActive false and deletedAt so phase remains for audit.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const { default: User } = await import("@/models/User");
    const user = await User.findOne({ email: session.user.email });
    if (!user || user.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid promo ID" }, { status: 400 });
    }

    const promo = await ScheduledPromo.findById(id);
    if (!promo) {
      return NextResponse.json({ error: "Scheduled promo not found" }, { status: 404 });
    }

    promo.isActive = false;
    promo.deletedAt = new Date();
    await promo.save();

    console.log(`🗑️ Soft-deleted scheduled promo ${id}`, { deletedBy: user.email });

    return NextResponse.json({
      success: true,
      message: "Scheduled promo deleted successfully",
    });
  } catch (error) {
    console.error("❌ Error deleting scheduled promo:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to delete scheduled promo",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
