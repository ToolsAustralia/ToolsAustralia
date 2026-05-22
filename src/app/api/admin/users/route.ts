import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import { listAdminUsers } from "@/services/admin/UserAdminQueryService";

/**
 * GET /api/admin/users
 * Paginated user list with search, filtering, computed per-row stats, and
 * headline-counts rollup. Thin handler — business logic lives in
 * `UserAdminQueryService.listAdminUsers`.
 */
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const guard = await requirePermission("users.view");
    if (guard instanceof NextResponse) return guard;

    const { searchParams } = new URL(request.url);

    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "25"), 100);
    const search = searchParams.get("search") || "";
    const subscriptionStatus = searchParams.get("subscriptionStatus") || "";
    const autoRenew = searchParams.get("autoRenew") || "";
    const membershipPackage = searchParams.get("membershipPackage") || "";
    const role = searchParams.get("role") || "";
    const dateFrom = searchParams.get("dateFrom") || "";
    const dateTo = searchParams.get("dateTo") || "";
    const sortBy = searchParams.get("sortBy") || "createdAt";
    const sortOrder = searchParams.get("sortOrder") === "asc" ? "asc" : "desc";
    const states = searchParams.getAll("state").map((s) => s.trim()).filter(Boolean);
    const inActiveMajorDraw = searchParams.get("inActiveMajorDraw") || "";

    const result = await listAdminUsers({
      page,
      limit,
      search,
      subscriptionStatus,
      autoRenew,
      membershipPackage,
      role,
      dateFrom,
      dateTo,
      states,
      inActiveMajorDraw,
      sortBy,
      sortOrder,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("❌ Error fetching admin users list:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch users list",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
