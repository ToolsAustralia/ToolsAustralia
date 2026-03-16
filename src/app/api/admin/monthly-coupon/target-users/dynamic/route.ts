import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import { requireAdminUser } from "@/lib/api-auth";
import { TargetingService } from "@/services/redeemables";

const dynamicSchema = z.object({
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
