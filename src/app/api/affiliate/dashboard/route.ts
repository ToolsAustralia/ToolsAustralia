import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Affiliate from "@/models/Affiliate";
import AffiliateCommission, { IAffiliateCommission } from "@/models/AffiliateCommission";
import { getAffiliateSession } from "@/utils/affiliate/get-affiliate-session";
import mongoose from "mongoose";

/**
 * GET /api/affiliate/dashboard
 * Get affiliate stats and commission breakdown
 * Requires affiliate authentication
 */
export async function GET() {
  try {
    // Verify affiliate authentication
    const session = await getAffiliateSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();

    const affiliate = await Affiliate.findById(session.affiliateId);
    if (!affiliate) {
      return NextResponse.json({ error: "Affiliate account not found" }, { status: 404 });
    }

    // Get only unpaid commissions (pending status)
    const unpaidCommissions: IAffiliateCommission[] = await AffiliateCommission.find({
      affiliateId: affiliate._id,
      status: "pending",
    }).sort({ earnedAt: -1 });

    // Calculate breakdowns from unpaid commissions only
    const breakdown = {
      oneTimePackage: {
        count: 0,
        totalSales: 0,
        totalCommissions: 0,
      },
      upsell: {
        count: 0,
        totalSales: 0,
        totalCommissions: 0,
      },
      membershipFirst: {
        count: 0,
        totalSales: 0,
        totalCommissions: 0,
      },
      membershipRecurring: {
        count: 0,
        totalSales: 0,
        totalCommissions: 0,
      },
    };

    unpaidCommissions.forEach((commission) => {
      const stats = breakdown[commission.commissionType as keyof typeof breakdown];
      if (stats) {
        stats.count++;
        stats.totalSales += commission.purchaseAmount;
        stats.totalCommissions += commission.commissionAmount;
      }
    });

    // Get payout history
    const { default: AffiliatePayout } = await import("@/models/AffiliatePayout");
    const payouts = await AffiliatePayout.find({
      affiliateId: affiliate._id,
    })
      .sort({ paidAt: -1 })
      .limit(10)
      .populate("processedBy", "firstName lastName email")
      .lean();

    return NextResponse.json({
      success: true,
      data: {
        name: affiliate.name,
        username: affiliate.username,
        affiliateCode: affiliate.affiliateCode,
        affiliateLink: affiliate.affiliateLink,
        totalSignups: affiliate.totalSignups,
        totalSales: affiliate.totalSales, // Total sales ever (includes paid commissions)
        totalCommissions: affiliate.totalCommissions, // Unpaid commissions only (resets after payout)
        breakdown,
        recentCommissions: unpaidCommissions.slice(0, 20).map((c) => ({
          id: (c._id as mongoose.Types.ObjectId).toString(),
          type: c.commissionType,
          packageName: c.packageName,
          purchaseAmount: c.purchaseAmount,
          commissionAmount: c.commissionAmount,
          status: c.status,
          earnedAt: c.earnedAt,
        })),
        payoutHistory: payouts.map((p) => ({
          id: (p._id as mongoose.Types.ObjectId).toString(),
          totalAmount: p.totalAmount,
          commissionCount: p.commissionCount,
          paidAt: p.paidAt,
          processedBy: p.processedBy
            ? {
                name: `${(p.processedBy as { firstName?: string; lastName?: string }).firstName || ""} ${
                  (p.processedBy as { firstName?: string; lastName?: string }).lastName || ""
                }`.trim(),
              }
            : null,
          notes: p.notes,
        })),
        bankDetails: affiliate.bankDetails,
      },
    });
  } catch (error) {
    console.error("Error fetching affiliate dashboard:", error);
    return NextResponse.json({ error: "Failed to fetch affiliate dashboard" }, { status: 500 });
  }
}
