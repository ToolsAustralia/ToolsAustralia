import { NextRequest, NextResponse } from "next/server";
import { PromoBannerTextService } from "@/services/admin/PromoBannerTextService";
import { convertUTCToAEST } from "@/utils/common/timezone";
import type { PromoBannerText } from "@/types/admin";

/**
 * GET /api/admin/promo/banner-text/active
 * Get currently active banner text (public endpoint for banner display)
 * No authentication required
 */
export async function GET(_request: NextRequest) {
  try {
    const service = new PromoBannerTextService();
    const activeText = await service.getActiveBannerText();

    if (!activeText) {
      return NextResponse.json(
        {
          success: true,
          data: null,
        },
        {
          status: 200,
          // Same CDN caching as the found-text path below — this null branch is the COMMON
          // response whenever no banner is scheduled, and it was missing the header
          // (caught by the 2026-07-19 prod-server check).
          headers: {
            "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
          },
        }
      );
    }

    // Convert dates from UTC to AEST for response
    const response: PromoBannerText = {
      id: (activeText._id as { toString(): string }).toString(),
      imageUrl: activeText.imageUrl,
      altText: activeText.altText,
      scheduleType: activeText.scheduleType,
      startDate: activeText.startDate ? convertUTCToAEST(activeText.startDate).toISOString() : undefined,
      endDate: activeText.endDate ? convertUTCToAEST(activeText.endDate).toISOString() : undefined,
      recurrencePattern: activeText.recurrencePattern,
      isActive: activeText.isActive,
      description: activeText.description,
      createdAt: activeText.createdAt.toISOString(),
      updatedAt: activeText.updatedAt.toISOString(),
      createdBy: activeText.createdBy
        ? {
            id: activeText.createdBy.toString(),
            email: "",
            firstName: "",
            lastName: "",
          }
        : null,
    };

    return NextResponse.json(
      {
        success: true,
        data: response,
      },
      {
        status: 200,
        // Public, admin-scheduled content with no per-user data — cache at the CDN like the
        // sibling /api/promo/effective-for-banner (2026-07-19 perf: was no-store, which forced
        // one serverless + Mongo round trip per ad-landing visitor).
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
        },
      }
    );
  } catch (error) {
    console.error("Error fetching active banner text:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch active banner text",
      },
      { status: 500 }
    );
  }
}

