import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import Affiliate from "@/models/Affiliate";
import AffiliateCommission from "@/models/AffiliateCommission";

/**
 * GET /api/admin/affiliate/list
 * Get list of all affiliates with stats
 * Admin only
 */
export async function GET(request: NextRequest) {
  try {
    // Verify admin authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "25"), 100);
    const search = searchParams.get("search") || "";

    // Build filter
    const filter: Record<string, unknown> = {};
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { affiliateCode: { $regex: search, $options: "i" } },
        { username: { $regex: search, $options: "i" } },
      ];
    }

    // Get affiliates with pagination
    const skip = (page - 1) * limit;
    const affiliates = await Affiliate.find(filter)
      .select("-password") // Don't return password
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Affiliate.countDocuments(filter);

    // Get unpaid commission counts for each affiliate
    const affiliateIds = affiliates.map((a) => a._id);
    const unpaidCommissions = await AffiliateCommission.aggregate([
      {
        $match: {
          affiliateId: { $in: affiliateIds },
          status: "pending",
        },
      },
      {
        $group: {
          _id: "$affiliateId",
          unpaidCount: { $sum: 1 },
          unpaidAmount: { $sum: "$commissionAmount" },
        },
      },
    ]);

    const unpaidMap = new Map(
      unpaidCommissions.map((uc) => [uc._id.toString(), { count: uc.unpaidCount, amount: uc.unpaidAmount }])
    );

    const affiliatesWithStats = affiliates.map((affiliate) => {
      const unpaid = unpaidMap.get(affiliate._id.toString()) || { count: 0, amount: 0 };
      return {
        id: affiliate._id.toString(),
        name: affiliate.name,
        email: affiliate.email,
        phone: affiliate.phone,
        username: affiliate.username,
        affiliateCode: affiliate.affiliateCode,
        affiliateLink: affiliate.affiliateLink,
        isActive: affiliate.isActive,
        totalSignups: affiliate.totalSignups,
        totalSales: affiliate.totalSales,
        totalCommissions: affiliate.totalCommissions,
        unpaidCommissions: unpaid.count,
        unpaidAmount: unpaid.amount,
        createdAt: affiliate.createdAt,
        updatedAt: affiliate.updatedAt,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        affiliates: affiliatesWithStats,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error("Error fetching affiliates:", error);
    return NextResponse.json({ error: "Failed to fetch affiliates" }, { status: 500 });
  }
}

