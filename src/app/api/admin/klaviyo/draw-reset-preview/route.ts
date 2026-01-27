/**
 * GET /api/admin/klaviyo/draw-reset-preview
 * 
 * Preview endpoint to see which users will be synced to Klaviyo
 * Returns target draw info, user counts, and sample users without actually syncing
 * 
 * Authentication: Admin only
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUsersForKlaviyoResetPreview } from "@/utils/integrations/klaviyo/klaviyo-draw-reset";

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    // Verify admin authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("📊 Admin requesting Klaviyo sync preview");

    const previewData = await getUsersForKlaviyoResetPreview();

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
