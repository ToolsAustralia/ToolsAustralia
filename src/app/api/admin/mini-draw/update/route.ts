import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import MiniDraw from "@/models/MiniDraw";
import { z } from "zod";
import { shouldLockConfiguration } from "@/utils/draws/mini-draw-helpers";
import { brandLogos } from "@/data/brandLogos";

const brandIds = brandLogos.map((brand) => brand.id) as [string, ...string[]];

// Validation schema for mini draw updates
const miniDrawUpdateSchema = z.object({
  id: z.string().min(1, "Mini draw ID is required"),
  name: z.string().min(1, "Name is required").max(200, "Name too long").optional(),
  description: z.string().min(1, "Description is required").max(2000, "Description too long").optional(),
  status: z.enum(["active", "completed", "cancelled"]).optional(),
  minimumEntries: z.number().int().min(1, "Minimum entries must be at least 1").optional(),
  brandId: z.enum(brandIds).optional(),
  displayOrder: z.number().int().optional(),
  prize: z
    .object({
      name: z.string().min(1, "Prize name is required").optional(),
      description: z.string().min(1, "Prize description is required").optional(),
      value: z.number().min(0, "Prize value must be positive").optional(),
      category: z
        .enum(["vehicle", "electronics", "travel", "cash", "experience", "home", "fashion", "sports", "other"])
        .optional(),
      images: z.array(z.string()).min(1, "At least one prize image is required").optional(),
    })
    .optional(),
});

/**
 * PUT /api/admin/mini-draw/update
 * Update mini draw (respects configuration lock)
 */
export async function PUT(request: NextRequest) {
  try {
    const _guard = await requirePermission("miniDraws.edit");
    if (_guard instanceof NextResponse) return _guard;

    await connectDB();

    // Parse and validate request body
    const body = await request.json();
    const validatedData = miniDrawUpdateSchema.parse(body);

    // Find the mini draw
    const miniDraw = await MiniDraw.findById(validatedData.id);
    if (!miniDraw) {
      return NextResponse.json({ error: "Mini draw not found" }, { status: 404 });
    }

    // Check if configuration is locked
    if (shouldLockConfiguration(miniDraw)) {
      return NextResponse.json(
        {
          success: false,
          error: "Mini draw configuration is locked",
          details: "Cannot modify mini draw after entries have been frozen or draw has been completed",
        },
        { status: 403 }
      );
    }

    // Update fields
    if (validatedData.name !== undefined) {
      miniDraw.name = validatedData.name.trim();
    }
    if (validatedData.description !== undefined) {
      miniDraw.description = validatedData.description.trim();
    }
    if (validatedData.status !== undefined) {
      miniDraw.status = validatedData.status;
      // Update isActive for backward compatibility
      miniDraw.isActive = validatedData.status === "active";
    }
    if (validatedData.minimumEntries !== undefined) {
      miniDraw.minimumEntries = validatedData.minimumEntries;
    }
    if (validatedData.brandId !== undefined) {
      miniDraw.brandId = validatedData.brandId;
    }
    if (validatedData.displayOrder !== undefined) {
      miniDraw.displayOrder = validatedData.displayOrder;
    }

    // Update prize if provided
    if (validatedData.prize) {
      if (validatedData.prize.name !== undefined) {
        miniDraw.prize.name = validatedData.prize.name.trim();
      }
      if (validatedData.prize.description !== undefined) {
        miniDraw.prize.description = validatedData.prize.description.trim();
      }
      if (validatedData.prize.value !== undefined) {
        miniDraw.prize.value = validatedData.prize.value;
      }
      if (validatedData.prize.category !== undefined) {
        miniDraw.prize.category = validatedData.prize.category;
      }
      if (validatedData.prize.images !== undefined) {
        miniDraw.prize.images = validatedData.prize.images;
      }
    }

    await miniDraw.save();

    console.log(`✅ Mini draw updated successfully: ${miniDraw.name} (ID: ${miniDraw._id})`);

    return NextResponse.json({
      success: true,
      data: {
        miniDraw: {
          _id: miniDraw._id,
          name: miniDraw.name,
          description: miniDraw.description,
          status: miniDraw.status,
          configurationLocked: miniDraw.configurationLocked,
          prize: miniDraw.prize,
          totalEntries: miniDraw.totalEntries,
          updatedAt: miniDraw.updatedAt,
        },
      },
      message: "Mini draw updated successfully",
    });
  } catch (error) {
    console.error("❌ Error updating mini draw:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation error",
          details: error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Failed to update mini draw",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
