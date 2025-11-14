import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import User from "@/models/User";

const verifyPaymentSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
});

/**
 * POST /api/stripe/verify-payment-complete
 * Check if payment benefits have been processed by webhook
 * This ensures dashboard shows actual entries/points before autologin
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId } = verifyPaymentSchema.parse(body);

    await connectDB();

    const user = await User.findById(userId);
    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: "User not found",
        },
        { status: 404 }
      );
    }

    console.log(`🔍 Verifying payment webhook processing for ${user.email}`);

    // Verify that webhook benefits are truly added
    const hasSubscription = user.subscription?.isActive;
    const hasOneTimePackages =
      user.oneTimePackages?.length > 0 && user.oneTimePackages.some((pkg: { isActive: boolean }) => pkg.isActive);

    const paymentProcessingStatus = {
      hasCompletedPayment: !!user.stripeCustomerId,
      hasActiveSubscription: hasSubscription || false,
      hasActiveOneTimePackages: hasOneTimePackages || false,
      accumulatedEntries: user.accumulatedEntries,
      accumulatedPoints: user.rewardsPoints,
      packageCount: user.oneTimePackages?.length || 0,
    };

    // Only confirm auto-login if benefits ACTUALLY processed
    if (hasSubscription || hasOneTimePackages) {
      console.log(`✅ Webhook benefits CONFIRMED - auto-login authorized for ${user.email}`);
      return NextResponse.json({
        success: true,
        benefitsAdded: true,
        paymentComplete: true,
        readyForAutoLogin: true,
        data: paymentProcessingStatus,
      });
    }

    console.log(`⏳ Payment completed, webhook still processing for ${user.email}`);
    return NextResponse.json({
      success: true,
      benefitsAdded: false,
      paymentComplete: !!user.stripeCustomerId,
      readyForAutoLogin: false,
      data: { status: "webhook processing" },
    });
  } catch (error) {
    console.error("❌ Payment verification error:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation failed",
          details: error.issues,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: false, error: "Verification failed" }, { status: 500 });
  }
}
