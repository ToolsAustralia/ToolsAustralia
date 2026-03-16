import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import { CampaignService, TargetingService, getMonthKey } from "@/services/redeemables";
import { MilestoneService } from "@/services/milestones";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isAuthorized(request: NextRequest): boolean {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;
  return authHeader === `Bearer ${cronSecret}`;
}

export async function POST(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const monthKey = getMonthKey();

    const campaigns = (await CampaignService.getActiveCampaigns()).filter((campaign) => campaign.monthKey === monthKey);
    if (!campaigns.length) {
      return NextResponse.json({
        success: true,
        message: "No active campaign for current month",
        data: { monthKey, issuedCount: 0, skippedCount: 0 },
      });
    }

    let issuedCount = 0;
    let skippedCount = 0;
    let targetedUsers = 0;
    for (const campaign of campaigns) {
      const userIds = await TargetingService.resolveTargetUserIds({
        targetingMode: campaign.targetingMode,
        segmentConfig: campaign.segmentConfig,
      });
      targetedUsers += userIds.length;
      const result = await CampaignService.issueCampaignToUsers({
        campaign,
        userIds,
        issuedBy: "cron",
        metadata: {
          notes: "Scheduled monthly issuance",
        },
      });
      issuedCount += result.issuedCount;
      skippedCount += result.skippedCount;
    }

    const milestoneResult = await MilestoneService.evaluateAllUsersAndIssueMilestones();

    return NextResponse.json({
      success: true,
      data: {
        monthKey,
        campaignCount: campaigns.length,
        targetedUsers,
        issuedCount,
        skippedCount,
        milestoneRewardsIssued: milestoneResult.issuedCount,
      },
      message: `Monthly issuance complete for ${monthKey}`,
    });
  } catch (error) {
    console.error("Monthly issuance cron failed:", error);
    return NextResponse.json({ success: false, error: "Monthly issuance cron failed" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    service: "Monthly Redeemables Issuance Cron",
    status: "healthy",
    message: "Use POST to execute issuance",
  });
}
