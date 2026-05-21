import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type mongoose from "mongoose";
import connectDB from "@/lib/mongodb";
import { requireAdminUser } from "@/lib/api-auth";
import { MilestoneService } from "@/services/milestones";

const milestoneRewardSchema = z.object({
  name: z.string().min(3).max(120),
  displayLabel: z.string().trim().max(60).optional(),
  milestoneType: z.enum(["spend-amount", "entries-gained", "loyalty-days"]),
  threshold: z.number().int().min(1),
  entriesAmount: z.number().int().min(1),
  code: z.string().trim().toUpperCase().regex(/^(?=.{6,32}$)[A-Z0-9]+(?:-[A-Z0-9]+)*$/),
  isActive: z.boolean().optional(),
  neverExpires: z.boolean().optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  isRecurring: z.boolean().optional(),
});

export async function GET() {
  try {
    const authResult = await requireAdminUser();
    if ("errorResponse" in authResult || !("adminUser" in authResult)) {
      return authResult.errorResponse;
    }

    await connectDB();
    const rewards = await MilestoneService.listRewards();
    const rewardIds = rewards.map((reward) => reward._id as mongoose.Types.ObjectId);
    const performanceMap = await MilestoneService.aggregatePerformanceByRewardIds(rewardIds);

    return NextResponse.json({
      success: true,
      data: rewards.map((reward) => ({
        ...reward.toObject(),
        id: String(reward._id),
        performance: performanceMap.get(String(reward._id)) ?? {
          issuedCount: 0,
          redeemedCount: 0,
          activeCount: 0,
          expiredCount: 0,
          cancelledCount: 0,
          totalEntriesGranted: 0,
          redemptionRate: 0,
        },
      })),
    });
  } catch (error) {
    console.error("Error loading milestone rewards:", error);
    return NextResponse.json({ success: false, error: "Failed to load milestone rewards" }, { status: 500 });
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
    const payload = milestoneRewardSchema.parse(body);
    const reward = await MilestoneService.createReward({
      ...payload,
      startsAt: payload.startsAt ? new Date(payload.startsAt) : undefined,
      endsAt: payload.endsAt ? new Date(payload.endsAt) : undefined,
      createdBy: authResult.adminUser._id.toString(),
    });

    return NextResponse.json({
      success: true,
      data: reward,
      message: "Milestone reward created successfully",
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
    console.error("Error creating milestone reward:", error);
    return NextResponse.json({ success: false, error: "Failed to create milestone reward" }, { status: 500 });
  }
}
