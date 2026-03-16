import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import RedeemableIssuance from "@/models/RedeemableIssuance";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { CampaignService } from "@/services/redeemables";

export async function GET() {
  try {
    const authResult = await requireAuthenticatedUser();
    if ("errorResponse" in authResult) {
      return authResult.errorResponse;
    }

    await connectDB();

    const [campaigns, user, existingIssuance] = await Promise.all([
      CampaignService.getActiveCampaigns(),
      User.findById(authResult.session.user.id).select("_id subscription isEmailVerified isActive"),
      RedeemableIssuance.findOne({
        userId: authResult.session.user.id,
      })
        .sort({ createdAt: -1 })
        .lean(),
    ]);

    if (!user || !user.isActive) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const eligible = Boolean(user.subscription?.isActive);

    return NextResponse.json({
      success: true,
      data: {
        eligible,
        reason: eligible ? "eligible" : "active-subscription-required",
        activeCampaigns: campaigns.map((campaign) => ({
          id: String(campaign._id),
          monthKey: campaign.monthKey,
          name: campaign.name,
          displayLabel: campaign.displayLabel,
          campaignMode: campaign.campaignMode,
          code: campaign.code,
          requiresPurchase: campaign.requiresPurchase,
          neverExpires: campaign.neverExpires,
          startsAt: campaign.startsAt,
          endsAt: campaign.endsAt,
        })),
        activeCampaign: campaigns[0]
          ? {
              id: String(campaigns[0]._id),
              monthKey: campaigns[0].monthKey,
              name: campaigns[0].name,
              campaignMode: campaigns[0].campaignMode,
              neverExpires: campaigns[0].neverExpires,
              startsAt: campaigns[0].startsAt,
              endsAt: campaigns[0].endsAt,
            }
          : null,
        latestIssuance: existingIssuance
          ? {
              id: existingIssuance._id.toString(),
              status: existingIssuance.status,
              expiresAt: existingIssuance.expiresAt,
              redeemedAt: existingIssuance.redeemedAt,
            }
          : null,
      },
    });
  } catch (error) {
    console.error("Error loading redeemables status:", error);
    return NextResponse.json({ success: false, error: "Failed to load redeemables status" }, { status: 500 });
  }
}
