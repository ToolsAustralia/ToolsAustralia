import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import Affiliate from "@/models/Affiliate";
import AffiliateCommission from "@/models/AffiliateCommission";
import mongoose from "mongoose";

/**
 * GET /api/admin/affiliate/list
 * Get list of all affiliates with stats
 * Query: page, limit, search, sort, order (asc|desc)
 * sort: name | email | affiliateCode | totalSignups | totalSales | isActive | createdAt | unpaidAmount
 * Admin only
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const limit = Math.min(parseInt(searchParams.get("limit") || "25", 10) || 25, 100);
    const search = searchParams.get("search") || "";
    const rawSort = (searchParams.get("sort") || "createdAt").toLowerCase();
    const orderParam = (searchParams.get("order") || "desc").toLowerCase();
    const orderNum: 1 | -1 = orderParam === "asc" ? 1 : -1;

    const filter: Record<string, unknown> = {};
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { affiliateCode: { $regex: search, $options: "i" } },
        { username: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (page - 1) * limit;
    const total = await Affiliate.countDocuments(filter);

    const sortKey =
      rawSort === "name"
        ? "name"
        : rawSort === "email"
          ? "email"
          : rawSort === "affiliatecode" || rawSort === "code"
            ? "affiliateCode"
            : rawSort === "totalsignups" || rawSort === "signups"
              ? "totalSignups"
              : rawSort === "totalsales" || rawSort === "sales"
                ? "totalSales"
                : rawSort === "isactive" || rawSort === "status"
                  ? "isActive"
                  : rawSort === "unpaidamount" || rawSort === "unpaid"
                    ? "unpaidAmount"
                    : rawSort === "createdat" || rawSort === "created"
                      ? "createdAt"
                      : "createdAt";

    let affiliatesRaw: Array<Record<string, unknown> & { _id: mongoose.Types.ObjectId }>;
    let unpaidFromAggregate = false;

    if (sortKey === "unpaidAmount") {
      const commColl = AffiliateCommission.collection.name;
      const pipeline: mongoose.PipelineStage[] = [
        { $match: filter },
        {
          $lookup: {
            from: commColl,
            let: { aid: "$_id" },
            pipeline: [
              {
                $match: {
                  $expr: {
                    $and: [{ $eq: ["$affiliateId", "$$aid"] }, { $eq: ["$status", "pending"] }],
                  },
                },
              },
              {
                $group: {
                  _id: null,
                  unpaidAmount: { $sum: "$commissionAmount" },
                  unpaidCount: { $sum: 1 },
                },
              },
            ],
            as: "_pendingUnpaid",
          },
        },
        {
          $addFields: {
            _unpaidAmount: { $ifNull: [{ $arrayElemAt: ["$_pendingUnpaid.unpaidAmount", 0] }, 0] },
            _unpaidCount: { $ifNull: [{ $arrayElemAt: ["$_pendingUnpaid.unpaidCount", 0] }, 0] },
          },
        },
        { $sort: { _unpaidAmount: orderNum, createdAt: -1 } },
        { $skip: skip },
        { $limit: limit },
        { $project: { password: 0, _pendingUnpaid: 0 } },
      ];

      affiliatesRaw = (await Affiliate.aggregate(pipeline)) as typeof affiliatesRaw;
      unpaidFromAggregate = true;
    } else {
      const mongoSort: Record<string, 1 | -1> = {
        [sortKey]: orderNum,
        ...(sortKey !== "createdAt" ? { createdAt: -1 as const } : {}),
      };
      affiliatesRaw = (await Affiliate.find(filter)
        .select("-password")
        .sort(mongoSort)
        .skip(skip)
        .limit(limit)
        .lean()) as unknown as typeof affiliatesRaw;
    }

    const affiliateIds = affiliatesRaw.map((a) => a._id);

    let unpaidMap: Map<string, { count: number; amount: number }>;
    if (unpaidFromAggregate) {
      unpaidMap = new Map(
        affiliatesRaw.map((a) => {
          const id = a._id.toString();
          const count = typeof a._unpaidCount === "number" ? a._unpaidCount : 0;
          const amount = typeof a._unpaidAmount === "number" ? a._unpaidAmount : 0;
          return [id, { count, amount }];
        })
      );
    } else {
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
      unpaidMap = new Map(
        unpaidCommissions.map((uc) => [uc._id.toString(), { count: uc.unpaidCount, amount: uc.unpaidAmount }])
      );
    }

    const affiliatesWithStats = affiliatesRaw.map((affiliate) => {
      const id = affiliate._id.toString();
      const unpaid = unpaidMap.get(id) || { count: 0, amount: 0 };
      return {
        id,
        name: affiliate.name as string,
        email: affiliate.email as string,
        phone: affiliate.phone as string | undefined,
        username: affiliate.username as string,
        affiliateCode: affiliate.affiliateCode as string,
        affiliateLink: affiliate.affiliateLink as string,
        isActive: affiliate.isActive as boolean,
        totalSignups: affiliate.totalSignups as number,
        totalSales: affiliate.totalSales as number,
        totalCommissions: affiliate.totalCommissions as number,
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
          totalPages: Math.ceil(total / limit) || 0,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching affiliates:", error);
    return NextResponse.json({ error: "Failed to fetch affiliates" }, { status: 500 });
  }
}
