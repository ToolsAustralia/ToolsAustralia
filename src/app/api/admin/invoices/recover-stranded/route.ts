import { NextRequest, NextResponse } from "next/server";
import { requirePermissionWithAudit } from "@/lib/audit-log";
import connectDB from "@/lib/mongodb";
import { previewStrandedRecovery, runStrandedRecovery } from "@/server/admin/recoverStrandedBulk";

// The preview scans every past-due member's Stripe invoices — give it headroom.
// (Vercel clamps to the plan's max; this is a hint, not a guarantee.)
export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Each recoverable member makes ~5-7 SERIAL Stripe round-trips (void stale opens,
// finalize+void superseded drafts, finalize current draft, retrieve customer, pay, retrieve
// PI), so the whole run must fit Vercel's 300s cap. At a worst case of ~5s/member, 30 members
// ≈ 150s — comfortably inside the budget. Larger batches timed out (the process is killed,
// the run is left "running", and the lock self-releases only after its 30-min TTL). The run is
// idempotent (a paid draft drops from the next scan), so drain larger backlogs in 30-member
// batches by re-clicking Recover.
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 30;

/** GET — read-only worklist + totals (no Stripe writes). */
export async function GET(request: NextRequest) {
  const guard = await requirePermissionWithAudit("users.view", request);
  if (guard instanceof NextResponse) return guard;
  try {
    await connectDB();
    const preview = await previewStrandedRecovery();
    return NextResponse.json({ success: true, preview });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to build stranded preview", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

/** POST — destructive: void stale opens + finalize/pay current draft, capped. */
export async function POST(request: NextRequest) {
  const guard = await requirePermissionWithAudit("users.charge", request);
  if (guard instanceof NextResponse) return guard;
  const { session, log } = guard;
  try {
    await connectDB();
    const body = await request.json();
    if (body.confirmation !== "RECOVER") {
      return NextResponse.json(
        { error: "Invalid confirmation", message: 'You must type "RECOVER" to confirm this action.' },
        { status: 400 }
      );
    }
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(body.limit) || DEFAULT_LIMIT));
    const userIds = Array.isArray(body.userIds) ? body.userIds.map(String) : undefined;

    const result = await runStrandedRecovery({ adminId: session.user.id, limit, userIds });
    await log(200);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if ((error as { code?: number })?.code === 11000) {
      await log(409);
      return NextResponse.json(
        { error: "Operation in progress", message: "Another bulk charge/recover is running. Try again later." },
        { status: 409 }
      );
    }
    await log(500);
    return NextResponse.json(
      { success: false, error: "Recovery failed", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
