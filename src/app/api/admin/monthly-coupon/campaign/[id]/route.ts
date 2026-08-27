import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import { requirePermissionWithAudit } from "@/lib/audit-log";
import { CampaignService } from "@/services/redeemables";
import { monthlyCouponSegmentConfigSchema } from "@/lib/zod/monthlyCouponSegmentConfig";

const updateCampaignSchema = z.object({
  monthKey: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  name: z.string().min(3).max(120).optional(),
  displayLabel: z.string().trim().max(60).optional(),
  entriesAmount: z.number().int().min(1).optional(),
  campaignMode: z.enum(["global", "unique", "both"]).optional(),
  targetingMode: z.enum(["all-active-subscribers", "manual-users", "csv-users", "dynamic-segment"]).optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  neverExpires: z.boolean().optional(),
  validForHours: z.number().int().min(1).nullable().optional(),
  code: z.string().trim().toUpperCase().regex(/^(?=.{6,32}$)[A-Z0-9]+(?:-[A-Z0-9]+)*$/).optional(),
  requiresPurchase: z.boolean().optional(),
  purchaseRequirement: z.enum(["none", "membership", "one-time", "any"]).optional(),
  segmentConfig: monthlyCouponSegmentConfigSchema,
  isActive: z.boolean().optional(),
}).superRefine((data, ctx) => {
  if (data.neverExpires && data.validForHours != null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["validForHours"],
      message: "neverExpires and validForHours are mutually exclusive",
    });
  }
});

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const guard = await requirePermissionWithAudit("rewards.edit", request, {
      resourceType: "MonthlyEntryCampaign",
      resourceId: id,
    });
    if (guard instanceof NextResponse) return guard;
    const { log } = guard;

    await connectDB();
    const body = await request.json();
    const payload = updateCampaignSchema.parse(body);

    const rawUpdates = {
      ...payload,
      startsAt: payload.startsAt ? new Date(payload.startsAt) : undefined,
      endsAt: payload.neverExpires ? undefined : payload.endsAt ? new Date(payload.endsAt) : undefined,
    };
    // Strip undefined to avoid MongoDB update issues
    const updates = Object.fromEntries(
      Object.entries(rawUpdates).filter(([, v]) => v !== undefined)
    ) as Record<string, unknown>;

    const campaign = await CampaignService.updateCampaign(id, updates);
    if (!campaign) {
      return NextResponse.json({ success: false, error: "Coupon not found" }, { status: 404 });
    }

    await log(200);
    return NextResponse.json({
      success: true,
      data: campaign,
      message: "Coupon updated successfully",
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
    const message = error instanceof Error ? error.message : "Failed to update coupon";
    console.error("Error updating coupon:", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const guard = await requirePermissionWithAudit("rewards.delete", request, {
      resourceType: "MonthlyEntryCampaign",
      resourceId: id,
    });
    if (guard instanceof NextResponse) return guard;
    const { log } = guard;

    await connectDB();
    const result = await CampaignService.deleteCampaign(id);

    await log(200);
    return NextResponse.json({
      success: true,
      data: result,
      // Always a soft delete now (see CampaignService.deleteCampaign) — a hard delete
      // racing a lazily-minted trigger campaign issuance is not safe, so the count-then-delete
      // branch was removed. `softDeleted` is retained on the response shape for compatibility.
      message: "Campaign deactivated.",
    });
  } catch (error) {
    console.error("Error deleting campaign:", error);
    return NextResponse.json({ success: false, error: "Failed to delete campaign" }, { status: 500 });
  }
}
