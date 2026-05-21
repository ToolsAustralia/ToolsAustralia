import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import connectDB from "@/lib/mongodb";
import { requireAdminUser } from "@/lib/api-auth";
import { filterCampaignAudience } from "@/services/redeemables";

const filterBodySchema = z.object({
  subscriptionStatus: z.enum(["active", "inactive", "any"]).optional(),
  membershipTiers: z
    .array(z.enum(["tradie-subscription", "foreman-subscription", "boss-subscription"]))
    .optional(),
  states: z.array(z.string().trim().min(2).max(3)).optional(),
  requiresEmailVerified: z.boolean().optional(),
  topEntriesPercent: z.number().int().min(1).max(100).optional(),
  searchQuery: z.string().optional(),
  page: z.number().int().min(1).optional(),
  limit: z.number().int().min(1).max(50).optional(),
  /** When true, returns every matching user id (same filters), ignoring page/limit */
  returnMatchingUserIds: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAdminUser();
    if ("errorResponse" in authResult) {
      return authResult.errorResponse;
    }

    await connectDB();
    const body = await request.json();
    const payload = filterBodySchema.parse(body);

    const result = await filterCampaignAudience(payload);

    if (result.mode === "bulk-too-large") {
      return NextResponse.json(
        {
          success: false,
          error: `Too many matches (${result.totalCount.toLocaleString()}). Narrow filters (maximum ${result.cap.toLocaleString()} users per bulk add).`,
        },
        { status: 400 },
      );
    }

    if (result.mode === "bulk") {
      return NextResponse.json({
        success: true,
        data: {
          userIds: result.userIds,
          totalCount: result.totalCount,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        users: result.users,
        pagination: result.pagination,
        ...(result.warning ? { warning: result.warning } : {}),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Validation error", details: error.issues.map((i) => i.message) },
        { status: 400 },
      );
    }
    console.error("Error filtering campaign audience:", error);
    return NextResponse.json({ success: false, error: "Failed to filter audience" }, { status: 500 });
  }
}
