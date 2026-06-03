import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import { z } from "zod";
import { listPromoHistory } from "@/services/promo/PromoQueryService";

// Validation schema for query parameters
const historyQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 1)),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 10)),
  type: z.enum(["membership-packages", "one-time-packages", "mini-packages"]).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const guard = await requirePermission("promos.view");
    if (guard instanceof NextResponse) return guard;

    const { searchParams } = new URL(request.url);
    const queryParams = Object.fromEntries(searchParams.entries());
    const { page, limit, type } = historyQuerySchema.parse(queryParams);

    const result = await listPromoHistory({ page, limit, type });

    return NextResponse.json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    console.error("❌ Error fetching promo history:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation error",
          details: error.issues.map((err) => ({
            field: err.path.join("."),
            message: err.message,
          })),
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch promo history",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
