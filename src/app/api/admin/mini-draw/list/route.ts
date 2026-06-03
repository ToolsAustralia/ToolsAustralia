import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import { z } from "zod";
import { listMiniDraws } from "@/services/admin/MiniDrawService";

// Validation schema for query parameters
const listQuerySchema = z.object({
  status: z.enum(["active", "completed", "cancelled"]).optional(),
  search: z.string().optional(),
  page: z.string().regex(/^\d+$/).default("1").transform(Number),
  limit: z.string().regex(/^\d+$/).default("20").transform(Number),
  sortBy: z
    .enum(["displayOrder", "createdAt", "name", "totalEntries", "minimumEntries"])
    .default("displayOrder"),
  sortOrder: z.enum(["asc", "desc"]).default("asc"),
});

/**
 * GET /api/admin/mini-draw/list
 * List all mini draws with pagination, filtering, and sorting
 */
export async function GET(request: NextRequest) {
  try {
    const _guard = await requirePermission("miniDraws.view");
    if (_guard instanceof NextResponse) return _guard;

    const { searchParams } = new URL(request.url);
    const queryParams = Object.fromEntries(searchParams.entries());

    const validated = listQuerySchema.parse(queryParams);

    const data = await listMiniDraws(validated);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error("❌ Error fetching mini draws:", error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation error",
          details: error.issues.map((issue) => ({
            field: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch mini draws",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
