import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import NormPendingAction from "@/models/NormPendingAction";

export async function GET() {
  const guard = await requirePermission("settings.view");
  if (guard instanceof NextResponse) return guard;
  await connectDB();
  const items = await NormPendingAction.find({ status: "pending" })
    .sort({ createdAt: -1 })
    .lean();
  return NextResponse.json({ success: true, data: items });
}
