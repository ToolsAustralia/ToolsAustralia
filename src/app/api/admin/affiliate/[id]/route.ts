import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/api-auth-permissions";
import connectDB from "@/lib/mongodb";
import Affiliate from "@/models/Affiliate";
import mongoose from "mongoose";
import {
  getAffiliateDetail,
  isValidAffiliateId,
  resolveAffiliateDetailSortField,
  resolveAffiliateReferredSortKey,
} from "@/services/affiliate/AffiliateAdminListService";

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

    if (!isValidAffiliateId(id)) {
      return NextResponse.json({ error: "Invalid affiliate ID" }, { status: 400 });
    }

    await connectDB();

    const searchParams = request.nextUrl.searchParams;
    const result = await getAffiliateDetail({
      id,
      page: parseInt(searchParams.get("page") || "1", 10) || 1,
      pageSize: parseInt(searchParams.get("pageSize") || "20", 10) || 20,
      sort: resolveAffiliateDetailSortField(searchParams.get("sort") || "earnedAt"),
      order: (searchParams.get("order") || "desc").toLowerCase() === "asc" ? "asc" : "desc",
      q: searchParams.get("q") || "",
      referredPage: parseInt(searchParams.get("referredPage") || "1", 10) || 1,
      referredPageSize: parseInt(searchParams.get("referredPageSize") || "10", 10) || 10,
      referredSort: resolveAffiliateReferredSortKey(searchParams.get("referredSort") || "referredAt"),
      referredOrder:
        (searchParams.get("referredOrder") || "desc").toLowerCase() === "asc" ? "asc" : "desc",
    });

    if (!result) {
      return NextResponse.json({ error: "Affiliate not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: result });
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

