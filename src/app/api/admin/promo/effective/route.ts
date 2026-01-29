import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { PromoMultiplierResolverService } from "@/services/admin/PromoMultiplierResolverService";

/**
 * GET /api/admin/promo/effective
 * Returns the current effective multiplier per package type and its source.
 * Helps QA, support, and Stripe reconciliation.
 */
export async function GET(_request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { default: User } = await import("@/models/User");
    await (await import("@/lib/mongodb")).default();
    const user = await User.findOne({ email: session.user.email });
    if (!user || user.role !== "admin") {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const resolver = new PromoMultiplierResolverService();
    const effective = await resolver.getEffectiveMultipliers();

    return NextResponse.json({
      success: true,
      data: effective,
    });
  } catch (error) {
    console.error("❌ Error fetching effective promo multipliers:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch effective multipliers",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
