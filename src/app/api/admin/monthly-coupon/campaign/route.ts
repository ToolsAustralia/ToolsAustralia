import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import { requireAdminUser } from "@/lib/api-auth";
import { CampaignService, getMonthKey } from "@/services/redeemables";
import MonthlyEntryCampaign from "@/models/MonthlyEntryCampaign";
import RedeemableIssuance from "@/models/RedeemableIssuance";

const campaignSchema = z.object({
  monthKey: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  name: z.string().min(3).max(120),
  displayLabel: z.string().trim().max(60).optional(),
  entriesAmount: z.number().int().min(1),
  campaignMode: z.enum(["global", "unique", "both"]),
  targetingMode: z.enum(["all-active-subscribers", "manual-users", "csv-users", "dynamic-segment"]),
  startsAt: z.string().min(1),
  endsAt: z.string().min(1).optional(),
  neverExpires: z.boolean().optional(),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^(?=.{6,32}$)[A-Z0-9]+(?:-[A-Z0-9]+)*$/)
    .min(6)
    .max(32),
  requiresPurchase: z.boolean().optional(),
  purchaseRequirement: z.enum(["none", "membership", "one-time", "any"]).optional(),
  segmentConfig: z
    .object({
      minInactiveDays: z.number().int().min(0).optional(),
      maxInactiveDays: z.number().int().min(0).optional(),
      requiresEmailVerified: z.boolean().optional(),
      requiresRecentPurchaseDays: z.number().int().min(1).optional(),
      includeUserIds: z.array(z.string()).optional(),
      excludeUserIds: z.array(z.string()).optional(),
    })
    .optional(),
  isActive: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const authResult = await requireAdminUser();
    if ("errorResponse" in authResult || !("adminUser" in authResult)) {
      return authResult.errorResponse;
    }

    await connectDB();
    const monthKey = request.nextUrl.searchParams.get("monthKey");
    const filters = monthKey ? { monthKey } : {};
    const campaigns = await MonthlyEntryCampaign.find(filters)
      .sort({ monthKey: -1, createdAt: -1 })
      .select("monthKey name displayLabel entriesAmount campaignMode targetingMode startsAt endsAt neverExpires isActive code requiresPurchase createdAt updatedAt")
      .lean();
    const campaignIds = campaigns.map((campaign) => campaign._id);
    const redemptionCounts = await RedeemableIssuance.aggregate<{ _id: string; redeemedCount: number }>([
      {
        $match: {
          campaignId: { $in: campaignIds },
          status: "redeemed",
        },
      },
      {
        $group: {
          _id: "$campaignId",
          redeemedCount: { $sum: 1 },
        },
      },
    ]);
    const redemptionCountMap = new Map(
      redemptionCounts.map((item) => [item._id.toString(), item.redeemedCount])
    );

    return NextResponse.json({
      success: true,
      data: campaigns.map((campaign) => ({
        ...campaign,
        id: String(campaign._id),
        redeemedCount: redemptionCountMap.get(String(campaign._id)) ?? 0,
      })),
    });
  } catch (error) {
    console.error("Error fetching monthly campaigns:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch campaigns" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAdminUser();
    if ("errorResponse" in authResult || !("adminUser" in authResult)) {
      return authResult.errorResponse;
    }

    await connectDB();
    const body = await request.json();
    const payload = campaignSchema.parse(body);
    const startsAtDate = new Date(payload.startsAt);
    const endsAtDate = payload.endsAt ? new Date(payload.endsAt) : undefined;
    if (
      Number.isNaN(startsAtDate.getTime()) ||
      (!payload.neverExpires && (!endsAtDate || Number.isNaN(endsAtDate.getTime())))
    ) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation error",
          details: [{ path: "startsAt/endsAt", message: "Start date/time must be valid. End date is required unless Never Expires is enabled." }],
        },
        { status: 400 }
      );
    }

    const campaign = await CampaignService.createCampaign({
      monthKey: payload.monthKey || getMonthKey(startsAtDate),
      name: payload.name,
      displayLabel: payload.displayLabel,
      entriesAmount: payload.entriesAmount,
      campaignMode: payload.campaignMode,
      targetingMode: payload.targetingMode,
      startsAt: startsAtDate,
      endsAt: endsAtDate,
      neverExpires: payload.neverExpires,
      code: payload.code,
      requiresPurchase: payload.requiresPurchase,
      purchaseRequirement: payload.purchaseRequirement,
      segmentConfig: payload.segmentConfig,
      isActive: payload.isActive,
      createdBy: authResult.adminUser._id.toString(),
    });

    return NextResponse.json({
      success: true,
      data: campaign,
      message: "Campaign created successfully",
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

    console.error("Error upserting monthly campaign:", error);
    return NextResponse.json({ success: false, error: "Failed to upsert campaign" }, { status: 500 });
  }
}
