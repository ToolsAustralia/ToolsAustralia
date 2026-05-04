import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/api-auth";
import connectDB from "@/lib/mongodb";
import AllowlistAction from "@/models/AllowlistAction";

const VALID_ACTION_FILTERS = new Set(["added", "skipped", "removed", "all"]);

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser();
  if ("errorResponse" in auth) return auth.errorResponse;

  await connectDB();

  const { searchParams } = new URL(request.url);
  const limitRaw = parseInt(searchParams.get("limit") ?? "50", 10);
  const limit = Math.min(200, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 50));
  const action = (searchParams.get("action") ?? "all").toLowerCase();
  if (!VALID_ACTION_FILTERS.has(action)) {
    return NextResponse.json({ success: false, error: "Invalid action filter" }, { status: 400 });
  }

  const filter = action === "all" ? {} : { action };
  const docs = await AllowlistAction.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
  return NextResponse.json({
    success: true,
    actions: docs.map((d) => ({ ...d, _id: String(d._id) })),
  });
}
