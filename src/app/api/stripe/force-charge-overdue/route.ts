// src/app/api/stripe/force-charge-overdue/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import {
  forceChargeCurrentCycle,
  type ForceChargeResult,
} from "@/server/admin/forceChargePastDue";

const statusByReason: Record<
  Exclude<ForceChargeResult, { ok: true }>["reason"],
  number
> = {
  user_not_found: 404,
  subscription_inactive: 409,
  not_past_due: 409,
  package_not_found: 409,
  recent_charge_attempt: 429,
  period_already_paid: 409,
  no_chargeable_invoice: 409,
  finalize_failed: 502,
  pay_failed: 502,
};

export async function POST(_request: NextRequest) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    // User triggers force-charge for themselves. adminId === userId — the
    // InvoiceChargeLog row is "self-served" and the result tag carries
    // triggeredBy: "user" so audit can distinguish.
    const result = await forceChargeCurrentCycle({
      userId: session.user.id,
      triggeredBy: "user",
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
      paymentStatus: result.row.status,
      amount: result.row.amount,
    });
  } catch (error) {
    console.error("force-charge-overdue user route error:", error);
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
