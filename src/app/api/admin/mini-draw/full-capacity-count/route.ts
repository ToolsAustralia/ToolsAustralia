import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import { getMiniDrawFullCapacityCount } from "@/services/admin/MiniDrawService";

/**
 * GET /api/admin/mini-draw/full-capacity-count
 * Get count of mini draws at 100% (status completed) needing winner selection
 */
export async function GET() {
  try {
    const _guard = await requirePermission("miniDraws.view");
    if (_guard instanceof NextResponse) return _guard;

    const data = await getMiniDrawFullCapacityCount();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error fetching mini draw full capacity count:", error);
    return NextResponse.json(
      { error: "Failed to fetch full capacity count" },
      { status: 500 }
    );
  }
}
