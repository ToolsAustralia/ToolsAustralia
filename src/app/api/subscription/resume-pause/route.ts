import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { resumeRetentionPause } from "@/services/subscription/RetentionPauseService";

/**
 * POST /api/subscription/resume-pause
 *
 * Member-initiated EARLY resume from a 30-day retention pause (the dashboard "Resume now"
 * button). Lifts the Stripe pause so collection resumes immediately — if the member is already
 * in the frozen window Stripe bills the next cycle now, and they return to `active` only after
 * that charge SUCCEEDS (a failed charge → past_due). If they resume while still inside their
 * paid period, it simply cancels the scheduled pause. Delegates to
 * `RetentionPauseService.resumeRetentionPause` (business logic lives in the service, not here).
 */
export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const result = await resumeRetentionPause(session.user.id);

    return NextResponse.json({
      success: true,
      wasFrozen: result.wasFrozen,
      message: result.wasFrozen
        ? "Your membership is resuming — we're taking your next payment now."
        : "Your scheduled pause has been cancelled — your membership continues as normal.",
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
      console.error("❌ Error resuming retention pause:", error);
    }
    return NextResponse.json(
      {
        error:
          status === 500
            ? "Failed to resume membership. Please try again or contact support."
            : message,
      },
      { status }
    );
  }
}
