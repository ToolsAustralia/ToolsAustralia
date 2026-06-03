import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import {
  listAffiliates,
  resolveAffiliateListSortKey,
} from "@/services/affiliate/AffiliateAdminListService";

/**
 * GET /api/admin/affiliate/list
 * Get list of all affiliates with stats
 * Query: page, limit, search, sort, order (asc|desc)
 * sort: name | email | affiliateCode | totalSignups | totalSales | isActive | createdAt | unpaidAmount
 * Admin only
 */
export async function GET(request: NextRequest) {
  try {
    const guard = await requirePermission("affiliates.view");
    if (guard instanceof NextResponse) return guard;

    await connectDB();

    const { searchParams } = new URL(request.url);
    const result = await listAffiliates({
      page: parseInt(searchParams.get("page") || "1", 10) || 1,
      limit: parseInt(searchParams.get("limit") || "25", 10) || 25,
      search: searchParams.get("search") || "",
      sort: resolveAffiliateListSortKey(searchParams.get("sort") || "createdAt"),
      order: (searchParams.get("order") || "desc").toLowerCase() === "asc" ? "asc" : "desc",
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("Error fetching affiliates:", error);
    return NextResponse.json({ error: "Failed to fetch affiliates" }, { status: 500 });
  }
}
