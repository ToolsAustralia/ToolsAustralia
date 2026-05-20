import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import Affiliate from "@/models/Affiliate";
import AffiliateCommission from "@/models/AffiliateCommission";
import AffiliatePayout from "@/models/AffiliatePayout";
import User from "@/models/User";
import mongoose from "mongoose";
import { getPackageById } from "@/data/membershipPackages";

function resolveCommissionPackageDisplay(
  packageId: string | undefined,
  packageName: string | undefined,
  commissionType: string
): string {
  if (packageName?.trim()) return packageName.trim();
  if (packageId) {
    const pkg = getPackageById(packageId);
    if (pkg?.name) return pkg.name;
  }
  if (commissionType === "membership-recurring") return "Subscription renewal";
  if (commissionType === "mini-draw-package") return "Mini draw package";
  return "N/A";
}

/**
 * GET /api/admin/affiliate/[id]
 * Get affiliate details with commissions (paginated commissions via query params)
 * Query: page, pageSize, sort (earnedAt|commissionAmount|commission|user|type|purchase|purchaseAmount|package|packageName|status), order (asc|desc), q (search referred user),
 *         referredPage, referredPageSize (paginate referred users list),
 *         referredSort (name|email|phone|referredAt), referredOrder (asc|desc) for referred users list
 * Admin only
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const guard = await requirePermission("affiliates.view");
    if (guard instanceof NextResponse) return guard;

    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid affiliate ID" }, { status: 400 });
    }

    await connectDB();

    const affiliate = await Affiliate.findById(id).select("-password").lean();
    if (!affiliate) {
      return NextResponse.json({ error: "Affiliate not found" }, { status: 404 });
    }

    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get("pageSize") || "20", 10) || 20));
    const referredPage = Math.max(1, parseInt(searchParams.get("referredPage") || "1", 10) || 1);
    const referredPageSize = Math.min(50, Math.max(1, parseInt(searchParams.get("referredPageSize") || "10", 10) || 10));
    const referredSortParam = (searchParams.get("referredSort") || "referredAt").toLowerCase();
    const referredOrderParam = (searchParams.get("referredOrder") || "desc").toLowerCase();
    const referredOrderDir: 1 | -1 = referredOrderParam === "asc" ? 1 : -1;
    const sortParam = (searchParams.get("sort") || "earnedAt").toLowerCase();
    const orderParam = (searchParams.get("order") || "desc").toLowerCase();
    const order: 1 | -1 = orderParam === "asc" ? 1 : -1;
    const q = (searchParams.get("q") || "").trim();

    const sortField =
      sortParam === "commissionamount" || sortParam === "earnings" || sortParam === "commission"
        ? "commissionAmount"
        : sortParam === "purchase" || sortParam === "purchaseamount"
          ? "purchaseAmount"
          : sortParam === "package" || sortParam === "packagename"
            ? "packageName"
            : sortParam === "user" || sortParam === "referreduser"
              ? "user"
              : sortParam === "type" || sortParam === "commissiontype"
                ? "type"
                : sortParam === "status" || sortParam === "commissionstatus"
                  ? "status"
                  : "earnedAt";

    const affiliateObjectId = new mongoose.Types.ObjectId(id);
    const usersCollection = User.collection.name;

    const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const pipeline: mongoose.PipelineStage[] = [
      { $match: { affiliateId: affiliateObjectId } },
      {
        $lookup: {
          from: usersCollection,
          localField: "referredUserId",
          foreignField: "_id",
          as: "refUserArr",
        },
      },
      { $unwind: { path: "$refUserArr", preserveNullAndEmptyArrays: true } },
    ];

    if (q.length > 0) {
      const rx = escapeRegex(q);
      pipeline.push({
        $match: {
          $or: [
            { "refUserArr.email": { $regex: rx, $options: "i" } },
            { "refUserArr.firstName": { $regex: rx, $options: "i" } },
            { "refUserArr.lastName": { $regex: rx, $options: "i" } },
          ],
        },
      });
    }

    if (sortField === "user") {
      pipeline.push({
        $addFields: {
          _sortUserName: {
            $toLower: {
              $trim: {
                input: {
                  $concat: [
                    { $ifNull: ["$refUserArr.firstName", ""] },
                    " ",
                    { $ifNull: ["$refUserArr.lastName", ""] },
                  ],
                },
              },
            },
          },
        },
      });
    }

    if (sortField === "type") {
      pipeline.push({
        $sort: { commissionType: order, earnedAt: -1 } as Record<string, 1 | -1>,
      });
    } else if (sortField === "packageName") {
      pipeline.push({
        $sort: { packageName: order, earnedAt: -1 } as Record<string, 1 | -1>,
      });
    } else if (sortField === "status") {
      pipeline.push({
        $sort: { status: order, earnedAt: -1 } as Record<string, 1 | -1>,
      });
    } else {
      const sortKey =
        sortField === "commissionAmount"
          ? "commissionAmount"
          : sortField === "purchaseAmount"
            ? "purchaseAmount"
            : sortField === "user"
              ? "_sortUserName"
              : "earnedAt";
      pipeline.push({ $sort: { [sortKey]: order } as Record<string, 1 | -1> });
    }

    pipeline.push({
      $facet: {
        pageDocs: [{ $skip: (page - 1) * pageSize }, { $limit: pageSize }],
        totalCount: [{ $count: "count" }],
      },
    });

    const aggResult = await AffiliateCommission.aggregate(pipeline);
    const facet = aggResult[0] as {
      pageDocs: Array<Record<string, unknown>>;
      totalCount: Array<{ count: number }>;
    };

    const total = facet?.totalCount?.[0]?.count ?? 0;
    const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);

    const pageDocs = facet?.pageDocs ?? [];

    const commissions = pageDocs.map((raw) => {
      const c = raw as {
        _id: mongoose.Types.ObjectId;
        commissionType: string;
        packageId?: string;
        packageName?: string;
        purchaseAmount: number;
        commissionAmount: number;
        status: string;
        earnedAt: Date;
        paidAt?: Date;
        refUserArr?: {
          _id: mongoose.Types.ObjectId;
          firstName?: string;
          lastName?: string;
          email?: string;
        };
      };
      const ref = c.refUserArr;
      return {
        id: c._id.toString(),
        type: c.commissionType,
        packageName: resolveCommissionPackageDisplay(c.packageId, c.packageName, c.commissionType),
        purchaseAmount: c.purchaseAmount,
        commissionAmount: c.commissionAmount,
        status: c.status,
        earnedAt: c.earnedAt,
        paidAt: c.paidAt,
        referredUser: ref
          ? {
              id: ref._id.toString(),
              name: `${ref.firstName || ""} ${ref.lastName || ""}`.trim(),
              email: ref.email,
            }
          : null,
      };
    });

    const [pendingAgg] = await AffiliateCommission.aggregate<{
      count: number;
      totalAmount: number;
    }>([
      { $match: { affiliateId: affiliateObjectId, status: "pending" } },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          totalAmount: { $sum: "$commissionAmount" },
        },
      },
    ]);

    const pendingCommissionsSummary = {
      count: pendingAgg?.count ?? 0,
      totalAmount: pendingAgg?.totalAmount ?? 0,
    };

    // Get payout history
    const payouts = await AffiliatePayout.find({
      affiliateId: affiliateObjectId,
    })
      .sort({ paidAt: -1 })
      .populate("processedBy", "firstName lastName email")
      .lean();

    // Referred users (paginated; total signups may exceed this page)
    const referredQuery = {
      "affiliateReferral.affiliateId": affiliateObjectId,
    } as const;
    const referredTotal = await User.countDocuments(referredQuery);
    const referredTotalPages = referredTotal === 0 ? 0 : Math.ceil(referredTotal / referredPageSize);

    const referredSortKey =
      referredSortParam === "name" || referredSortParam === "user"
        ? "name"
        : referredSortParam === "email"
          ? "email"
          : referredSortParam === "phone" || referredSortParam === "mobile"
            ? "phone"
            : "referredAt";

    const referredSortMongo: Record<string, 1 | -1> =
      referredSortKey === "name"
        ? { firstName: referredOrderDir, lastName: referredOrderDir }
        : referredSortKey === "email"
          ? { email: referredOrderDir }
          : referredSortKey === "phone"
            ? { mobile: referredOrderDir }
            : { "affiliateReferral.referredAt": referredOrderDir };

    const referredUsers = await User.find(referredQuery)
      .select("firstName lastName email mobile affiliateReferral.referredAt createdAt")
      .sort(referredSortMongo)
      .skip((referredPage - 1) * referredPageSize)
      .limit(referredPageSize)
      .lean();

    return NextResponse.json({
      success: true,
      data: {
        affiliate: {
          id: affiliate._id.toString(),
          name: affiliate.name,
          email: affiliate.email,
          phone: affiliate.phone,
          username: affiliate.username,
          affiliateCode: affiliate.affiliateCode,
          affiliateLink: affiliate.affiliateLink,
          isActive: affiliate.isActive,
          commissionRate: affiliate.commissionRate ?? 0.3, // Default to 30% if not set
          totalSignups: affiliate.totalSignups,
          totalSales: affiliate.totalSales,
          totalCommissions: affiliate.totalCommissions,
          bankDetails: affiliate.bankDetails,
          createdAt: affiliate.createdAt,
          updatedAt: affiliate.updatedAt,
        },
        referredUsers: referredUsers.map((user) => ({
          id: user._id.toString(),
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          phone: user.mobile || null,
          referredAt: (user.affiliateReferral as { referredAt?: Date })?.referredAt || user.createdAt,
        })),
        referredUsersPagination: {
          total: referredTotal,
          page: referredPage,
          pageSize: referredPageSize,
          totalPages: referredTotalPages,
        },
        commissions,
        commissionsPagination: {
          total,
          page,
          pageSize,
          totalPages,
          sort: sortField,
          order: orderParam,
          q: q || undefined,
        },
        pendingCommissionsSummary,
        payouts: payouts.map((p) => ({
          id: p._id.toString(),
          totalAmount: p.totalAmount,
          commissionCount: p.commissionCount,
          paidAt: p.paidAt,
          processedBy: p.processedBy
            ? {
                name: `${(p.processedBy as { firstName?: string; lastName?: string }).firstName || ""} ${
                  (p.processedBy as { firstName?: string; lastName?: string }).lastName || ""
                }`.trim(),
                email: (p.processedBy as { email?: string }).email,
              }
            : null,
          notes: p.notes,
        })),
      },
    });
  } catch (error) {
    console.error("Error fetching affiliate details:", error);
    return NextResponse.json({ error: "Failed to fetch affiliate details" }, { status: 500 });
  }
}

/**
 * PUT /api/admin/affiliate/[id]
 * Update affiliate (name, email, phone, username, password, isActive)
 * Admin only
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const guard = await requirePermission("affiliates.edit");
    if (guard instanceof NextResponse) return guard;

    const { id } = await params;
    const body = await request.json();

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid affiliate ID" }, { status: 400 });
    }

    await connectDB();

    const affiliate = await Affiliate.findById(id);
    if (!affiliate) {
      return NextResponse.json({ error: "Affiliate not found" }, { status: 404 });
    }

    // Check for email uniqueness if email is being changed
    if (body.email && body.email.toLowerCase().trim() !== affiliate.email) {
      const existingEmail = await Affiliate.findOne({
        email: body.email.toLowerCase().trim(),
        _id: { $ne: id },
      });
      if (existingEmail) {
        return NextResponse.json({ error: "Email already exists" }, { status: 400 });
      }
    }

    // Check for username uniqueness if username is being changed
    if (body.username && body.username.toLowerCase().trim() !== affiliate.username) {
      const existingUsername = await Affiliate.findOne({
        username: body.username.toLowerCase().trim(),
        _id: { $ne: id },
      });
      if (existingUsername) {
        return NextResponse.json({ error: "Username already exists" }, { status: 400 });
      }
    }

    // Update allowed fields
    if (body.isActive !== undefined) {
      affiliate.isActive = body.isActive;
    }
    if (body.name !== undefined) {
      affiliate.name = body.name.trim();
    }
    if (body.email !== undefined) {
      affiliate.email = body.email.toLowerCase().trim();
    }
    if (body.phone !== undefined) {
      affiliate.phone = body.phone?.trim() || undefined;
    }
    if (body.username !== undefined) {
      affiliate.username = body.username.toLowerCase().trim();
    }
    if (body.password !== undefined && body.password.trim().length > 0) {
      // Hash new password if provided
      const bcrypt = await import("bcryptjs");
      affiliate.password = await bcrypt.hash(body.password.trim(), 12);
    }
    if (body.commissionRate !== undefined) {
      // Validate commission rate (0-1 range)
      if (typeof body.commissionRate === "number" && body.commissionRate >= 0 && body.commissionRate <= 1) {
        affiliate.commissionRate = body.commissionRate;
      } else {
        return NextResponse.json({ error: "Commission rate must be between 0 and 1" }, { status: 400 });
      }
    }

    await affiliate.save();
    const affiliateId = (affiliate._id as mongoose.Types.ObjectId).toString();

    return NextResponse.json({
      success: true,
      data: {
        affiliate: {
          id: affiliateId,
          name: affiliate.name,
          email: affiliate.email,
          phone: affiliate.phone,
          username: affiliate.username,
          isActive: affiliate.isActive,
          commissionRate: affiliate.commissionRate ?? 0.3,
        },
      },
    });
  } catch (error) {
    console.error("Error updating affiliate:", error);
    return NextResponse.json({ error: "Failed to update affiliate" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/affiliate/[id]
 * Delete affiliate account
 * Admin only
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const guard = await requirePermission("affiliates.delete");
    if (guard instanceof NextResponse) return guard;

    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid affiliate ID" }, { status: 400 });
    }

    await connectDB();

    const affiliate = await Affiliate.findById(id);
    if (!affiliate) {
      return NextResponse.json({ error: "Affiliate not found" }, { status: 404 });
    }

    // Delete the affiliate
    await Affiliate.findByIdAndDelete(id);

    // Note: We keep commissions and payouts for historical records
    // If you want to delete those too, uncomment below:
    // await AffiliateCommission.deleteMany({ affiliateId: new mongoose.Types.ObjectId(id) });
    // await AffiliatePayout.deleteMany({ affiliateId: new mongoose.Types.ObjectId(id) });

    return NextResponse.json({
      success: true,
      message: "Affiliate deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting affiliate:", error);
    return NextResponse.json({ error: "Failed to delete affiliate" }, { status: 500 });
  }
}

