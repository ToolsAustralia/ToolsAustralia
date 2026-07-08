import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import { z } from "zod";
import { handleApiError } from "@/lib/errors/handlers";
import { getChatbotCostAnalytics } from "@/services/admin/chatbotCostAnalytics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(30),
});

/**
 * GET /api/admin/chatbot-cost
 * Returns chatbot cost & usage analytics for the requested day window.
 * Optional ?days=N (default 30, clamped 1–90).
 * Gated by overview.view permission.
 */
export async function GET(request: NextRequest) {
  try {
    const guard = await requirePermission("overview.view");
    if (guard instanceof NextResponse) return guard;

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse(
      Object.fromEntries(searchParams.entries())
    );
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: {
            code: "BAD_REQUEST",
            message: "Invalid ?days= parameter (expected integer 1–90)",
          },
        },
        { status: 400 }
      );
    }

    const { days } = parsed.data;
    const data = await getChatbotCostAnalytics({ days });

    return NextResponse.json(
      {
        data,
        meta: { timestamp: new Date().toISOString() },
      },
      {
        status: 200,
        headers: { "Cache-Control": "private, max-age=300" },
      }
    );
  } catch (error) {
    return handleApiError(error);
  }
}
