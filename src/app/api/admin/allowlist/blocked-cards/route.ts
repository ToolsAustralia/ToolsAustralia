import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/api-auth";
import connectDB from "@/lib/mongodb";
import { getAllowlistService } from "@/services/allowlist";
import type { BlockedFilter } from "@/services/allowlist/types";

function parseDateOrDefault(raw: string | null, fallback: Date): Date {
  if (!raw) return fallback;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser();
  if ("errorResponse" in auth) return auth.errorResponse;

  await connectDB();

  const { searchParams } = new URL(request.url);
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const filter: BlockedFilter = {
    dateFrom: parseDateOrDefault(searchParams.get("dateFrom"), thirtyDaysAgo),
    dateTo: parseDateOrDefault(searchParams.get("dateTo"), now),
    memberStatus:
      (searchParams.get("memberStatus") as BlockedFilter["memberStatus"]) ?? "any",
    declineReason:
      (searchParams.get("declineReason") as BlockedFilter["declineReason"]) ?? "any",
    skippedOnly: searchParams.get("skippedOnly") === "true",
  };

  try {
    const cursor = searchParams.get("cursor");
    const limitRaw = searchParams.get("limit");
    const limit = limitRaw
      ? Math.max(1, Math.min(100, parseInt(limitRaw, 10) || 50))
      : 50;
    const result = await getAllowlistService().listBlocked(filter, { cursor, limit });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Failed to list blocked cards",
      },
      { status: 500 }
    );
  }
}
