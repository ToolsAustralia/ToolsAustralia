import { NextRequest, NextResponse } from "next/server";
import { requireAdminUser } from "@/lib/api-auth";
import connectDB from "@/lib/mongodb";
import { getAllowlistService } from "@/services/allowlist";

const VALID_ACTION_FILTERS = new Set(["added", "skipped", "removed", "all"] as const);
type ActionFilter = "added" | "skipped" | "removed" | "all";

export async function GET(request: NextRequest) {
  const auth = await requireAdminUser();
  if ("errorResponse" in auth) return auth.errorResponse;

  await connectDB();

  const { searchParams } = new URL(request.url);
  const limitRaw = parseInt(searchParams.get("limit") ?? "50", 10);
  const limit = Math.min(200, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 50));
  const actionRaw = (searchParams.get("action") ?? "all").toLowerCase() as ActionFilter;
  if (!VALID_ACTION_FILTERS.has(actionRaw)) {
    return NextResponse.json({ success: false, error: "Invalid action filter" }, { status: 400 });
  }

  const actions = await getAllowlistService().listActions({ limit, action: actionRaw });
  return NextResponse.json({ success: true, actions });
}
