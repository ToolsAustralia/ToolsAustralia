import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import { z } from "zod";
import {
  recoverStrandedPastDueInvoice,
  type RecoverStrandedResult,
} from "@/server/admin/recoverStrandedPastDue";

const itemSchema = z.object({
  userId: z.string().min(1),
  originalInvoiceId: z.string().min(1),
});

// Max 10 items per call — each item takes ~3s of Stripe round-trips, and we
// need to fit comfortably under Vercel's 30s function timeout.
const bodySchema = z.object({
  confirmation: z.literal("RECOVER ALL"),
  items: z.array(itemSchema).min(1).max(10),
});

export async function POST(request: NextRequest) {
  try {
    const guard = await requirePermission("users.edit");
    if (guard instanceof NextResponse) return guard;

    const { session } = guard;
    await connectDB();
    const adminId = session.user.id;

    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Invalid request",
          message:
            'Body must be { confirmation: "RECOVER ALL", items: [{userId, originalInvoiceId}] } with 1-10 items',
        },
        { status: 400 }
      );
    }

    type RowResult = {
      userId: string;
      originalInvoiceId: string;
      ok: boolean;
      newInvoiceId?: string;
      reason?: string;
      message?: string;
      paymentStatus?: "success" | "failed" | "skipped";
      error?: string;
      amount?: number;
    };

    const results: RowResult[] = [];
    let succeeded = 0;
    let failed = 0;

    // Sequential: each call hits Stripe and Mongo, has its own 24h lock + idempotency.
    // Sequential pacing (no Promise.all) keeps rate-limit pressure low and produces
    // a deterministic results order matching the input.
    for (const item of parsed.data.items) {
      const result: RecoverStrandedResult = await recoverStrandedPastDueInvoice({
        userId: item.userId,
        originalInvoiceId: item.originalInvoiceId,
        adminId,
        bypassRecentRecoveryLock: true,
      });

      if (result.ok) {
        succeeded++;
        results.push({
          userId: item.userId,
          originalInvoiceId: item.originalInvoiceId,
          ok: true,
          newInvoiceId: result.newInvoiceId,
          paymentStatus: result.row.status,
          error: result.row.error,
          amount: result.row.amount,
        });
      } else {
        failed++;
        results.push({
          userId: item.userId,
          originalInvoiceId: item.originalInvoiceId,
          ok: false,
          reason: result.reason,
          message: result.message,
        });
      }

      // Small delay between rows to avoid Stripe rate-limit pressure
      await new Promise((r) => setTimeout(r, 300));
    }

    return NextResponse.json({
      success: true,
      summary: { total: parsed.data.items.length, succeeded, failed },
      results,
    });
  } catch (error) {
    console.error("recover-past-due bulk route error:", error);
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
