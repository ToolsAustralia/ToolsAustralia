import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import { getMerByDraw } from "@/services/admin/mer/merByDrawService";
import type { MerByDrawResponse } from "@/types/admin/mer";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/analytics/mer-by-draw
 * Marketing Efficiency Ratio (New Revenue ÷ Ad Spend) per major draw, with a
 * per-platform breakdown. Self-contained (no date params) — rows are draw windows.
 */
export async function GET() {
  try {
    const guard = await requirePermission("overview.view");
    if (guard instanceof NextResponse) return guard;

    await connectDB();

    const rows = await getMerByDraw();
    return NextResponse.json({ success: true, rows } satisfies MerByDrawResponse);
  } catch (e) {
    console.error("mer-by-draw GET:", e);
    return NextResponse.json(
      { success: false, rows: [], error: "Failed to load MER table" } satisfies MerByDrawResponse,
      { status: 500 }
    );
  }
}
