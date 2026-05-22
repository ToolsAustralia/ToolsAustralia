import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import { requirePermission } from "@/lib/api-auth-permissions";
import { TargetingService } from "@/services/redeemables";
import { monthlyCouponSegmentConfigSchema } from "@/lib/zod/monthlyCouponSegmentConfig";

const dynamicSchema = z.object({
  segmentConfig: monthlyCouponSegmentConfigSchema,
});

export async function POST(request: NextRequest) {
  try {
    // Read-only preview: resolves "who would receive this targeting config" without
    // writing to any collection — gated by view, not audit-logged per spec.
    const guard = await requirePermission("rewards.view");
    if (guard instanceof NextResponse) return guard;

    await connectDB();
    const body = await request.json();
    const payload = dynamicSchema.parse(body);

    const userIds = await TargetingService.resolveTargetUserIds({
      targetingMode: "dynamic-segment",
      segmentConfig: payload.segmentConfig,
    });

    return NextResponse.json({
      success: true,
      data: {
        userIds,
        count: userIds.length,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Validation error", details: error.issues.map((i) => i.message) },
        { status: 400 }
      );
    }

    console.error("Error resolving dynamic target users:", error);
    return NextResponse.json({ success: false, error: "Failed to resolve dynamic target users" }, { status: 500 });
  }
}
