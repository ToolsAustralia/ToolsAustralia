import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import { requireAdminUser } from "@/lib/api-auth";
import { CampaignService } from "@/services/redeemables";

const toggleSchema = z.object({
  isActive: z.boolean(),
});

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireAdminUser();
    if ("errorResponse" in authResult || !("adminUser" in authResult)) {
      return authResult.errorResponse;
    }

    await connectDB();
    const { id } = await context.params;
    const body = await request.json();
    const payload = toggleSchema.parse(body);

    const campaign = await CampaignService.toggleCampaignActive(id, payload.isActive);
    if (!campaign) {
      return NextResponse.json({ success: false, error: "Campaign not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: campaign,
      message: payload.isActive ? "Campaign activated" : "Campaign deactivated",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation error",
          details: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
        },
        { status: 400 }
      );
    }
    console.error("Error toggling campaign:", error);
    return NextResponse.json({ success: false, error: "Failed to toggle campaign" }, { status: 500 });
  }
}
