import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import Promo, { IPromo } from "@/models/Promo";

export async function GET() {
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
