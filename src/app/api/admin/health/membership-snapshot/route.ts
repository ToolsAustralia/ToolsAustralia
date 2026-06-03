import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import { getMembershipSnapshotHealth } from "@/services/admin/dashboard-stats/snapshotHealth";

export async function GET(_request: NextRequest) {
  const guard = await requirePermission("overview.view");
  if (guard instanceof NextResponse) return guard;

  await connectDB();

  const result = await getMembershipSnapshotHealth();
  return NextResponse.json(result);
}
