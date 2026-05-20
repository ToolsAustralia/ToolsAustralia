// src/app/api/admin/users/[id]/force-charge/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import { z } from "zod";
import {
  forceChargeCurrentCycle,
  type ForceChargeResult,
} from "@/server/admin/forceChargePastDue";

const bodySchema = z.object({
  confirmation: z.literal("FORCE CHARGE"),
});

const statusByReason: Record<
  Exclude<ForceChargeResult, { ok: true }>["reason"],
  number
> = {
  user_not_found: 404,
  subscription_inactive: 409,
  not_past_due: 409,
  package_not_found: 409,
  recent_charge_attempt: 409,
  period_already_paid: 409,
  no_chargeable_invoice: 409,
  finalize_failed: 502,
  pay_failed: 502,
};

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const guard = await requirePermission("users.edit");
    if (guard instanceof NextResponse) return guard;
    const { session } = guard;

    await connectDB();
    const { id: userId } = await params;

    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid request",
          message: 'Body must be { confirmation: "FORCE CHARGE" }',
        },
        { status: 400 }
      );
    }

    const result = await forceChargeCurrentCycle({
      userId,
      triggeredBy: "admin",
      adminId: session.user.id,
    });

    if (!result.ok) {
      return NextResponse.json(
        { success: false, reason: result.reason, message: result.message },
        { status: statusByReason[result.reason] ?? 500 }
      );
    }

    return NextResponse.json({
      success: true,
      chargedInvoiceId: result.chargedInvoiceId,
      row: result.row,
    });
  } catch (error) {
    console.error("force-charge admin route error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
