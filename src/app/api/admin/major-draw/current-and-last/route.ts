import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import { getCurrentAndLastDrawRanges } from "@/services/admin/MajorDrawService";

/**
 * GET /api/admin/major-draw/current-and-last
 * Get current and last draw date ranges for filtering.
 * Returns activationDate and drawDate for both draws, formatted as
 * AEST YYYY-MM-DD strings with no overlap between adjacent ranges.
 */
export async function GET(_request: NextRequest) {
  try {
    const _guard = await requirePermission("majorDraw.view");
    if (_guard instanceof NextResponse) return _guard;

    const data = await getCurrentAndLastDrawRanges();
    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error) {
    console.error("Error fetching current and last draw dates:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch draw dates" },
      { status: 500 }
    );
  }
}
