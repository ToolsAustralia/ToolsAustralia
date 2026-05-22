import { NextRequest, NextResponse } from "next/server";
import { requirePermissionWithAudit } from "@/lib/audit-log";
import connectDB from "@/lib/mongodb";
import Promo from "@/models/Promo";
import { z } from "zod";
import { zPromoMultiplierOrNull } from "@/lib/zod/promo-multiplier-schema";

// Validation schema for toggle request
const togglePromoSchema = z.object({
  type: z.enum(["membership-packages", "one-time-packages", "mini-packages"]),
  multiplier: zPromoMultiplierOrNull,
});

/**
 * Toggle promo endpoint - Simple toggle system (3x, 5x, 10x, or OFF)
 * When toggling a multiplier: deactivates current promo of that type and creates/activates new one
 * When toggling OFF (null): deletes the current promo record
 */
export async function POST(request: NextRequest) {
  try {
    const guard = await requirePermissionWithAudit("promos.edit", request, { resourceType: "Promo" });
    if (guard instanceof NextResponse) return guard;
    const { session, log } = guard;

    await connectDB();

    // Parse and validate request body
    const body = await request.json();
    const validatedData = togglePromoSchema.parse(body);

    const { type, multiplier } = validatedData;

    // Find current active promo of this type
    const currentActivePromo = await Promo.findOne({
      type,
      isActive: true,
    }).sort({ createdAt: -1 });

    // If toggling OFF (null), delete the current promo
    if (multiplier === null) {
      if (currentActivePromo) {
        await Promo.deleteOne({ _id: currentActivePromo._id });
        console.log(`🗑️ Deleted promo ${currentActivePromo._id} (${type}) - Toggled OFF`);
      }

      await log(200);
      return NextResponse.json({
        success: true,
        message: `Promo for ${type} has been turned OFF`,
        data: null,
      });
    }

    // If toggling a multiplier (3x, 5x, 10x)
    // Check if there's already an active promo with the same multiplier
    if (currentActivePromo && currentActivePromo.multiplier === multiplier) {
      // Already active with this multiplier, no change needed
      await log(200);
      return NextResponse.json({
        success: true,
        message: `Promo for ${type} is already set to ${multiplier}x`,
        data: {
          id: currentActivePromo._id.toString(),
          type: currentActivePromo.type,
          multiplier: currentActivePromo.multiplier,
          isActive: currentActivePromo.isActive,
        },
      });
    }

    // Deactivate current promo if it exists and has different multiplier
    if (currentActivePromo) {
      await Promo.deleteOne({ _id: currentActivePromo._id });
      console.log(
        `🔄 Deactivated and deleted promo ${currentActivePromo._id} (${type}) to make way for ${multiplier}x`
      );
    }

    // Create new promo with the selected multiplier
    // No dates needed in toggle system - promo stays active until toggled off
    const newPromo = new Promo({
      type,
      multiplier,
      isActive: true,
      createdBy: session.user.id,
      // Optional fields for backward compatibility (not used in toggle system)
      startDate: new Date(),
      endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // Far future date (1 year)
      duration: 24,
    });

    await newPromo.save();

    console.log(`✅ Toggled ${multiplier}x promo for ${type}`, {
      id: newPromo._id,
    });

    await log(200);
    return NextResponse.json({
      success: true,
      message: `${multiplier}x promo for ${type} has been activated`,
      data: {
        id: newPromo._id.toString(),
        type: newPromo.type,
        multiplier: newPromo.multiplier,
        isActive: newPromo.isActive,
        createdAt: newPromo.createdAt,
      },
    });
  } catch (error) {
    console.error("❌ Error toggling promo:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid request data",
          details: error.issues,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Failed to toggle promo",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
