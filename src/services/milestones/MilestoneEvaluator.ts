import mongoose from "mongoose";
import User from "@/models/User";
import Order from "@/models/Order";

export interface UserMilestoneMetrics {
  spendAmount: number;
  entriesGained: number;
  loyaltyDays: number;
  hasActiveSubscription: boolean;
}

export class MilestoneEvaluator {
  static async evaluateUserMetrics(userId: string): Promise<UserMilestoneMetrics> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      throw new Error("Invalid user ID");
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);
    const [user, spendAggregate] = await Promise.all([
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
    ]);

    const hasActiveSubscription = Boolean(user?.subscription?.isActive);
    const loyaltyDays =
      hasActiveSubscription && user?.subscription?.startDate
        ? Math.max(0, Math.floor((Date.now() - new Date(user.subscription.startDate).getTime()) / (24 * 60 * 60 * 1000)))
        : 0;

    return {
      spendAmount: spendAggregate[0]?.totalSpend || 0,
      entriesGained: user?.accumulatedEntries || 0,
      loyaltyDays,
      hasActiveSubscription,
    };
  }
}
