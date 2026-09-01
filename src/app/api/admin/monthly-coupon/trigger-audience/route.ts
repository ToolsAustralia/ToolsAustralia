import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import { requirePermission } from "@/lib/api-auth-permissions";
import { BonusCodeAudienceService } from "@/services/redeemables";

/**
 * GET /api/admin/monthly-coupon/trigger-audience
 *
 * Read-only. Returns, per webhook-minted bonus-code trigger (cancel-click /
 * checkout-start / one-time-purchase), the addressable customer count + a
 * bounded sample, plus the campaign's current issued/redeemed counts. Never
 * mints, issues, or redeems — see BonusCodeAudienceService for the query logic
 * and docs/rewards-redeemables/api.md for the response contract.
 */
export async function GET() {
  try {
    const guard = await requirePermission("rewards.view");
    if (guard instanceof NextResponse) return guard;

    await connectDB();
    const data = await BonusCodeAudienceService.getAudienceForAllTriggers();

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error fetching bonus-code trigger audience:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch trigger audience" },
      { status: 500 }
    );
  }
}
