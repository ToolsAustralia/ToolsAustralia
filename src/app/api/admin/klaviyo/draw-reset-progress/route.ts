/**
 * GET /api/admin/klaviyo/draw-reset-progress
 * 
 * Progress endpoint to check sync progress
 * Returns current progress status for manual syncs
 * 
 * Authentication: Admin only
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSyncProgress } from "@/utils/integrations/klaviyo/klaviyo-draw-reset";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_request: NextRequest) {
  try {
    // Verify admin authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const progress = getSyncProgress();

    return NextResponse.json(
      {
        success: true,
        data: progress,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("❌ Error getting sync progress:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
