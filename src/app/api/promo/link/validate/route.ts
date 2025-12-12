import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import PromoLink from "@/models/PromoLink";

/**
 * GET /api/promo/link/validate
 * Public endpoint to validate if a promo link code is valid and active
 * Used for frontend validation before purchase
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get("code");

    if (!code) {
      return NextResponse.json(
        {
          success: false,
          error: "Promo code is required",
        },
        { status: 400 }
      );
    }

    const normalizedCode = code.trim().toUpperCase();

    // Find active promo link
    const promoLink = await PromoLink.findActiveByCode(normalizedCode);

    if (!promoLink) {
      return NextResponse.json({
        success: true,
        valid: false,
        message: "Promo code not found or inactive",
      });
    }

    // Check if expired
    if (promoLink.isExpired()) {
      return NextResponse.json({
        success: true,
        valid: false,
        message: "Promo code has expired",
        expiresAt: promoLink.expiresAt,
      });
    }

    return NextResponse.json({
      success: true,
      valid: true,
      data: {
        code: promoLink.code,
        bonusEntries: promoLink.bonusEntries,
        expiresAt: promoLink.expiresAt,
      },
    });
  } catch (error) {
    console.error("❌ Error validating promo link:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to validate promo link",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

