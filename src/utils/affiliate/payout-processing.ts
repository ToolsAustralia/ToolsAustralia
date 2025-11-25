import connectDB from "@/lib/mongodb";
import Affiliate from "@/models/Affiliate";
import AffiliateCommission from "@/models/AffiliateCommission";
import AffiliatePayout from "@/models/AffiliatePayout";
import mongoose from "mongoose";

/**
 * Process payout for an affiliate
 * Marks all pending commissions as paid and creates payout record
 * Resets affiliate's totalCommissions to 0 for fresh start
 */
export async function processAffiliatePayout({
  affiliateId,
  processedByAdminId,
  notes,
}: {
  affiliateId: string;
  processedByAdminId: string;
  notes?: string;
}) {
  await connectDB();

  const affiliateObjectId = new mongoose.Types.ObjectId(affiliateId);
  const adminObjectId = new mongoose.Types.ObjectId(processedByAdminId);

  // Get all pending commissions for this affiliate
  const pendingCommissions = await AffiliateCommission.find({
    affiliateId: affiliateObjectId,
    status: "pending",
  });

  if (pendingCommissions.length === 0) {
    throw new Error("No pending commissions to process");
  }

  // Calculate total payout amount
  const totalAmount = pendingCommissions.reduce((sum, commission) => sum + commission.commissionAmount, 0);
  const commissionCount = pendingCommissions.length;

  // Create payout record
  const payout = new AffiliatePayout({
    affiliateId: affiliateObjectId,
    totalAmount,
    commissionCount,
    processedBy: adminObjectId,
    notes: notes || undefined,
    paidAt: new Date(),
  });

  await payout.save();

  // Get the payout ID as ObjectId for linking commissions
  const payoutId = payout._id as mongoose.Types.ObjectId;

  // Mark all pending commissions as paid and link to payout
  await AffiliateCommission.updateMany(
    {
      affiliateId: affiliateObjectId,
      status: "pending",
    },
    {
      $set: {
        status: "paid",
        payoutId: payoutId,
        paidAt: new Date(),
      },
    }
  );

  // Reset affiliate's totalCommissions to 0 (fresh start)
  // Keep totalSales and totalSignups as they are historical data
  await Affiliate.findByIdAndUpdate(affiliateObjectId, {
    $set: {
      totalCommissions: 0,
    },
  });

  return {
    payoutId: payoutId.toString(),
    totalAmount,
    commissionCount,
  };
}
