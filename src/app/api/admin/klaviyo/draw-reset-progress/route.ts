/**
 * GET /api/admin/klaviyo/draw-reset-progress
 * 
 * Progress endpoint to check sync progress
 * Returns current progress status for manual syncs
 * 
 * Authentication: Admin only
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import { getSyncProgress } from "@/utils/integrations/klaviyo/klaviyo-draw-reset";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_request: NextRequest) {
  try {
    const _guard = await requirePermission("overview.view");
    if (_guard instanceof NextResponse) return _guard;

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
