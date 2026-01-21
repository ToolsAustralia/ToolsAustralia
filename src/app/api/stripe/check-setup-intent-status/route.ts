import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { checkSetupIntentStatus } from "@/utils/payment/stripe/setup-intent-utils";

export async function POST(request: NextRequest) {
  try {
    const { clientSecret } = await request.json();

    if (!clientSecret || typeof clientSecret !== "string") {
      return NextResponse.json(
        { success: false, error: "Client secret is required" },
        { status: 400 }
      );
    }

    const statusResult = await checkSetupIntentStatus(stripe, clientSecret);

    return NextResponse.json({
      success: true,
      data: statusResult,
    });
  } catch (error) {
    console.error("❌ Failed to check SetupIntent status:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
