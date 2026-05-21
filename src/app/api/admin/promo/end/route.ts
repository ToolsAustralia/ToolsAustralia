import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import Promo from "@/models/Promo";
import { z } from "zod";
import mongoose from "mongoose";

// Validation schema
const endPromoSchema = z.object({
  promoId: z.string().min(1, "Promo ID is required"),
});

export async function POST(request: NextRequest) {
  try {
    const guard = await requirePermission("promos.end");
    if (guard instanceof NextResponse) return guard;

    await connectDB();

    // Parse and validate request body
    const body = await request.json();
    const { promoId } = endPromoSchema.parse(body);

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(promoId)) {
      return NextResponse.json({ success: false, error: "Invalid promo ID format" }, { status: 400 });
    }

    // Find the promo
    const promo = await Promo.findById(promoId);
    if (!promo) {
      return NextResponse.json({ success: false, error: "Promo not found" }, { status: 404 });
    }

    // Check if promo is already inactive
    if (!promo.isActive) {
      return NextResponse.json({ success: false, error: "Promo is already inactive" }, { status: 400 });
    }

    // Deactivate the promo
    await promo.deactivate();

    console.log(`🛑 Manually ended promo ${promoId}`, {
      type: promo.type,
      multiplier: promo.multiplier,
      endedAt: new Date(),
    });

    return NextResponse.json({
      success: true,
      message: `Successfully ended ${promo.multiplier}x promo for ${promo.type}`,
      data: {
        id: promo._id,
        type: promo.type,
        multiplier: promo.multiplier,
        startDate: promo.startDate,
        endDate: promo.endDate,
        isActive: promo.isActive,
        endedAt: new Date(),
      },
    });
  } catch (error) {
    console.error("❌ Error ending promo:", error);

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
        error: "Failed to end promo",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
