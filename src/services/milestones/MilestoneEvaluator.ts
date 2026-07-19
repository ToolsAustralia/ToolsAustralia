import mongoose from "mongoose";
import User from "@/models/User";
import Order from "@/models/Order";
import MilestoneIssuance from "@/models/MilestoneIssuance";

export interface UserMilestoneMetrics {
  spendAmount: number;
  entriesGained: number;
  loyaltyDays: number;
  /** Membership Streak: consecutive paid renewals (durable counter, P1). */
  streakMonths: number;
  /** Current streak generation — stamped onto streak-months issuances. */
  streakGeneration: number;
  hasActiveSubscription: boolean;
}

export class MilestoneEvaluator {
  static async evaluateUserMetrics(userId: string): Promise<UserMilestoneMetrics> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error("Invalid user ID");
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);
    const [user, spendAggregate, streakGrantAggregate] = await Promise.all([
      User.findById(userObjectId).select("accumulatedEntries subscription").lean(),
      Order.aggregate<{ totalSpend: number }>([
        {
          $match: {
            user: userObjectId,
            status: { $in: ["processing", "shipped", "delivered", "completed"] },
          },
        },
        {
          $group: {
            _id: null,
            totalSpend: { $sum: "$totalAmount" },
          },
        },
      ]),
      // Streak-granted entries are EXCLUDED from the entries-gained metric —
      // free entries must never compound into more free entries (spec §6/D6).
      MilestoneIssuance.aggregate<{ totalStreakEntries: number }>([
        {
          $match: {
            userId: userObjectId,
            milestoneType: "streak-months",
            status: "redeemed",
          },
        },
        {
          $group: {
            _id: null,
            totalStreakEntries: { $sum: "$entriesAmount" },
          },
        },
      ]),
    ]);

    const hasActiveSubscription = Boolean(user?.subscription?.isActive);
    const loyaltyDays =
      hasActiveSubscription && user?.subscription?.startDate
        ? Math.max(0, Math.floor((Date.now() - new Date(user.subscription.startDate).getTime()) / (24 * 60 * 60 * 1000)))
        : 0;

    const streakGrantedEntries = streakGrantAggregate[0]?.totalStreakEntries || 0;

    return {
      spendAmount: spendAggregate[0]?.totalSpend || 0,
      entriesGained: Math.max(0, (user?.accumulatedEntries || 0) - streakGrantedEntries),
      loyaltyDays,
      streakMonths: user?.subscription?.streakMonths ?? 0,
      streakGeneration: user?.subscription?.streakGeneration ?? 1,
      hasActiveSubscription,
    };
  }
}
