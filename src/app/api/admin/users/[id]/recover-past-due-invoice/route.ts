import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import { z } from "zod";
import {
  recoverStrandedPastDueInvoice,
  checkRecoveryEligibility,
} from "@/server/admin/recoverStrandedPastDue";

const bodySchema = z.object({
  confirmation: z.literal("RECOVER"),
  originalInvoiceId: z.string().min(1),
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await connectDB();
  const session = await getServerSession(authOptions);
  if (!session?.user?.id || session.user.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: userId } = await params;
  const url = new URL(request.url);
  const originalInvoiceId = url.searchParams.get("invoiceId");
  if (!originalInvoiceId) {
    return NextResponse.json(
      { error: "missing invoiceId query param" },
      { status: 400 }
    );
  }

  const result = await checkRecoveryEligibility({ userId, originalInvoiceId });
  return NextResponse.json(result, { status: 200 });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();

    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: userId } = await params;

    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid request",
          message:
            'Body must be { confirmation: "RECOVER", originalInvoiceId: "in_..." }',
        },
        { status: 400 }
      );
    }

    const result = await recoverStrandedPastDueInvoice({
      userId,
      originalInvoiceId: parsed.data.originalInvoiceId,
      adminId: session.user.id,
    });

    if (!result.ok) {
      const statusByReason: Record<typeof result.reason, number> = {
        user_not_found: 404,
        subscription_inactive: 409,
        not_past_due: 409,
        package_not_found: 409,
        invoice_not_found: 404,
        invoice_owner_mismatch: 403,
        invoice_subscription_mismatch: 403,
        invoice_still_chargeable: 409,
        invoice_already_paid: 409,
        invoice_unknown_status: 409,
        no_held_draft: 409,
        no_payment_method: 409,
        recent_recovery_attempt: 409,
        void_failed: 502,
        draft_create_failed: 502,
        finalize_failed: 502,
      };
      return NextResponse.json(
        { success: false, reason: result.reason, message: result.message },
        { status: statusByReason[result.reason] }
      );
    }

    return NextResponse.json({
      success: true,
      newInvoiceId: result.newInvoiceId,
      row: result.row,
    });
  } catch (error) {
    console.error("recover-past-due-invoice route error:", error);
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
