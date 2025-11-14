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

    // Get all active promos
    const now = new Date();
    const activePromos = await Promo.find({
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gt: now },
    }).sort({ createdAt: -1 });

    // Calculate remaining time for each promo
    const promosWithTimeRemaining = activePromos.map((promo: IPromo & { _id: string }) => {
      const now = new Date();
      const timeRemaining = promo.endDate.getTime() - now.getTime();
      const isExpired = timeRemaining <= 0;

      return {
        id: promo._id,
        type: promo.type,
        multiplier: promo.multiplier,
        startDate: promo.startDate,
        endDate: promo.endDate,
        duration: promo.duration,
        isActive: promo.isActive && !isExpired,
        timeRemaining: Math.max(0, timeRemaining), // in milliseconds
        isExpired,
        createdAt: promo.createdAt,
        createdBy: promo.createdBy,
      };
    });

    // Filter out expired promos
    const validActivePromos = promosWithTimeRemaining.filter((promo) => !promo.isExpired);

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

    // Get all active promos
    const now = new Date();
    const activePromos = await Promo.find({
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gt: now },
    }).sort({ createdAt: -1 });

    // Calculate remaining time for each promo
    const promosWithTimeRemaining = activePromos.map((promo: IPromo & { _id: string }) => {
      const now = new Date();
      const timeRemaining = promo.endDate.getTime() - now.getTime();
      const isExpired = timeRemaining <= 0;

      return {
        id: promo._id,
        type: promo.type,
        multiplier: promo.multiplier,
        startDate: promo.startDate,
        endDate: promo.endDate,
        duration: promo.duration,
        isActive: promo.isActive && !isExpired,
        timeRemaining: Math.max(0, timeRemaining), // in milliseconds
        isExpired,
      };
    });

    // Filter out expired promos
    const validActivePromos = promosWithTimeRemaining.filter((promo) => !promo.isExpired);

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
