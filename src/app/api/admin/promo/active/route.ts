import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import { listActivePromos } from "@/services/promo/PromoQueryService";

export async function GET() {
  try {
    const guard = await requirePermission("promos.view");
    if (guard instanceof NextResponse) return guard;

    const { data, count } = await listActivePromos();

    return NextResponse.json({
      success: true,
      data,
      count,
    });
  } catch (error) {
    console.error("❌ Error fetching active promos:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch active promos",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// Public endpoint for frontend to get active promos (no admin auth required)
export async function POST() {
  try {
    const { data, count } = await listActivePromos();

    // Public projection omits createdAt + createdBy (server-internal metadata)
    const publicData = data.map(({ createdAt: _createdAt, createdBy: _createdBy, ...rest }) => rest);

    return NextResponse.json({
      success: true,
      data: publicData,
      count,
    });
  } catch (error) {
    console.error("❌ Error fetching active promos (public):", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch active promos",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
