import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { fromZonedTime } from "date-fns-tz";
import { addDays } from "date-fns";
import { requirePermission } from "@/lib/api-auth-permissions";
import { getRepeatPurchaseUsers } from "@/services/admin/repeatPurchaseAnalytics";
import { REPEAT_BUCKET_KEYS } from "@/types/admin/repeatPurchase";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const AEST = "Australia/Sydney";
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const querySchema = z.object({
  segment: z.enum(["all", "returned", "not-returned"]).optional().default("all"),
  bucket: z.enum(REPEAT_BUCKET_KEYS as unknown as [string, ...string[]]).optional(),
  member: z.enum(["all", "member", "non-member"]).optional().default("all"),
  startDate: z.string().regex(YMD).optional(),
  endDate: z.string().regex(YMD).optional(),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

/**
 * GET /api/admin/analytics/repeat-purchases/users
 * Paged, filterable cohort list. Powers the Users table drill-down.
 */
export async function GET(request: NextRequest) {
  const guard = await requirePermission("pageAnalytics.view");
  if (guard instanceof NextResponse) return guard;

  let q: z.infer<typeof querySchema>;
  try {
    q = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams.entries()));
  } catch (e) {
    return NextResponse.json(
      {
        success: false,
        error: "Invalid query parameters",
        details: e instanceof z.ZodError ? e.issues : "Validation failed",
      },
      { status: 400 }
    );
  }

  try {
    const startDate = q.startDate ? fromZonedTime(`${q.startDate}T00:00:00`, AEST) : undefined;
    const endDate = q.endDate ? addDays(fromZonedTime(`${q.endDate}T00:00:00`, AEST), 1) : undefined;
    const data = await getRepeatPurchaseUsers({
      segment: q.segment,
      bucket: q.bucket as (typeof REPEAT_BUCKET_KEYS)[number] | undefined,
      member: q.member,
      page: q.page,
      limit: q.limit,
      startDate,
      endDate,
    });
    return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "private, max-age=120" } });
  } catch (e) {
    console.error("❌ [repeat-purchases/users] failed:", e);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to load repeat-purchase users",
        details: e instanceof Error ? e.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
