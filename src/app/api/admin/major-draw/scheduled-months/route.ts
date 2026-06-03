import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import { getScheduledDrawMonths } from "@/services/admin/MajorDrawService";

export async function GET() {
  try {
    const _guard = await requirePermission("majorDraw.view");
    if (_guard instanceof NextResponse) return _guard;

    const data = await getScheduledDrawMonths();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("Error fetching scheduled draw months:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch scheduled draw months",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
