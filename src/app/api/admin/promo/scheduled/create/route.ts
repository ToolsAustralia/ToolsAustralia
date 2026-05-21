import { NextRequest, NextResponse } from "next/server";
import { requirePermissionWithAudit } from "@/lib/audit-log";
import connectDB from "@/lib/mongodb";
import ScheduledPromo from "@/models/ScheduledPromo";
import { z } from "zod";
import { validateScheduledPromoOverlap } from "@/utils/promo/validate-scheduled-promo-overlap";
import { zPromoMultiplier } from "@/lib/zod/promo-multiplier-schema";

const createScheduledPromoSchema = z.object({
  type: z.enum(["membership-packages", "one-time-packages", "mini-packages"]),
  multiplier: zPromoMultiplier,
  startDate: z.string().datetime("Invalid start date format"),
  endDate: z.string().datetime("Invalid end date format"),
  name: z.string().max(200, "Name cannot exceed 200 characters").optional(),
  description: z.string().max(500, "Description cannot exceed 500 characters").optional(),
});

/**
 * POST /api/admin/promo/scheduled/create
 * Create a new scheduled promo phase. Disallows overlapping date ranges per type.
 */
export async function POST(request: NextRequest) {
  try {
    const guard = await requirePermissionWithAudit("promos.edit", request, { resourceType: "ScheduledPromo" });
    if (guard instanceof NextResponse) return guard;
    const { session, log } = guard;

    await connectDB();

    const body = await request.json();
    const validatedData = createScheduledPromoSchema.parse(body);

    const { type, multiplier, startDate, endDate, name, description } = validatedData;

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start >= end) {
      return NextResponse.json({ success: false, error: "Start date must be before end date" }, { status: 400 });
    }

    const overlapping = await validateScheduledPromoOverlap(type, start, end);
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
            message: `A scheduled promo for ${type} already exists in this date range. Please choose a different range or edit the existing phase.`,
          },
        },
        { status: 409 }
      );
    }

    const newPromo = new ScheduledPromo({
      type,
      multiplier,
      startDate: start,
      endDate: end,
      isActive: true,
      createdBy: session.user.id,
      name: name || undefined,
      description: description || undefined,
    });

    await newPromo.save();

    console.log(`✅ Created scheduled promo for ${type}`, {
      id: newPromo._id,
      multiplier: newPromo.multiplier,
      startDate: newPromo.startDate,
      endDate: newPromo.endDate,
    });

    await log(201);
    return NextResponse.json(
      {
        success: true,
        message: `Successfully created scheduled ${multiplier}x promo for ${type}`,
        data: {
          id: String(newPromo._id),
          type: newPromo.type,
          multiplier: newPromo.multiplier,
          startDate: newPromo.startDate,
          endDate: newPromo.endDate,
          isActive: newPromo.isActive,
          name: newPromo.name,
          description: newPromo.description,
          createdAt: newPromo.createdAt,
          createdBy: {
            id: session.user.id,
          },
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("❌ Error creating scheduled promo:", error);

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
        error: "Failed to create scheduled promo",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
