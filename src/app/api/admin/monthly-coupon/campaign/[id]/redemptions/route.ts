import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import { requireAdminUser } from "@/lib/api-auth";
import { RedemptionAnalyticsService } from "@/services/redeemables";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireAdminUser();
    if ("errorResponse" in authResult || !("adminUser" in authResult)) {
      return authResult.errorResponse;
    }

    await connectDB();
    const { id } = await context.params;
    const page = Number(request.nextUrl.searchParams.get("page") || "1");
    const limit = Number(request.nextUrl.searchParams.get("limit") || "20");

    const data = await RedemptionAnalyticsService.getCampaignRedemptions(id, { page, limit });

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Error fetching campaign redemptions:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch campaign redemptions" }, { status: 500 });
  }
}
