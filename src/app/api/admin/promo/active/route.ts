import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import Promo, { IPromo } from "@/models/Promo";

export async function GET() {
  try {
    const guard = await requirePermission("promos.view");
    if (guard instanceof NextResponse) return guard;

    await connectDB();

    // Get all active promos (updated for toggle system - ignores dates)
    const activePromos = await Promo.find({
      isActive: true,
    }).sort({ createdAt: -1 });

    // Map promos to response format (no time remaining in toggle system)
    const promosWithTimeRemaining = activePromos.map((promo: IPromo & { _id: string }) => {
      return {
        id: promo._id,
        type: promo.type,
        multiplier: promo.multiplier,
        startDate: promo.startDate || new Date(),
        endDate: promo.endDate || new Date(),
        duration: promo.duration || 24,
        isActive: promo.isActive,
        timeRemaining: 0, // Not used in toggle system
        isExpired: false, // Not used in toggle system
        createdAt: promo.createdAt,
        createdBy: promo.createdBy,
      };
    });

    // All active promos are valid in toggle system
    const validActivePromos = promosWithTimeRemaining;

    return NextResponse.json({
      success: true,
      data: validActivePromos,
      count: validActivePromos.length,
    });
  } catch (error) {
    console.error("❌ Error fetching active promos:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch active promos",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// Public endpoint for frontend to get active promos (no admin auth required)
export async function POST() {
  try {
    await connectDB();

    // Get all active promos (updated for toggle system - ignores dates)
    const activePromos = await Promo.find({
      isActive: true,
    }).sort({ createdAt: -1 });

    // Map promos to response format (no time remaining in toggle system)
    const promosWithTimeRemaining = activePromos.map((promo: IPromo & { _id: string }) => {
      return {
        id: promo._id,
        type: promo.type,
        multiplier: promo.multiplier,
        startDate: promo.startDate || new Date(),
        endDate: promo.endDate || new Date(),
        duration: promo.duration || 24,
        isActive: promo.isActive,
        timeRemaining: 0, // Not used in toggle system
        isExpired: false, // Not used in toggle system
      };
    });

    // All active promos are valid in toggle system
    const validActivePromos = promosWithTimeRemaining;

    return NextResponse.json({
      success: true,
      data: validActivePromos,
      count: validActivePromos.length,
    });
  } catch (error) {
    console.error("❌ Error fetching active promos (public):", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch active promos",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
