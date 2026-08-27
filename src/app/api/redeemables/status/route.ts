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

    const [campaigns, user, existingIssuance, issuances] = await Promise.all([
      CampaignService.getActiveCampaigns(),
      User.findById(authResult.session.user.id).select("_id subscription isEmailVerified isActive"),
      RedeemableIssuance.findOne({
        userId: authResult.session.user.id,
      })
        .sort({ createdAt: -1 })
        .lean(),
      RedeemableIssuance.find({ userId: authResult.session.user.id })
        .select("campaignId status expiresAt redeemedAt")
        .lean(),
    ]);

    if (!user || !user.isActive) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const eligible = Boolean(user.subscription?.isActive);

    // A campaign code is visible ONLY to a customer who holds an issuance for
    // it. Returning it to everyone let any signed-in user read a trigger code
    // they had not qualified for.
    const heldCampaignIds = new Set(issuances.map((i) => String(i.campaignId)));

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
          code: heldCampaignIds.has(String(campaign._id)) ? campaign.code : undefined,
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
              // Same visibility rule as activeCampaigns above — this singular
              // field mirrors campaigns[0], so it must never leak a code the
              // caller has not qualified for either.
              code: heldCampaignIds.has(String(campaigns[0]._id)) ? campaigns[0].code : undefined,
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
