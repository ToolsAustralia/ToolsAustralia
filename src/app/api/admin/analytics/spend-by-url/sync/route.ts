import { NextRequest, NextResponse } from "next/server";
import { requirePermissionWithAudit } from "@/lib/audit-log";
import connectDB from "@/lib/mongodb";
import { runMetaSpendByUrlSync } from "@/services/meta/runMetaSpendByUrlSync";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const bodySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/**
 * POST /api/admin/analytics/spend-by-url/sync
 * Body: { startDate, endDate } — pulls Meta insights, resolves destinations, recomputes aggregates.
 */
export async function POST(request: NextRequest) {
  try {
    const guard = await requirePermissionWithAudit("facebookAds.edit", request);
    if (guard instanceof NextResponse) return guard;
    const { log } = guard;

    await connectDB();

    const adAccountId = process.env.FACEBOOK_AD_ACCOUNT_ID;
    const accessToken = process.env.FACEBOOK_MARKETING_ACCESS_TOKEN;
    if (!adAccountId || !accessToken) {
      return NextResponse.json(
        { success: false, error: "Facebook Marketing API env vars not configured" },
        { status: 500 }
      );
    }

    const json = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid body", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { startDate, endDate } = parsed.data;
    if (startDate > endDate) {
      return NextResponse.json(
        { success: false, error: "startDate must be on or before endDate" },
        { status: 400 }
      );
    }

    const result = await runMetaSpendByUrlSync(adAccountId, accessToken, {
      since: startDate,
      until: endDate,
    });

    await log(200);
    return NextResponse.json({ success: true, data: result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Sync failed";
    console.error("spend-by-url sync POST:", e);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
