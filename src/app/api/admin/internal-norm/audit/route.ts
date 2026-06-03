import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import NormCallLog from "@/models/NormCallLog";

export async function GET(request: NextRequest) {
  const guard = await requirePermission("settings.view");
  if (guard instanceof NextResponse) return guard;
  await connectDB();
  const sp = request.nextUrl.searchParams;
  const limit = Math.min(Number(sp.get("limit") || 50), 200);
  const cursor = sp.get("cursor");
  const filter: Record<string, unknown> = {};
  if (sp.get("registryKey")) filter.registryKey = sp.get("registryKey");
  if (sp.get("tier")) filter.tier = sp.get("tier");
  if (sp.get("status")) filter.responseStatus = Number(sp.get("status"));
  if (cursor) filter._id = { $lt: cursor };
  const items = await NormCallLog.find(filter).sort({ _id: -1 }).limit(limit).lean();
  return NextResponse.json({
    success: true,
    data: items,
    nextCursor:
      items.length === limit ? String(items[items.length - 1]._id) : null,
  });
}
