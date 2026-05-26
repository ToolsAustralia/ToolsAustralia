import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET /api/cron/reconcile-major-draw-entries
 *
 * Safety net for the swallowed-`addToMajorDraw` failure mode: membership
 * renewals that were charged + accumulated on the user but never credited to the
 * active MajorDraw (empty `data.grants.drawGrants`). Self-heals the shortfall
 * idempotently — see `reconcileActiveMajorDrawEntries`. Writes to Mongo, never
 * to Stripe.
 *
 * Vercel cron — internal-only, same posture as siblings (no CRON_SECRET check;
 * protected by Vercel's cron-only invocation).
 */
export async function GET() {
  const startTime = Date.now();
  try {
    const { reconcileActiveMajorDrawEntries } = await import("@/utils/draws/reconcile-major-draw-entries");
    const result = await reconcileActiveMajorDrawEntries();

    const summary = { ...result, durationMs: Date.now() - startTime };

    // Alert when we had to heal anything, when non-membership gaps appear, or on errors.
    const alerted = result.healed > 0 || result.nonMembershipEmptyDrawGrants > 0 || result.errors > 0;
    if (alerted) {
      console.error("[reconcile-major-draw-entries] HEAL/DRIFT", JSON.stringify(summary));
    } else {
      console.log("[reconcile-major-draw-entries] OK", summary);
    }

    return NextResponse.json({ success: true, ...summary });
  } catch (e) {
    console.error("[reconcile-major-draw-entries] failure:", e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : "error" },
      { status: 500 }
    );
  }
}
