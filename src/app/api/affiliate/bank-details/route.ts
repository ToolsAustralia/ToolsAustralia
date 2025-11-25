import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import Affiliate from "@/models/Affiliate";
import { getAffiliateSession } from "@/utils/affiliate/get-affiliate-session";

const bankDetailsSchema = z.object({
  accountName: z.string().optional(),
  bsb: z.string().optional(),
  accountNumber: z.string().optional(),
  bankName: z.string().optional(),
});

/**
 * PUT /api/affiliate/bank-details
 * Update affiliate bank details
 * Requires affiliate authentication
 */
export async function PUT(request: NextRequest) {
  try {
    // Verify affiliate authentication
    const session = await getAffiliateSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const validatedData = bankDetailsSchema.parse(body);

    await connectDB();

    const affiliate = await Affiliate.findById(session.affiliateId);
    if (!affiliate) {
      return NextResponse.json({ error: "Affiliate account not found" }, { status: 404 });
    }

    // Update bank details
    affiliate.bankDetails = {
      accountName: validatedData.accountName || affiliate.bankDetails?.accountName,
      bsb: validatedData.bsb || affiliate.bankDetails?.bsb,
      accountNumber: validatedData.accountNumber || affiliate.bankDetails?.accountNumber,
      bankName: validatedData.bankName || affiliate.bankDetails?.bankName,
    };

    await affiliate.save();

    return NextResponse.json({
      success: true,
      data: {
        bankDetails: affiliate.bankDetails,
      },
    });
  } catch (error) {
    console.error("Error updating bank details:", error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid input data", details: error.issues }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to update bank details" }, { status: 500 });
  }
}

