import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import NormPendingAction from "@/models/NormPendingAction";

const BodySchema = z.object({
  decision: z.enum(["approve", "deny"]),
  note: z.string().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Approving a Norm pending action is effectively delegating an action to Norm — same authority needed
  // as editing role permissions. settings.edit is the right gate.
  const guard = await requirePermission("settings.edit");
  if (guard instanceof NextResponse) return guard;
  const { id } = await params;
  const body = BodySchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json(
      { success: false, error: "Invalid body" },
      { status: 400 }
    );
  }
  await connectDB();

  const action = await NormPendingAction.findById(id);
  if (!action) {
    return NextResponse.json(
      { success: false, error: "not found" },
      { status: 404 }
    );
  }
  if (action.status !== "pending") {
    return NextResponse.json(
      { success: false, error: `already ${action.status}` },
      { status: 409 }
    );
  }

  if (body.data.decision === "deny") {
    action.status = "denied";
    action.resolutionNote = body.data.note;
    action.resolvedAt = new Date();
    action.resolvedBy = guard.session.user.id;
    await action.save();
    return NextResponse.json({ success: true, data: { status: "denied" } });
  }

  // Approve: Phase 4 framework-readiness — there are no triggers wired yet so we just record approval.
  // Later specs will dispatch to the underlying service here.
  action.status = "approved";
  action.resolvedAt = new Date();
  action.resolvedBy = guard.session.user.id;
  action.resolutionOutcome = { ok: true };
  await action.save();
  return NextResponse.json({ success: true, data: { status: "approved" } });
}
