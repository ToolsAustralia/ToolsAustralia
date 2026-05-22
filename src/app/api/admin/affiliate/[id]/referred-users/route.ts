import { NextRequest, NextResponse } from "next/server";
import { requirePermissionWithAudit } from "@/lib/audit-log";
import mongoose from "mongoose";
import {
  attachReferredUserForAdmin,
  detachReferredUserForAdmin,
} from "@/utils/affiliate/referred-user-admin";

/**
 * POST /api/admin/affiliate/[id]/referred-users
 * Attach a user as referred by this affiliate.
 * Body: { userId: string, backfillCommissions?: boolean }
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: affiliateId } = await params;
    const guard = await requirePermissionWithAudit("affiliates.edit", request, {
      resourceType: "Affiliate",
      resourceId: affiliateId,
    });
    if (guard instanceof NextResponse) return guard;
    const { log } = guard;
    if (!mongoose.Types.ObjectId.isValid(affiliateId)) {
      return NextResponse.json({ error: "Invalid affiliate ID" }, { status: 400 });
    }

    const body = await request.json();
    const userId = body?.userId;
    const backfillCommissions = body?.backfillCommissions === true;

    if (!userId || typeof userId !== "string" || !mongoose.Types.ObjectId.isValid(userId)) {
      return NextResponse.json({ error: "Invalid or missing userId" }, { status: 400 });
    }

    const result = await attachReferredUserForAdmin({
      affiliateId,
      userId,
      backfillCommissions,
    });

    if (!result.ok) {
      if (result.code === "USER_ALREADY_AFFILIATED") {
        return NextResponse.json(
          {
            success: false,
            error: `This user is already affiliated with another affiliate (${result.currentAffiliateCode}). Multiple referrals are not allowed.`,
            code: "USER_ALREADY_AFFILIATED",
          },
          { status: 409 },
        );
      }
      return NextResponse.json({ success: false, error: result.message }, { status: 404 });
    }

    await log(200);
    return NextResponse.json({
      success: true,
      data: {
        alreadyLinked: result.alreadyLinked,
        backfill: result.backfill ?? null,
      },
    });
  } catch (error) {
    console.error("Error attaching referred user:", error);
    return NextResponse.json({ error: "Failed to attach referred user" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/affiliate/[id]/referred-users
 * Detach a user from this affiliate's referrals.
 * Body: { userId: string }
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: affiliateId } = await params;
    const guard = await requirePermissionWithAudit("affiliates.edit", request, {
      resourceType: "Affiliate",
      resourceId: affiliateId,
    });
    if (guard instanceof NextResponse) return guard;
    const { log } = guard;
    if (!mongoose.Types.ObjectId.isValid(affiliateId)) {
      return NextResponse.json({ error: "Invalid affiliate ID" }, { status: 400 });
    }

    const body = await request.json();
    const userId = body?.userId;

    if (!userId || typeof userId !== "string" || !mongoose.Types.ObjectId.isValid(userId)) {
      return NextResponse.json({ error: "Invalid or missing userId" }, { status: 400 });
    }

    const result = await detachReferredUserForAdmin({ affiliateId, userId });

    if (!result.ok) {
      const status = result.code === "NOT_FOUND" ? 404 : 400;
      return NextResponse.json({ success: false, error: result.message }, { status });
    }

    await log(200);
    return NextResponse.json({
      success: true,
      data: { cancelledPending: result.cancelledPending },
    });
  } catch (error) {
    console.error("Error detaching referred user:", error);
    return NextResponse.json({ error: "Failed to detach referred user" }, { status: 500 });
  }
}
