import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import mongoose from "mongoose";
import { replayRefundReversalForBenefitsGrantedEvent } from "@/utils/payment/refund-processing";

type RouteParams = { params: Promise<{ id: string; eventId: string }> };

/**
 * POST /api/admin/users/[id]/payment-events/[eventId]/reverse
 * Re-run `processRefundReversal` for a BenefitsGranted row when webhooks were missed.
 * `eventId` is the PaymentEvent `_id` (URL-encoded), e.g. BenefitsGranted-invoice_in_xxx
 */
export async function POST(_request: NextRequest, { params }: RouteParams) {
  try {
    const _guard = await requirePermission("users.edit");
    if (_guard instanceof NextResponse) return _guard;

    await connectDB();

    const { id: userId, eventId: rawEventId } = await params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
    }

    if (!rawEventId || typeof rawEventId !== "string") {
      return NextResponse.json({ error: "Invalid event id" }, { status: 400 });
    }

    const benefitsGrantedEventId = decodeURIComponent(rawEventId);

    const result = await replayRefundReversalForBenefitsGrantedEvent({
      targetUserId: userId,
      benefitsGrantedEventId,
    });

    if (result.success || result.alreadyProcessed) {
      return NextResponse.json({ success: true, data: result });
    }

    return NextResponse.json(
      { success: false, error: result.error ?? "Replay failed", data: result },
      { status: 400 }
    );
  } catch (error) {
    console.error("Admin refund replay error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
