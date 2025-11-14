import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
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
      endedBy: user.email,
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
        endedBy: user.email,
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
