import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import { getDashboardStatsSnapshotHealth } from "@/services/admin/dashboard-stats/snapshotHealth";

export async function GET(request: NextRequest) {
  const guard = await requirePermission("overview.view");
  if (guard instanceof NextResponse) return guard;

  // request param is unused — Next 15 App Router still requires the signature.
  void request;

  await connectDB();

  const result = await getDashboardStatsSnapshotHealth();
  return NextResponse.json(result);
}
