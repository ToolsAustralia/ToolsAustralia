import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import {
  listManualRetries,
  parseAestDayStartUtc,
  parseAestDayEndExclusiveUtc,
} from "@/services/admin/chargePastDueHistory";

const VALID_STATUS = ["success", "failed", "skipped"] as const;
type Status = (typeof VALID_STATUS)[number];

export async function GET(request: NextRequest) {
  const guard = await requirePermission("users.view");
  if (guard instanceof NextResponse) return guard;

  await connectDB();

  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get("status");
  const status = statusParam && (VALID_STATUS as readonly string[]).includes(statusParam)
    ? (statusParam as Status)
    : undefined;

  const userSearch = (searchParams.get("userSearch") ?? "").trim() || undefined;

  const result = await listManualRetries({
    startDate: parseAestDayStartUtc(searchParams.get("startDate")),
    endDate: parseAestDayEndExclusiveUtc(searchParams.get("endDate")),
    adminId: searchParams.get("adminId") || undefined,
    status,
    userSearch,
    limit: Number(searchParams.get("limit")) || 50,
    offset: Number(searchParams.get("offset")) || 0,
  });

  return NextResponse.json(result);
}
