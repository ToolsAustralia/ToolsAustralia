import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import { requireAdminUser } from "@/lib/api-auth";
import { TargetingService } from "@/services/redeemables";
import { monthlyCouponSegmentConfigSchema } from "@/lib/zod/monthlyCouponSegmentConfig";

const dynamicSchema = z.object({
  segmentConfig: monthlyCouponSegmentConfigSchema,
});

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAdminUser();
    if ("errorResponse" in authResult) {
      return authResult.errorResponse;
    }

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
