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
  // Store request body for error logging
  let requestBody: Record<string, unknown> = {};
  
  try {
    requestBody = await request.json();
    const { referralCode, inviteeUserId, inviteeEmail } = validateReferralSchema.parse(requestBody);

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
    // Enhanced error logging with stack trace and context
    const errorContext = {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : "UnknownError",
      body: {
        referralCode: requestBody?.referralCode || "unknown",
        inviteeUserId: requestBody?.inviteeUserId || "unknown",
        inviteeEmail: requestBody?.inviteeEmail || "unknown",
      },
      timestamp: new Date().toISOString(),
    };

    // Log full error details for Vercel (structured logging)
    console.error("Referral validation error:", JSON.stringify(errorContext, null, 2));
    
    // Also log stack trace separately for better visibility in Vercel
    if (error instanceof Error && error.stack) {
      console.error("Error stack trace:", error.stack);
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid referral data",
          details: error.issues,
          errorCode: "REFERRAL_VALIDATION_INVALID_DATA",
          timestamp: errorContext.timestamp,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to validate referral code",
        // Include error code for easier tracking in Vercel logs
        errorCode: "REFERRAL_VALIDATION_FAILED",
        timestamp: errorContext.timestamp,
      },
      { status: 400 }
    );
  }
}
