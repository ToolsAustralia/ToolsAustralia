import { NextRequest, NextResponse } from "next/server";
import { requirePermissionWithAudit } from "@/lib/audit-log";
import connectDB from "@/lib/mongodb";
import mongoose from "mongoose";
import { resumeRetentionPause } from "@/services/subscription/RetentionPauseService";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/users/[id]/resume-pause
 *
 * Admin-initiated early resume from a member's 30-day retention pause — e.g. the member asks
 * support to un-pause. Lifts the Stripe pause so collection resumes now; the member returns to
 * `active` only after the resume charge SUCCEEDS (a failed charge → past_due), exactly like the
 * member's own "Resume now". Delegates to `RetentionPauseService.resumeRetentionPause`.
 * Gated by the same permission as admin cancel (subscription lifecycle) with an audit log.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    await connectDB();
    const { id: userId } = await params;

    const guard = await requirePermissionWithAudit("users.cancelSubscription", request, {
      resourceType: "User",
      resourceId: userId,
    });
    if (guard instanceof NextResponse) return guard;
    const { log } = guard;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
    }

    const result = await resumeRetentionPause(userId);

    await log(200);
    return NextResponse.json({
      success: true,
      wasFrozen: result.wasFrozen,
      message: result.wasFrozen
        ? "Member's pause resumed — their next payment is being taken now."
        : "Member's scheduled pause cancelled — membership continues as normal.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to resume membership";
    const status =
      message === "user not found"
        ? 404
        : message === "no active subscription" || message === "no active pause"
          ? 400
          : 500;
    if (status === 500) {
      console.error("❌ Admin resume-pause error:", error);
    }
    return NextResponse.json(
      {
        error:
          status === 500 ? "Failed to resume the member's pause. Please try again." : message,
      },
      { status }
    );
  }
}
