import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import { requirePermission } from "@/lib/api-auth-permissions";
import { TargetingService } from "@/services/redeemables";

const manualSchema = z.object({
  userIds: z.array(z.string()).min(1),
});

export async function POST(request: NextRequest) {
  try {
    // Read-only preview: filters a manually-supplied user list, no DB writes.
    const guard = await requirePermission("rewards.view");
    if (guard instanceof NextResponse) return guard;

    await connectDB();
    const body = await request.json();
    const payload = manualSchema.parse(body);

    const userIds = await TargetingService.resolveTargetUserIds({
      targetingMode: "manual-users",
      manualUserIds: payload.userIds,
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
    console.error("Error resolving manual target users:", error);
    return NextResponse.json({ success: false, error: "Failed to resolve manual target users" }, { status: 500 });
  }
}
