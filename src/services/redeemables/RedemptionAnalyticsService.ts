import mongoose from "mongoose";
import RedeemableIssuance from "@/models/RedeemableIssuance";
import User from "@/models/User";

export interface CampaignRedemptionRecord {
  issuanceId: string;
  userId: string;
  userName: string;
  userEmail: string;
  redeemedAt: Date;
  code?: string;
  entriesAmount: number;
}

export interface CampaignRedemptionResponse {
  items: CampaignRedemptionRecord[];
  total: number;
  page: number;
  totalPages: number;
}

export class RedemptionAnalyticsService {
  static async getCampaignRedemptions(
    campaignId: string,
    options?: {
      page?: number;
      limit?: number;
    }
  ): Promise<CampaignRedemptionResponse> {
    if (!mongoose.Types.ObjectId.isValid(campaignId)) {
      throw new Error("Invalid campaign ID");
    }

    const page = Math.max(1, options?.page ?? 1);
    const limit = Math.min(100, Math.max(1, options?.limit ?? 20));
    const campaignObjectId = new mongoose.Types.ObjectId(campaignId);

    const baseQuery = {
      campaignId: campaignObjectId,
      status: "redeemed",
      redeemedAt: { $exists: true },
    };

    const [total, redemptions] = await Promise.all([
      RedeemableIssuance.countDocuments(baseQuery),
      RedeemableIssuance.find(baseQuery)
        .sort({ redeemedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .select("_id userId code entriesAmount redeemedAt")
        .lean(),
    ]);

    const userIds = redemptions.map((item) => item.userId);
    const users = await User.find({ _id: { $in: userIds } }).select("_id firstName lastName email").lean();
    const userMap = new Map(users.map((u) => [u._id.toString(), u]));

    return {
      items: redemptions.map((redemption) => {
        const user = userMap.get(redemption.userId.toString());
        return {
          issuanceId: redemption._id.toString(),
          userId: redemption.userId.toString(),
          userName: user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || "Unknown User" : "Unknown User",
          userEmail: user?.email || "Unknown Email",
          redeemedAt: redemption.redeemedAt as Date,
          code: redemption.code,
          entriesAmount: redemption.entriesAmount,
        };
      }),
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    };
  }
}
