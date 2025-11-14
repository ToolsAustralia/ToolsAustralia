import { NextRequest, NextResponse } from "next/server";
import { getAllPackages, getPackagesByType, type StaticMembershipPackage } from "@/data/membershipPackages";

/**
 * GET /api/memberships
 * Get membership packages with optional filtering
 * Now uses static data for improved performance
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") as "subscription" | "one-time" | null;

    // Get packages from static data
    let packages: StaticMembershipPackage[];

    if (type) {
      packages = getPackagesByType(type);
    } else {
      packages = getAllPackages();
    }

    // Sort by price (ascending)
    packages.sort((a, b) => a.price - b.price);

    return NextResponse.json({
      success: true,
      data: packages,
      count: packages.length,
    });
  } catch (error) {
    console.error("Error fetching membership packages:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch membership packages",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/memberships
 * Subscribe to a membership package
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, packageId } = body;

    if (!userId || !packageId) {
      return NextResponse.json({ success: false, error: "Invalid request parameters" }, { status: 400 });
    }

    // In a real implementation, this would:
    // 1. Validate the package exists and is available
    // 2. Process payment with Stripe
    // 3. Create/update user membership
    // 4. Send confirmation email
    // 5. Update user's entry wallet

    return NextResponse.json({
      success: true,
      data: {
        membershipId: `membership-${Date.now()}`,
        packageId,
        startDate: new Date().toISOString(),
        message: "Membership activated successfully",
      },
    });
  } catch (error) {
    console.error("Error creating membership:", error);
    return NextResponse.json({ success: false, error: "Failed to create membership" }, { status: 500 });
  }
}
