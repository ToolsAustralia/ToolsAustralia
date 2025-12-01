/**
 * Affiliate Commission Reversal Utility
 *
 * Reverses affiliate commissions when payments are refunded.
 * Handles edge cases like already paid out commissions.
 */

import connectDB from "@/lib/mongodb";
import Affiliate from "@/models/Affiliate";
import AffiliateCommission from "@/models/AffiliateCommission";
import mongoose from "mongoose";

/**
 * Reverse affiliate commissions linked to a refunded payment
 *
 * @param paymentIntentId - Stripe payment intent ID that was refunded
 * @param userId - User ID (optional, for additional filtering)
 * @returns Reversal result with details
 */
export async function reverseAffiliateCommissions(
  paymentIntentId: string,
  userId?: string
): Promise<{ success: boolean; reversed: number; alreadyPaid: number; error?: string }> {
  console.log(`🔄 reverseAffiliateCommissions called:`, {
    paymentIntentId,
    userId,
  });

  try {
    await connectDB();

    // Find all commissions linked to this payment intent
    const query: {
      stripePaymentIntentId: string;
      referredUserId?: mongoose.Types.ObjectId;
    } = {
      stripePaymentIntentId: paymentIntentId,
    };

    if (userId) {
      query.referredUserId = new mongoose.Types.ObjectId(userId);
    }

    const commissions = await AffiliateCommission.find(query);

    if (commissions.length === 0) {
      console.log(`⚠️ No affiliate commissions found for payment intent: ${paymentIntentId}`);
      return {
        success: true,
        reversed: 0,
        alreadyPaid: 0,
      };
    }

    console.log(`📋 Found ${commissions.length} commission(s) to reverse`);

    let reversedCount = 0;
    let alreadyPaidCount = 0;

    // Process each commission
    for (const commission of commissions) {
      // Check if commission was already paid out
      if (commission.status === "paid") {
        console.warn(`⚠️ Commission ${commission._id} was already paid out - cannot reverse automatically`);
        console.warn(
          `   Amount: $${(commission.commissionAmount / 100).toFixed(2)}, Payout ID: ${commission.payoutId}`
        );
        alreadyPaidCount++;
        continue; // Skip paid commissions - they require manual intervention
      }

      // Check if commission was already cancelled
      if (commission.status === "cancelled") {
        console.log(`✅ Commission ${commission._id} already cancelled - skipping`);
        continue;
      }

      // Mark commission as cancelled
      commission.status = "cancelled";
      await commission.save();

      console.log(`✅ Reversed commission ${commission._id} (${commission.commissionType})`);

      // Update affiliate totals (subtract from totals)
      await Affiliate.findByIdAndUpdate(commission.affiliateId, {
        $inc: {
          totalSales: -commission.purchaseAmount,
          totalCommissions: -commission.commissionAmount,
        },
      });

      console.log(`✅ Updated affiliate totals (subtracted $${(commission.commissionAmount / 100).toFixed(2)})`);

      reversedCount++;
    }

    // Log warning if any commissions were already paid
    if (alreadyPaidCount > 0) {
      console.warn(`⚠️ ${alreadyPaidCount} commission(s) were already paid out and require manual reversal`);
      console.warn(`   Please review and manually adjust affiliate payouts if needed`);
    }

    console.log(`✅ Commission reversal complete: ${reversedCount} reversed, ${alreadyPaidCount} already paid`);

    return {
      success: true,
      reversed: reversedCount,
      alreadyPaid: alreadyPaidCount,
    };
  } catch (error) {
    console.error(`❌ ERROR in reverseAffiliateCommissions:`, error);
    return {
      success: false,
      reversed: 0,
      alreadyPaid: 0,
      error: error instanceof Error ? error.message : "Unknown error occurred",
    };
  }
}
