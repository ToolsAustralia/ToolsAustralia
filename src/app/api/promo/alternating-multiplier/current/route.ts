import { NextResponse } from "next/server";
import { PromoMultiplierResolverService } from "@/services/admin/PromoMultiplierResolverService";
import type { CurrentAlternatingMultipliersResponse } from "@/types/admin";

/**
 * GET /api/promo/alternating-multiplier/current
 * Get current alternating multipliers for all enabled types (public route)
 * Only returns multipliers when no active promo exists for that type
 */
export async function GET() {
  try {
    const resolver = new PromoMultiplierResolverService();
    const multipliers = await resolver.getCurrentAlternatingMultipliers();

    // Debug logging (development only)
    if (process.env.NODE_ENV === "development") {
      console.log("🔍 Current alternating multipliers API response:", multipliers);
    }

    return NextResponse.json(
      {
        success: true,
        data: multipliers,
      } as CurrentAlternatingMultipliersResponse,
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120", // Cache for 1 minute
        },
      }
    );
  } catch (error) {
    console.error("Error fetching current alternating multipliers:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch current alternating multipliers",
        data: {
          "membership-packages": null,
          "one-time-packages": null,
          "mini-packages": null,
        },
      } as CurrentAlternatingMultipliersResponse,
      { status: 500 }
    );
  }
}

