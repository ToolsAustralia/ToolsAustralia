/**
 * User Deletion Summary Utility
 * 
 * Provides a preview of what will be deleted when a user is deleted.
 * This is a read-only operation - no actual deletion happens.
 */

import connectDB from "@/lib/mongodb";
import User from "@/models/User";
import MajorDraw from "@/models/MajorDraw";
import MiniDraw from "@/models/MiniDraw";
import AffiliateCommission from "@/models/AffiliateCommission";
import PaymentEvent from "@/models/PaymentEvent";
import Order from "@/models/Order";
import Winner from "@/models/Winner";
import ReferralEvent from "@/models/ReferralEvent";
import TicketEntry from "@/models/TicketEntry";
import mongoose from "mongoose";

/**
 * Deletion summary structure
 */
export interface DeletionSummary {
  majorDrawEntries: number;
  miniDrawEntries: number;
  affiliateCommissions: number;
  paymentEvents: number;
  orders: number;
  winners: number;
  referralEvents: {
    asReferrer: number;
    asInvitee: number;
    total: number;
  };
  ticketEntries: number;
  warnings: {
    hasActiveSubscription: boolean;
    isWinner: boolean;
    winnerDraws?: Array<{ drawName: string; drawType: "major" | "mini" }>;
  };
}

/**
 * Get detailed deletion summary for a user (preview only, no deletion)
 * 
 * @param userId - User ID to analyze
 * @returns Deletion summary with counts and warnings
 */
export async function getUserDeletionSummary(userId: string): Promise<DeletionSummary> {
  console.log(`📋 Generating deletion summary for user: ${userId}`);

  try {
    await connectDB();

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error("Invalid user ID");
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);

    // Get user to check subscription status
    const user = await User.findById(userObjectId);
    if (!user) {
      throw new Error("User not found");
    }

    // Count major draw entries
    const majorDrawsWithEntries = await MajorDraw.find({
      "entries.userId": userObjectId,
    });
    let majorDrawEntriesCount = 0;
    for (const draw of majorDrawsWithEntries) {
      const userEntry = draw.entries.find(
        (entry: { userId: mongoose.Types.ObjectId; totalEntries?: number }) =>
          entry.userId.toString() === userId
      );
      if (userEntry) {
        majorDrawEntriesCount += userEntry.totalEntries || 0;
      }
    }

    // Count mini draw entries
    const miniDrawsWithEntries = await MiniDraw.find({
      "entries.userId": userObjectId,
    });
    let miniDrawEntriesCount = 0;
    for (const draw of miniDrawsWithEntries) {
      const userEntry = draw.entries.find(
        (entry: { userId: mongoose.Types.ObjectId; totalEntries?: number }) =>
          entry.userId.toString() === userId
      );
      if (userEntry) {
        miniDrawEntriesCount += userEntry.totalEntries || 0;
      }
    }

    // Count affiliate commissions
    const affiliateCommissionsCount = await AffiliateCommission.countDocuments({
      referredUserId: userObjectId,
    });

    // Count payment events
    const paymentEventsCount = await PaymentEvent.countDocuments({
      userId: userObjectId,
    });

    // Count orders
    const ordersCount = await Order.countDocuments({
      user: userObjectId,
    });

    // Count winners and get winner details
    const winners = await Winner.find({
      userId: userObjectId,
    });

    const winnersCount = winners.length;
    const winnerDraws: Array<{ drawName: string; drawType: "major" | "mini" }> = [];

    // Get draw names for winners
    for (const winner of winners) {
      if (winner.drawType === "major") {
        const draw = await MajorDraw.findById(winner.drawId).lean();
        if (draw && "name" in draw && typeof draw.name === "string") {
          winnerDraws.push({
            drawName: draw.name,
            drawType: "major",
          });
        }
      } else {
        const draw = await MiniDraw.findById(winner.drawId).lean();
        if (draw && "name" in draw && typeof draw.name === "string") {
          winnerDraws.push({
            drawName: draw.name,
            drawType: "mini",
          });
        }
      }
    }

    // Count referral events (as referrer and as invitee)
    const referralEventsAsReferrer = await ReferralEvent.countDocuments({
      referrerId: userObjectId,
    });

    const referralEventsAsInvitee = await ReferralEvent.countDocuments({
      inviteeUserId: userObjectId,
    });

    // Count ticket entries
    const ticketEntriesCount = await TicketEntry.countDocuments({
      userId: userObjectId,
    });

    // Check for active subscription
    const hasActiveSubscription = user.subscription?.isActive === true || !!user.stripeSubscriptionId;

    // Build summary
    const summary: DeletionSummary = {
      majorDrawEntries: majorDrawEntriesCount,
      miniDrawEntries: miniDrawEntriesCount,
      affiliateCommissions: affiliateCommissionsCount,
      paymentEvents: paymentEventsCount,
      orders: ordersCount,
      winners: winnersCount,
      referralEvents: {
        asReferrer: referralEventsAsReferrer,
        asInvitee: referralEventsAsInvitee,
        total: referralEventsAsReferrer + referralEventsAsInvitee,
      },
      ticketEntries: ticketEntriesCount,
      warnings: {
        hasActiveSubscription,
        isWinner: winnersCount > 0,
        ...(winnersCount > 0 && { winnerDraws }),
      },
    };

    console.log(`✅ Deletion summary generated:`, summary);

    return summary;
  } catch (error) {
    console.error(`❌ Error generating deletion summary:`, error);
    throw error;
  }
}

