import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import PromoLink from "@/models/PromoLink";
import { createRateLimiter, getClientIdentifier } from "@/utils/security/rateLimiter";

const validatePromoRateLimiter = createRateLimiter("promo-link-validate", {
  windowMs: 60 * 1000,
  maxRequests: 60,
});

const PROMO_CODE_REGEX = /^(?=.{6,32}$)[A-Z0-9]+(?:-[A-Z0-9]+)*$/;

/**
 * GET /api/promo/link/validate
 * Public endpoint to validate if a promo link code is valid and active
 * Used for frontend validation before purchase
 */
export async function GET(request: NextRequest) {
  try {
    const clientIp = request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? null;
    const identifier = getClientIdentifier(clientIp, request.headers.get("x-forwarded-for"));
    const rateLimitResult = validatePromoRateLimiter.check(identifier);
    if (!rateLimitResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Too many requests",
          retryAfterSeconds: rateLimitResult.retryAfterSeconds,
        },
        { status: 429, headers: { "Retry-After": String(rateLimitResult.retryAfterSeconds) } }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get("code");

    if (!code) {
      return NextResponse.json({
        success: true,
        valid: false,
        message: "Promo code is invalid",
      });
    }

    const normalizedCode = code.trim().toUpperCase();
    if (!PROMO_CODE_REGEX.test(normalizedCode)) {
      return NextResponse.json({
        success: true,
        valid: false,
        message: "Promo code is invalid",
      });
    }

    await connectDB();
    const promoLink = await PromoLink.findActiveByCode(normalizedCode);

    if (!promoLink) {
      return NextResponse.json({
        success: true,
        valid: false,
        message: "Promo code is invalid",
      });
    }

    // Check if expired
    if (promoLink.isExpired()) {
      return NextResponse.json({
        success: true,
        valid: false,
        message: "Promo code is invalid",
      });
    }

    return NextResponse.json({
      success: true,
      valid: true,
      data: {
        code: promoLink.code,
        bonusEntries: promoLink.bonusEntries,
        expiresAt: promoLink.expiresAt,
        appliesToMembership: promoLink.appliesToMembership,
        appliesToOneTime: promoLink.appliesToOneTime,
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
