import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import { getUnviewedSubmissionsCount } from "@/services/admin/submissionsCountService";

/**
 * GET /api/admin/submissions/unviewed-count
 * Get count of unviewed contact submissions and partner applications (admin only)
 */
export async function GET() {
  try {
    const _guard = await requirePermission("overview.view");
    if (_guard instanceof NextResponse) return _guard;

    const data = await getUnviewedSubmissionsCount();

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("Error fetching unviewed submissions count:", error);
    return NextResponse.json({ error: "Failed to fetch unviewed count" }, { status: 500 });
  }
}
