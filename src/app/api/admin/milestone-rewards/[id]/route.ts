import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import { requirePermissionWithAudit } from "@/lib/audit-log";
import { MilestoneService } from "@/services/milestones";

const updateMilestoneRewardSchema = z.object({
  name: z.string().min(3).max(120).optional(),
  displayLabel: z.string().trim().max(60).optional(),
  milestoneType: z.enum(["spend-amount", "entries-gained", "loyalty-days"]).optional(),
  threshold: z.number().int().min(1).optional(),
  entriesAmount: z.number().int().min(1).optional(),
  code: z.string().trim().toUpperCase().regex(/^(?=.{6,32}$)[A-Z0-9]+(?:-[A-Z0-9]+)*$/).optional(),
  isActive: z.boolean().optional(),
  neverExpires: z.boolean().optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  isRecurring: z.boolean().optional(),
});

const toggleMilestoneRewardSchema = z.object({
  isActive: z.boolean(),
});

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const guard = await requirePermissionWithAudit("rewards.edit", request, {
      resourceType: "MilestoneReward",
      resourceId: id,
    });
    if (guard instanceof NextResponse) return guard;
    const { log } = guard;

    await connectDB();
    const body = await request.json();
    const payload = updateMilestoneRewardSchema.parse(body);
    const reward = await MilestoneService.updateReward(id, {
      ...payload,
      startsAt: payload.startsAt ? new Date(payload.startsAt) : undefined,
      endsAt: payload.endsAt ? new Date(payload.endsAt) : undefined,
    });
    if (!reward) {
      return NextResponse.json({ success: false, error: "Milestone reward not found" }, { status: 404 });
    }
    await log(200);
    return NextResponse.json({
      success: true,
      data: reward,
      message: "Milestone reward updated successfully",
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
    console.error("Error updating milestone reward:", error);
    return NextResponse.json({ success: false, error: "Failed to update milestone reward" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const guard = await requirePermissionWithAudit("rewards.edit", request, {
      resourceType: "MilestoneReward",
      resourceId: id,
    });
    if (guard instanceof NextResponse) return guard;
    const { log } = guard;

    await connectDB();
    const body = await request.json();
    const payload = toggleMilestoneRewardSchema.parse(body);
    const reward = await MilestoneService.toggleRewardActive(id, payload.isActive);
    if (!reward) {
      return NextResponse.json({ success: false, error: "Milestone reward not found" }, { status: 404 });
    }
    await log(200);
    return NextResponse.json({
      success: true,
      data: reward,
      message: payload.isActive ? "Milestone reward activated" : "Milestone reward deactivated",
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
    console.error("Error toggling milestone reward:", error);
    return NextResponse.json({ success: false, error: "Failed to toggle milestone reward" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const guard = await requirePermissionWithAudit("rewards.delete", request, {
      resourceType: "MilestoneReward",
      resourceId: id,
    });
    if (guard instanceof NextResponse) return guard;
    const { log } = guard;

    await connectDB();
    await MilestoneService.deleteReward(id);
    await log(200);
    return NextResponse.json({
      success: true,
      message: "Milestone reward deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting milestone reward:", error);
    return NextResponse.json({ success: false, error: "Failed to delete milestone reward" }, { status: 500 });
  }
}
