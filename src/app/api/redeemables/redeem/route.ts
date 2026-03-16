import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import { requireAuthenticatedUser } from "@/lib/api-auth";
import { RedemptionService } from "@/services/redeemables";

const redeemSchema = z
  .object({
    code: z.string().trim().min(6).max(32).optional(),
    issuanceId: z.string().optional(),
  })
  .refine((data) => Boolean(data.code || data.issuanceId), {
    message: "Either code or issuanceId is required",
  });

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuthenticatedUser();
    if ("errorResponse" in authResult) {
      return authResult.errorResponse;
    }

    await connectDB();
    const body = await request.json();
    const payload = redeemSchema.parse(body);

    const result = await RedemptionService.redeem({
      userId: authResult.session.user.id,
      code: payload.code,
      issuanceId: payload.issuanceId,
    });

    if (!result.success) {
      const statusByReason: Record<string, number> = {
        unauthorized: 401,
        campaign_not_found: 404,
        campaign_not_active: 400,
        invalid_code: 400,
        already_redeemed: 409,
        expired: 400,
        ineligible: 403,
        concurrency_conflict: 409,
      };
      return NextResponse.json(
        { success: false, error: result.reason || "Redemption failed" },
        { status: statusByReason[result.reason || ""] || 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result,
      message: `Redeemed successfully. ${result.entriesGranted || 0} entries added.`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Validation error", details: error.issues.map((i) => i.message) },
        { status: 400 }
      );
    }
    console.error("Error redeeming code:", error);
    return NextResponse.json({ success: false, error: "Failed to redeem code" }, { status: 500 });
  }
}
