import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { stringify } from "csv-stringify/sync";
import { fromZonedTime } from "date-fns-tz";
import { addDays } from "date-fns";
import { requirePermission } from "@/lib/api-auth-permissions";
import { getRepeatPurchaseUsersForExport } from "@/services/admin/repeatPurchaseAnalytics";
import { REPEAT_BUCKET_KEYS } from "@/types/admin/repeatPurchase";
import { formatDateInAEST } from "@/utils/common/timezone";

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
});

const HEADERS = [
  "First Name",
  "Last Name",
  "Email",
  "User ID",
  "First Purchase",
  "First Package",
  "Returned",
  "Days To Return",
  "Purchases",
  "Last Purchase",
  "Last Package",
  "Total Spent (AUD)",
  "Became Member",
];

/**
 * GET /api/admin/analytics/repeat-purchases/users/export
 * CSV of the current repeat-purchase cohort (same segment/bucket/date filters as the
 * Users table). Gated by `pageAnalytics.view` — the tab already shows these rows incl.
 * email, so the export exposes no new data class, just a downloadable copy.
 */
export async function GET(request: NextRequest) {
  const guard = await requirePermission("pageAnalytics.view");
  if (guard instanceof NextResponse) return guard;

  let q: z.infer<typeof querySchema>;
  try {
    q = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams.entries()));
  } catch (e) {
    return NextResponse.json(
      { success: false, error: "Invalid query parameters", details: e instanceof z.ZodError ? e.issues : "Validation failed" },
      { status: 400 }
    );
  }

  try {
    const startDate = q.startDate ? fromZonedTime(`${q.startDate}T00:00:00`, AEST) : undefined;
    const endDate = q.endDate ? addDays(fromZonedTime(`${q.endDate}T00:00:00`, AEST), 1) : undefined;

    const rows = await getRepeatPurchaseUsersForExport({
      segment: q.segment,
      bucket: q.bucket as (typeof REPEAT_BUCKET_KEYS)[number] | undefined,
      member: q.member,
      startDate,
      endDate,
    });

    const records = rows.map((r) => [
      r.firstName ?? "",
      r.lastName ?? "",
      r.email ?? "",
      r.userId,
      formatDateInAEST(new Date(r.firstPurchaseAt), "yyyy-MM-dd"),
      r.firstPackageName ?? r.firstPackageId,
      r.secondPurchaseAt ? "Yes" : "No",
      r.daysToReturn ?? "",
      r.purchaseCount,
      formatDateInAEST(new Date(r.lastPurchaseAt), "yyyy-MM-dd"),
      r.lastPackageName ?? r.lastPackageId,
      r.totalSpent,
      r.becameMember ? "Yes" : "No",
    ]);

    const csv = stringify([HEADERS, ...records], {
      quoted: true,
      quoted_empty: true,
      bom: true,
      record_delimiter: "windows",
    });

    const dateStr = formatDateInAEST(new Date(), "yyyy-MM-dd");
    const timeStr = formatDateInAEST(new Date(), "HHmmss");
    const suffix = [q.segment, q.bucket, q.member !== "all" ? q.member : ""].filter(Boolean).join("-");
    const filename = `repeat-purchases-${suffix}-${dateStr}-${timeStr}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-cache",
      },
    });
  } catch (e) {
    console.error("❌ [repeat-purchases/users/export] failed:", e);
    return NextResponse.json(
      { success: false, error: "Failed to export repeat-purchase users", details: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
