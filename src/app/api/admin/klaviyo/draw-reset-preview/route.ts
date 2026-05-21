/**
 * GET /api/admin/klaviyo/draw-reset-preview
 *
 * Preview endpoint to see which users will be synced to Klaviyo
 * Returns target draw info, user counts, and sample users without actually syncing
 *
 * Authentication: Admin only
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import { getKlaviyoDrawResetPreview } from "@/services/klaviyo/klaviyoDrawResetService";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(_request: NextRequest) {
  try {
    const _guard = await requirePermission("overview.view");
    if (_guard instanceof NextResponse) return _guard;

    const previewData = await getKlaviyoDrawResetPreview();

    return NextResponse.json(
      {
        success: true,
        data: previewData,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("❌ Error getting Klaviyo sync preview:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
