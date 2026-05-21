import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import { PromoMultiplierResolverService } from "@/services/admin/PromoMultiplierResolverService";

/**
 * GET /api/admin/promo/effective
 * Returns the current effective multiplier per package type and its source.
 * Helps QA, support, and Stripe reconciliation.
 */
export async function GET(_request: NextRequest) {
  try {
    const guard = await requirePermission("promos.view");
    if (guard instanceof NextResponse) return guard;

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
