import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import { validateReferralCodeForUser } from "@/lib/referral";

const validateReferralSchema = z.object({
  referralCode: z.string().min(3, "Referral code is required"),
  inviteeUserId: z.string().optional(),
  inviteeEmail: z.string().email().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { referralCode, inviteeUserId, inviteeEmail } = validateReferralSchema.parse(body);

    await connectDB();

    const result = await validateReferralCodeForUser({
      referralCode,
      inviteeUserId,
      inviteeEmail,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Referral validation error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid referral data",
          details: error.issues,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to validate referral code",
      },
      { status: 400 }
    );
  }
}
