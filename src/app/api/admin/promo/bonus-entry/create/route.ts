import { NextRequest, NextResponse } from "next/server";
import { requirePermissionWithAudit } from "@/lib/audit-log";
import connectDB from "@/lib/mongodb";
import BonusEntryPromo from "@/models/BonusEntryPromo";
import { z } from "zod";
// Note: We import createAESTDateAsUTC dynamically to avoid circular dependencies

/**
 * Validation schema for creating bonus entry promo
 * Dates are expected in ISO string format (from datetime picker)
 * They will be converted from AEST to UTC for storage
 */
const createBonusEntryPromoSchema = z.object({
  type: z.enum(["membership-packages", "one-time-packages", "mini-packages"]),
  bonusEntries: z.number().int().min(1, "Bonus entries must be at least 1"),
  startDate: z.string().datetime("Invalid start date format"),
  endDate: z.string().datetime("Invalid end date format"),
  description: z.string().max(500, "Description cannot exceed 500 characters").optional(),
  forceCreate: z.boolean().optional(), // For conflict resolution
});

/**
 * POST /api/admin/promo/bonus-entry/create
 * Create a new bonus entry promo
 *
 * This endpoint creates a date-based promo that grants bonus entries
 * when users purchase packages during the specified date range.
 *
 * Only one active promo per package type is allowed at a time.
 * If an existing active promo exists, it will be deactivated (unless forceCreate is false).
 */
export async function POST(request: NextRequest) {
  try {
    const guard = await requirePermissionWithAudit("promos.edit", request, { resourceType: "BonusEntryPromo" });
    if (guard instanceof NextResponse) return guard;
    const { session, log } = guard;

    await connectDB();

    // Parse and validate request body
    const body = await request.json();
    const validatedData = createBonusEntryPromoSchema.parse(body);

    const { type, bonusEntries, startDate, endDate, description, forceCreate } = validatedData;

    // TIMEZONE HANDLING:
    // The frontend modal now handles timezone conversion properly:
    // 1. DateTimePicker sends UTC date representing user's local time selection
    // 2. Modal converts it back to local time to extract what user selected
    // 3. Modal treats those selected components as AEST/AEDT and creates proper UTC date
    // 4. Modal sends the correctly converted UTC date to the API
    //
    // So the API just needs to use the dates as-is - they're already properly converted
    // to UTC representing the AEST/AEDT times the user selected.
    const startDateUTCProper = new Date(startDate);
    const endDateUTCProper = new Date(endDate);
    const currentTime = new Date();

    // Validate date relationships
    if (startDateUTCProper >= endDateUTCProper) {
      return NextResponse.json({ success: false, error: "Start date must be before end date" }, { status: 400 });
    }

    // Check for existing active promo of the same type
    // Only one active promo per type is allowed
    const existingPromo = await BonusEntryPromo.findOne({
      type,
      isActive: true,
      $or: [
        // Promo that overlaps with new promo dates
        {
          startDate: { $lte: endDateUTCProper },
          endDate: { $gte: startDateUTCProper },
        },
        // Promo that is currently active
        {
          startDate: { $lte: currentTime },
          endDate: { $gte: currentTime },
        },
      ],
    }).sort({ createdAt: -1 });

    if (existingPromo && !forceCreate) {
      // Return conflict information for admin to decide
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const existingPromoId = (existingPromo._id as any).toString();

      return NextResponse.json(
        {
          success: false,
          error: "Active promo conflict",
          conflict: {
            existingPromo: {
              id: existingPromoId,
              type: existingPromo.type,
              bonusEntries: existingPromo.bonusEntries,
              startDate: existingPromo.startDate,
              endDate: existingPromo.endDate,
              description: existingPromo.description,
            },
            message: `An active bonus entry promo for ${type} already exists. Do you want to deactivate it and create the new promo?`,
          },
        },
        { status: 409 }
      );
    }

    // If forceCreate is true, deactivate the existing promo
    if (existingPromo && forceCreate) {
      existingPromo.isActive = false;
      await existingPromo.save();
      console.log(`🔄 Deactivated existing bonus entry promo ${existingPromo._id} to make way for new promo`);
    }

    // Create new bonus entry promo
    const newPromo = new BonusEntryPromo({
      type,
      bonusEntries,
      startDate: startDateUTCProper,
      endDate: endDateUTCProper,
      isActive: true,
      createdBy: session.user.id,
      description: description || undefined,
    });

    await newPromo.save();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const newPromoId = (newPromo._id as any).toString();

    console.log(`✅ Created new bonus entry promo for ${type}`, {
      id: newPromoId,
      bonusEntries: newPromo.bonusEntries,
      startDate: newPromo.startDate,
      endDate: newPromo.endDate,
    });

    await log(201);
    return NextResponse.json(
      {
        success: true,
        message: `Successfully created bonus entry promo for ${type}`,
        data: {
          id: newPromoId,
          type: newPromo.type,
          bonusEntries: newPromo.bonusEntries,
          startDate: newPromo.startDate,
          endDate: newPromo.endDate,
          isActive: newPromo.isActive,
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
    console.error("❌ Error creating bonus entry promo:", error);

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
        error: "Failed to create bonus entry promo",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
