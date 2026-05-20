import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import { getChargeRunDetail } from "@/services/admin/chargePastDueHistory";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const guard = await requirePermission("users.view");
  if (guard instanceof NextResponse) return guard;

  await connectDB();

  const { runId } = await params;
  const detail = await getChargeRunDetail(runId);
  if (!detail) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  return NextResponse.json(detail);
}
