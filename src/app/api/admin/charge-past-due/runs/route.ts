import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import { listChargeRuns } from "@/services/admin/chargePastDueHistory";
import type { ChargeJobRunStatus } from "@/models/ChargeJobRun";

const VALID_STATUS: readonly ChargeJobRunStatus[] = ["running", "completed", "failed", "aborted"];

function parseDate(s: string | null): Date | undefined {
  if (!s) return undefined;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await connectDB();

  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get("status");
  const status = statusParam && (VALID_STATUS as readonly string[]).includes(statusParam)
    ? (statusParam as ChargeJobRunStatus)
    : undefined;

  const result = await listChargeRuns({
    startDate: parseDate(searchParams.get("startDate")),
    endDate: parseDate(searchParams.get("endDate")),
    adminId: searchParams.get("adminId") || undefined,
    status,
    limit: Number(searchParams.get("limit")) || 50,
    offset: Number(searchParams.get("offset")) || 0,
  });

  return NextResponse.json(result);
}
