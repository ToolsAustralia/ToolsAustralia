import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import { z } from "zod";
import { PurchaseAuditService } from "@/services/facebook-ads/PurchaseAuditService";

const querySchema = z.object({
  range: z.enum(["today", "7d", "30d"]).default("today"),
});

/**
 * GET /api/admin/facebook-ads/purchase-audit
 * Readonly comparison: local PaymentEvent (non-renewal) revenue vs Meta Insights purchase revenue.
 * Orchestration lives in `PurchaseAuditService` so the admin route and Norm projection share one path.
 */
export async function GET(request: NextRequest) {
  try {
    const guard = await requirePermission("facebookAds.view");
    if (guard instanceof NextResponse) return guard;

    await connectDB();

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse(Object.fromEntries(searchParams.entries()));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid query", details: parsed.error.issues },
        { status: 400 }
      );
    }

    const result = await new PurchaseAuditService().audit(parsed.data.range);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("purchase-audit error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
