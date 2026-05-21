import { NextRequest, NextResponse } from "next/server";
import { requirePermissionWithAudit } from "@/lib/audit-log";
import connectDB from "@/lib/mongodb";
import BonusEntryPromo from "@/models/BonusEntryPromo";
import { z } from "zod";
// Note: We import createAESTDateAsUTC dynamically to avoid circular dependencies
import mongoose from "mongoose";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * Validation schema for updating bonus entry promo
 */
const updateBonusEntryPromoSchema = z.object({
  type: z.enum(["membership-packages", "one-time-packages", "mini-packages"]).optional(),
  bonusEntries: z.number().int().min(1, "Bonus entries must be at least 1").optional(),
  startDate: z.string().datetime("Invalid start date format").optional(),
  endDate: z.string().datetime("Invalid end date format").optional(),
  description: z.string().max(500, "Description cannot exceed 500 characters").optional(),
  isActive: z.boolean().optional(),
});

/**
 * PATCH /api/admin/promo/bonus-entry/[id]
 * Update a bonus entry promo
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const guard = await requirePermissionWithAudit("promos.edit", request, {
      resourceType: "BonusEntryPromo",
      resourceId: id,
    });
    if (guard instanceof NextResponse) return guard;
    const { log } = guard;

    await connectDB();

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid promo ID" }, { status: 400 });
    }

    // Parse and validate request body
    const body = await request.json();
    const validatedData = updateBonusEntryPromoSchema.parse(body);

    // Find the promo
    const promo = await BonusEntryPromo.findById(id);
    if (!promo) {
      return NextResponse.json({ error: "Bonus entry promo not found" }, { status: 404 });
    }

    // Update fields
    if (validatedData.type !== undefined) {
      promo.type = validatedData.type;
    }

    if (validatedData.bonusEntries !== undefined) {
      promo.bonusEntries = validatedData.bonusEntries;
    }

    if (validatedData.startDate !== undefined) {
      // Frontend modal already handles timezone conversion properly
      // The date is already in UTC representing the AEST/AEDT time selected
      promo.startDate = new Date(validatedData.startDate);
    }

    if (validatedData.endDate !== undefined) {
      // Frontend modal already handles timezone conversion properly
      // The date is already in UTC representing the AEST/AEDT time selected
      promo.endDate = new Date(validatedData.endDate);
    }

    if (validatedData.description !== undefined) {
      promo.description = validatedData.description || undefined;
    }

    if (validatedData.isActive !== undefined) {
      promo.isActive = validatedData.isActive;
    }

    // Validate date relationships if both dates are being updated
    if (validatedData.startDate !== undefined || validatedData.endDate !== undefined) {
      if (promo.startDate >= promo.endDate) {
        return NextResponse.json({ success: false, error: "Start date must be before end date" }, { status: 400 });
      }
    }

    await promo.save();

    console.log(`✅ Updated bonus entry promo ${id}`);

    await log(200);
    return NextResponse.json({
      success: true,
      message: "Bonus entry promo updated successfully",
      data: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        id: (promo._id as any).toString(),
        type: promo.type,
        bonusEntries: promo.bonusEntries,
        startDate: promo.startDate,
        endDate: promo.endDate,
        isActive: promo.isActive,
        description: promo.description,
        updatedAt: promo.updatedAt,
      },
    });
  } catch (error) {
    console.error("❌ Error updating bonus entry promo:", error);

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
        error: "Failed to update bonus entry promo",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/promo/bonus-entry/[id]
 * Delete a bonus entry promo
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const guard = await requirePermissionWithAudit("promos.delete", request, {
      resourceType: "BonusEntryPromo",
      resourceId: id,
    });
    if (guard instanceof NextResponse) return guard;
    const { log } = guard;

    await connectDB();

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid promo ID" }, { status: 400 });
    }

    // Find and delete the promo
    const promo = await BonusEntryPromo.findByIdAndDelete(id);
    if (!promo) {
      return NextResponse.json({ error: "Bonus entry promo not found" }, { status: 404 });
    }

    console.log(`🗑️ Deleted bonus entry promo ${id}`);

    await log(200);
    return NextResponse.json({
      success: true,
      message: "Bonus entry promo deleted successfully",
    });
  } catch (error) {
    console.error("❌ Error deleting bonus entry promo:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to delete bonus entry promo",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
