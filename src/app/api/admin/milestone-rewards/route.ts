import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import { requirePermission } from "@/lib/api-auth-permissions";
import { requirePermissionWithAudit } from "@/lib/audit-log";
import { MilestoneService } from "@/services/milestones";
import MilestoneIssuance from "@/models/MilestoneIssuance";

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
    const guard = await requirePermission("rewards.view");
    if (guard instanceof NextResponse) return guard;

    await connectDB();
    const rewards = await MilestoneService.listRewards();
    const rewardIds = rewards.map((reward) => reward._id);
    const performanceRows = await MilestoneIssuance.aggregate<{
      _id: string;
      issuedCount: number;
      redeemedCount: number;
      activeCount: number;
      expiredCount: number;
      cancelledCount: number;
      totalEntriesGranted: number;
    }>([
      {
        $match: {
          milestoneRewardId: { $in: rewardIds },
        },
      },
      {
        $group: {
          _id: "$milestoneRewardId",
          issuedCount: { $sum: 1 },
          redeemedCount: {
            $sum: {
              $cond: [{ $eq: ["$status", "redeemed"] }, 1, 0],
            },
          },
          activeCount: {
            $sum: {
              $cond: [{ $eq: ["$status", "active"] }, 1, 0],
            },
          },
          expiredCount: {
            $sum: {
              $cond: [{ $eq: ["$status", "expired"] }, 1, 0],
            },
          },
          cancelledCount: {
            $sum: {
              $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0],
            },
          },
          totalEntriesGranted: { $sum: "$entriesAmount" },
        },
      },
    ]);
    const performanceMap = new Map(
      performanceRows.map((row) => [row._id.toString(), row])
    );

    return NextResponse.json({
      success: true,
      data: rewards.map((reward) => ({
        ...reward.toObject(),
        id: String(reward._id),
        performance: (() => {
          const row = performanceMap.get(String(reward._id));
          const issuedCount = row?.issuedCount || 0;
          const redeemedCount = row?.redeemedCount || 0;
          return {
            issuedCount,
            redeemedCount,
            activeCount: row?.activeCount || 0,
            expiredCount: row?.expiredCount || 0,
            cancelledCount: row?.cancelledCount || 0,
            totalEntriesGranted: row?.totalEntriesGranted || 0,
            redemptionRate: issuedCount > 0 ? Math.round((redeemedCount / issuedCount) * 100) : 0,
          };
        })(),
      })),
    });
  } catch (error) {
    console.error("Error loading milestone rewards:", error);
    return NextResponse.json({ success: false, error: "Failed to load milestone rewards" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const guard = await requirePermissionWithAudit("rewards.edit", request, {
      resourceType: "MilestoneReward",
    });
    if (guard instanceof NextResponse) return guard;
    const { session, log } = guard;

    await connectDB();
    const body = await request.json();
    const payload = milestoneRewardSchema.parse(body);
    const reward = await MilestoneService.createReward({
      ...payload,
      startsAt: payload.startsAt ? new Date(payload.startsAt) : undefined,
      endsAt: payload.endsAt ? new Date(payload.endsAt) : undefined,
      createdBy: session.user.id,
    });

    await log(200);
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
