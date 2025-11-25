import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import Affiliate from "@/models/Affiliate";
import AffiliateCommission from "@/models/AffiliateCommission";
import AffiliatePayout from "@/models/AffiliatePayout";
import User from "@/models/User";
import mongoose from "mongoose";

/**
 * GET /api/admin/affiliate/[id]
 * Get affiliate details with commissions
 * Admin only
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Verify admin authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid affiliate ID" }, { status: 400 });
    }

    await connectDB();

    const affiliate = await Affiliate.findById(id).select("-password").lean();
    if (!affiliate) {
      return NextResponse.json({ error: "Affiliate not found" }, { status: 404 });
    }

    // Get all commissions (paid and unpaid)
    const allCommissions = await AffiliateCommission.find({
      affiliateId: new mongoose.Types.ObjectId(id),
    })
      .sort({ earnedAt: -1 })
      .populate("referredUserId", "firstName lastName email")
      .lean();

    // Get payout history
    const payouts = await AffiliatePayout.find({
      affiliateId: new mongoose.Types.ObjectId(id),
    })
      .sort({ paidAt: -1 })
      .populate("processedBy", "firstName lastName email")
      .lean();

    // Get referred users (users who have this affiliate in their affiliateReferral)
    const referredUsers = await User.find({
      "affiliateReferral.affiliateId": new mongoose.Types.ObjectId(id),
    })
      .select("firstName lastName email mobile affiliateReferral.referredAt")
      .sort({ "affiliateReferral.referredAt": -1 })
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
        commissions: allCommissions.map((c) => ({
          id: c._id.toString(),
          type: c.commissionType,
          packageName: c.packageName,
          purchaseAmount: c.purchaseAmount,
          commissionAmount: c.commissionAmount,
          status: c.status,
          earnedAt: c.earnedAt,
          paidAt: c.paidAt,
          referredUser: c.referredUserId
            ? {
                id: (c.referredUserId as { _id: { toString: () => string } })._id.toString(),
                name: `${(c.referredUserId as { firstName?: string; lastName?: string }).firstName || ""} ${
                  (c.referredUserId as { firstName?: string; lastName?: string }).lastName || ""
                }`.trim(),
                email: (c.referredUserId as { email?: string }).email,
              }
            : null,
        })),
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
    // Verify admin authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
    // Verify admin authentication
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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

