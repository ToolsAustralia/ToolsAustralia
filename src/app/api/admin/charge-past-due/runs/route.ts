import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import {
  listChargeRuns,
  parseAestDayStartUtc,
  parseAestDayEndExclusiveUtc,
} from "@/services/admin/chargePastDueHistory";
import type { ChargeJobRunStatus } from "@/models/ChargeJobRun";

const VALID_STATUS: readonly ChargeJobRunStatus[] = ["running", "completed", "failed", "aborted"];

export async function GET(request: NextRequest) {
  const guard = await requirePermission("users.view");
  if (guard instanceof NextResponse) return guard;

  await connectDB();

  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get("status");
  const status = statusParam && (VALID_STATUS as readonly string[]).includes(statusParam)
    ? (statusParam as ChargeJobRunStatus)
    : undefined;

  const result = await listChargeRuns({
    startDate: parseAestDayStartUtc(searchParams.get("startDate")),
    endDate: parseAestDayEndExclusiveUtc(searchParams.get("endDate")),
    adminId: searchParams.get("adminId") || undefined,
    status,
    limit: Number(searchParams.get("limit")) || 50,
    offset: Number(searchParams.get("offset")) || 0,
  });

  return NextResponse.json(result);
}
