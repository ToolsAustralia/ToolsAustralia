import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import { FacebookAdsInsightsService } from "@/services/facebook-ads/FacebookAdsInsightsService";
import type { FacebookAdsInsightsResponse } from "@/types/facebook-ads";

const querySchema = z.object({
  dateRange: z.enum(["today", "yesterday", "custom"]).default("today"),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  level: z.enum(["account", "campaign", "adset", "ad"]).default("account"),
});

export async function GET(request: NextRequest) {
  try {
    const guard = await requirePermission("facebookAds.view");
    if (guard instanceof NextResponse) return guard;

    await connectDB();

    const params = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()));
    if (!params.success) {
      return NextResponse.json(
        { success: false, error: "Invalid query", details: params.error.issues },
        { status: 400 }
      );
    }

    const data = await new FacebookAdsInsightsService().getInsights(params.data);
    const response: FacebookAdsInsightsResponse = {
      success: true,
      data,
    };

    return NextResponse.json(response);
  } catch (e) {
    console.error("❌ /api/admin/facebook-ads/insights error", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
