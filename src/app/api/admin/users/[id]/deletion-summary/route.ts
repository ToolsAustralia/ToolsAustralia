/**
 * GET /api/admin/users/[id]/deletion-summary
 *
 * Get a preview of what will be deleted when a user is deleted.
 * This is a read-only operation - no actual deletion happens.
 */

import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import { getUserDeletionSummary } from "@/utils/admin/get-user-deletion-summary";
import connectDB from "@/lib/mongodb";

/**
 * GET deletion summary for a user
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Modal-only read → `users.viewDetail`. Gating only the parent detail route would leave
    // this reachable by direct request from a role that must not read a customer's record.
    const guard = await requirePermission("users.viewDetail");
    if (guard instanceof NextResponse) return guard;

    await connectDB();

    const { id } = await params;

    // Get deletion summary (preview only, no deletion)
    const summary = await getUserDeletionSummary(id);

    return NextResponse.json({
      success: true,
      data: summary,
    });
  } catch (error) {
    console.error(`❌ Error getting deletion summary:`, error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to get deletion summary",
      },
      { status: 500 }
    );
  }
}























