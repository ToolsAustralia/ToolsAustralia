import { NextResponse } from "next/server";
import { PromoMultiplierResolverService } from "@/services/admin/PromoMultiplierResolverService";
import type { EffectiveForBannerResponse } from "@/types/admin";

/**
 * GET /api/promo/effective-for-banner
 * Returns effective multipliers with source and scheduled meta for banner display (public route).
 * Used by PromoBanner for countdown mode and badge logic.
 */
export async function GET() {
  try {
    const resolver = new PromoMultiplierResolverService();
    const data = await resolver.getEffectiveForBanner();

    return NextResponse.json(
      { success: true, data } as EffectiveForBannerResponse,
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
        },
      }
    );
  } catch (error) {
    console.error("Error fetching effective-for-banner:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch effective for banner",
        data: {
          "membership-packages": { multiplier: null, source: "none" as const },
          "one-time-packages": { multiplier: null, source: "none" as const },
          "mini-packages": { multiplier: null, source: "none" as const },
        },
      } as EffectiveForBannerResponse,
      { status: 500 }
    );
  }
}
