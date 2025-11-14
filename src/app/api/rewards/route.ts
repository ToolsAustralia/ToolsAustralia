import { NextRequest, NextResponse } from "next/server";
import { getActivePartnerDiscounts } from "@/data";
import { guardRewardsEnabled } from "@/lib/rewardsGuard";

/**
 * GET /api/rewards
 * Get rewards data including partner discounts
 */
export async function GET(request: NextRequest) {
  const guardResponse = guardRewardsEnabled();
  if (guardResponse) {
    return guardResponse;
  }

  try {
    const { searchParams } = new URL(request.url);
    const brand = searchParams.get("brand");
    const category = searchParams.get("category");

    let partnerDiscounts = getActivePartnerDiscounts();

    // Filter by brand
    if (brand) {
      partnerDiscounts = partnerDiscounts.filter((discount) => discount.brand.toLowerCase() === brand.toLowerCase());
    }

    // Filter by category
    if (category) {
      partnerDiscounts = partnerDiscounts.filter((discount) => discount.applicableCategories?.includes(category));
    }

    return NextResponse.json({
      success: true,
      data: {
        partnerDiscounts,
        count: partnerDiscounts.length,
      },
    });
  } catch (error) {
    console.error("Error fetching rewards data:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch rewards data" }, { status: 500 });
  }
}
