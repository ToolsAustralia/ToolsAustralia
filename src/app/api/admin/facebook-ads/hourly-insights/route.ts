import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import { z } from "zod";
import { HourlyInsightsService } from "@/services/facebook-ads/HourlyInsightsService";
import type { HourlyInsightsResponse } from "@/types/facebook-ads";

/**
 * Query parameters validation schema (for GET: URL params; for POST: body)
 */
const hourlyInsightsQuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD format
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD format
  filterLevel: z.enum(["campaign", "adset", "ad"]).optional(),
  filterIds: z.string().optional(), // Comma-separated IDs, e.g. "id1,id2,id3"
});

/**
 * Parse and validate query from GET params or POST body
 */
async function parseAndValidate(request: NextRequest) {
  let query: Record<string, string>;
  if (request.method === "POST") {
    const body = await request.json().catch(() => ({}));
    const filterLevel = ["campaign", "adset", "ad"].includes(body.filterLevel) ? body.filterLevel : undefined;
    const filterIds = Array.isArray(body.filterIds) ? body.filterIds.join(",") : body.filterIds ?? "";
    query = {
      startDate: String(body.startDate ?? ""),
      endDate: String(body.endDate ?? ""),
      ...(filterLevel && { filterLevel }),
      ...(filterIds && { filterIds }),
    };
  } else {
    const { searchParams } = new URL(request.url);
    query = Object.fromEntries(searchParams.entries());
  }
  return hourlyInsightsQuerySchema.parse(query);
}

/**
 * GET /api/admin/facebook-ads/hourly-insights
 * POST /api/admin/facebook-ads/hourly-insights (use when filterIds is large to avoid HTTP 431)
 *
 * Fetch hourly ad performance: Facebook (spend, impressions, clicks) + your site (revenue, conversions).
 * Orchestration lives in `HourlyInsightsService` so the admin route and Norm projection share one path.
 */
export async function GET(request: NextRequest) {
  return handleHourlyInsights(request);
}

export async function POST(request: NextRequest) {
  return handleHourlyInsights(request);
}

async function handleHourlyInsights(request: NextRequest) {
  try {
    const guard = await requirePermission("facebookAds.view");
    if (guard instanceof NextResponse) return guard;

    await connectDB();

    let validatedQuery;
    try {
      validatedQuery = await parseAndValidate(request);
    } catch (validationError) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid query parameters",
          details: validationError instanceof z.ZodError ? validationError.issues : "Validation failed",
        },
        { status: 400 }
      );
    }

    const filterIds = validatedQuery.filterIds
      ? validatedQuery.filterIds.split(",").map((id) => id.trim()).filter(Boolean)
      : [];

    const result = await new HourlyInsightsService().getHourly({
      startDate: validatedQuery.startDate,
      endDate: validatedQuery.endDate,
      filterLevel: validatedQuery.filterLevel,
      filterIds,
    });

    const response: HourlyInsightsResponse = {
      success: true,
      data: result,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("❌ Error in Facebook hourly insights API:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      },
      { status: 500 }
    );
  }
}
