import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import Affiliate from "@/models/Affiliate";
import { processAffiliatePayout } from "@/utils/affiliate/payout-processing";
import mongoose from "mongoose";

const processPayoutSchema = z.object({
  notes: z.string().optional(),
});

/**
 * POST /api/admin/affiliate/[id]/process-payout
 * Process payout for affiliate - marks all pending commissions as paid
 * Admin only
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Verify admin authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid affiliate ID" }, { status: 400 });
    }

    const validatedData = processPayoutSchema.parse(body);

    await connectDB();

    // Verify affiliate exists
    const affiliate = await Affiliate.findById(id);
    if (!affiliate) {
      return NextResponse.json({ error: "Affiliate not found" }, { status: 404 });
    }

    // Process payout
    const payout = await processAffiliatePayout({
      affiliateId: id,
      processedByAdminId: session.user.id,
      notes: validatedData.notes,
    });

    return NextResponse.json({
      success: true,
      data: {
        payout,
        message: `Payout processed successfully. ${payout.commissionCount} commissions marked as paid.`,
      },
    });
  } catch (error) {
    console.error("Error processing payout:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid input data", details: error.issues }, { status: 400 });
    }
    if (error instanceof Error && error.message === "No pending commissions to process") {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to process payout" }, { status: 500 });
  }
}

