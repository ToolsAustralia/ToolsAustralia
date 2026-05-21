import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import { getChargeRunDetail } from "@/services/admin/chargePastDueHistory";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  await connectDB();

  const { runId } = await params;
  const detail = await getChargeRunDetail(runId);
  if (!detail) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  return NextResponse.json(detail);
}
