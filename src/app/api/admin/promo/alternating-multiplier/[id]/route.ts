import { NextRequest, NextResponse } from "next/server";
import { requirePermissionWithAudit } from "@/lib/audit-log";
import connectDB from "@/lib/mongodb";
import AlternatingPromoMultiplier from "@/models/AlternatingPromoMultiplier";
import { z } from "zod";
import { zPromoMultiplier } from "@/lib/zod/promo-multiplier-schema";
import type {
  AlternatingPromoMultiplier as AlternatingPromoMultiplierType,
  AlternatingPromoMultiplierResponse,
  UpdateAlternatingPromoMultiplierPayload,
} from "@/types/admin";

type RouteParams = { params: Promise<{ id: string }> };

// Validation schema for updates
const updateAlternatingMultiplierSchema = z.object({
  multipliers: z
    .array(zPromoMultiplier)
    .length(2, "Must have exactly 2 multipliers")
    .refine((arr) => arr[0] !== arr[1], "Multipliers must be different")
    .optional(),
  isEnabled: z.boolean().optional(),
  description: z.string().max(500).optional(),
});

/**
 * PATCH /api/admin/promo/alternating-multiplier/[id]
 * Update existing alternating multiplier configuration
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const guard = await requirePermissionWithAudit("promos.edit", request, {
      resourceType: "AlternatingPromoMultiplier",
      resourceId: id,
    });
    if (guard instanceof NextResponse) return guard;
    const { log } = guard;
    const body = (await request.json()) as UpdateAlternatingPromoMultiplierPayload;

    // Validate input
    const validationResult = updateAlternatingMultiplierSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation failed",
          details: validationResult.error.issues,
        },
        { status: 400 }
      );
    }

    await connectDB();

    const config = await AlternatingPromoMultiplier.findByIdAndUpdate(
      id,
      {
        ...(validationResult.data.multipliers && {
          multipliers: validationResult.data.multipliers as [number, number],
        }),
        ...(validationResult.data.isEnabled !== undefined && {
          isEnabled: validationResult.data.isEnabled,
        }),
        ...(validationResult.data.description !== undefined && {
          description: validationResult.data.description,
        }),
      },
      { new: true, runValidators: true }
    )
      .populate("createdBy", "firstName lastName email")
      .exec();

    if (!config) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: "Configuration not found",
        } as AlternatingPromoMultiplierResponse,
        { status: 404 }
      );
    }

    const response: AlternatingPromoMultiplierType = {
      id: (config._id as { toString(): string }).toString(),
      type: config.type,
      multipliers: config.multipliers as [number, number],
      isEnabled: config.isEnabled,
      description: config.description,
      createdAt: config.createdAt.toISOString(),
      updatedAt: config.updatedAt.toISOString(),
      createdBy:
        config.createdBy && typeof config.createdBy === "object" && "firstName" in config.createdBy
          ? {
              id: String((config.createdBy as { _id?: { toString(): string } })._id || ""),
              email: String((config.createdBy as { email?: string }).email || ""),
              firstName: String((config.createdBy as { firstName?: string }).firstName || ""),
              lastName: String((config.createdBy as { lastName?: string }).lastName || ""),
            }
          : null,
    };

    await log(200);
    return NextResponse.json(
      {
        success: true,
        data: response,
        message: "Configuration updated successfully",
      } as AlternatingPromoMultiplierResponse,
      { status: 200 }
    );
  } catch (error) {
    console.error("Error updating alternating multiplier config:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to update alternating multiplier configuration",
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/promo/alternating-multiplier/[id]
 * Delete alternating multiplier configuration
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    const guard = await requirePermissionWithAudit("promos.delete", request, {
      resourceType: "AlternatingPromoMultiplier",
      resourceId: id,
    });
    if (guard instanceof NextResponse) return guard;
    const { log } = guard;

    await connectDB();

    const config = await AlternatingPromoMultiplier.findByIdAndDelete(id).exec();

    if (!config) {
      return NextResponse.json(
        {
          success: false,
          data: null,
          message: "Configuration not found",
        } as AlternatingPromoMultiplierResponse,
        { status: 404 }
      );
    }

    await log(200);
    return NextResponse.json(
      {
        success: true,
        data: null,
        message: "Configuration deleted successfully",
      } as AlternatingPromoMultiplierResponse,
      { status: 200 }
    );
  } catch (error) {
    console.error("Error deleting alternating multiplier config:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to delete alternating multiplier configuration",
      },
      { status: 500 }
    );
  }
}

