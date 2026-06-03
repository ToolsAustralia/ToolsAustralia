import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import { requirePermissionWithAudit } from "@/lib/audit-log";
import connectDB from "@/lib/mongodb";
import MiniDraw from "@/models/MiniDraw";
import { Types } from "mongoose";
import { getMiniDrawDetail } from "@/services/admin/MiniDrawService";

/**
 * GET /api/admin/mini-draw/[id]
 * Get mini draw details for editing
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const _guard = await requirePermission("miniDraws.view");
    if (_guard instanceof NextResponse) return _guard;

    const { id } = await params;
    const outcome = await getMiniDrawDetail(id);
    if (!outcome.ok) {
      if (outcome.code === "bad_id") {
        return NextResponse.json({ error: "Invalid mini draw ID" }, { status: 400 });
      }
      return NextResponse.json({ error: "Mini draw not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: { miniDraw: outcome.data },
    });
  } catch (error) {
    console.error("❌ Error fetching mini draw:", error);
    return NextResponse.json(
      { error: "Failed to fetch mini draw", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/mini-draw/[id]
 * Permanently remove a mini draw
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const guard = await requirePermissionWithAudit("miniDraws.delete", request, {
      resourceType: "MiniDraw",
      resourceId: id,
    });
    if (guard instanceof NextResponse) return guard;
    const { log } = guard;

    await connectDB();

    if (!Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid mini draw ID" }, { status: 400 });
    }

    const deleted = await MiniDraw.findByIdAndDelete(id);

    if (!deleted) {
      return NextResponse.json({ error: "Mini draw not found" }, { status: 404 });
    }

    await log(200);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("❌ Error deleting mini draw:", error);
    return NextResponse.json(
      { error: "Failed to delete mini draw", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
