import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import { requirePermission } from "@/lib/api-auth-permissions";
import { requirePermissionWithAudit } from "@/lib/audit-log";
import {
  CampaignService,
  getMonthKey,
  listCampaignsWithRedemptionCounts,
} from "@/services/redeemables";
import { monthlyCouponSegmentConfigSchema } from "@/lib/zod/monthlyCouponSegmentConfig";

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
  segmentConfig: monthlyCouponSegmentConfigSchema,
  isActive: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const guard = await requirePermission("rewards.view");
    if (guard instanceof NextResponse) return guard;

    await connectDB();
    const monthKey = request.nextUrl.searchParams.get("monthKey") || undefined;
    const rows = await listCampaignsWithRedemptionCounts({ monthKey });

    // Preserve the admin route's existing wire shape (spread-based, with _id and id).
    return NextResponse.json({
      success: true,
      data: rows.map((row) => ({
        _id: row.id,
        id: row.id,
        monthKey: row.monthKey,
        name: row.name,
        displayLabel: row.displayLabel,
        entriesAmount: row.entriesAmount,
        campaignMode: row.campaignMode,
        targetingMode: row.targetingMode,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        neverExpires: row.neverExpires,
        isActive: row.isActive,
        code: row.code,
        requiresPurchase: row.requiresPurchase,
        purchaseRequirement: row.purchaseRequirement,
        segmentConfig: row.segmentConfig,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        redeemedCount: row.redeemedCount,
      })),
    });
  } catch (error) {
    console.error("Error fetching monthly campaigns:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch campaigns" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const guard = await requirePermissionWithAudit("rewards.edit", request, {
      resourceType: "MonthlyEntryCampaign",
    });
    if (guard instanceof NextResponse) return guard;
    const { session, log } = guard;

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
      createdBy: session.user.id,
    });

    await log(200);
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
