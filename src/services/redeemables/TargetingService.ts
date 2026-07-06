import mongoose from "mongoose";
import User from "@/models/User";
import type { TargetingMode } from "@/models/MonthlyEntryCampaign";
import { loadTopMajorDrawPercentileUserIds } from "@/utils/redeemables/topMajorDrawPercentile";

export interface TargetingRequest {
  targetingMode: TargetingMode;
  manualUserIds?: string[];
  csvUserIds?: string[];
  segmentConfig?: {
    minInactiveDays?: number;
    maxInactiveDays?: number;
    requiresEmailVerified?: boolean;
    requiresRecentPurchaseDays?: number;
    includeUserIds?: string[];
    excludeUserIds?: string[];
    states?: string[];
    membershipTiers?: string[];
    topEntriesPercent?: number;
  };
}

export class TargetingService {
  static async resolveTargetUserIds(request: TargetingRequest): Promise<string[]> {
    switch (request.targetingMode) {
      case "manual-users": {
        const ids =
          request.manualUserIds && request.manualUserIds.length > 0
            ? request.manualUserIds
            : request.segmentConfig?.includeUserIds || [];
        return this.resolveManualUsers(ids);
      }
      case "csv-users": {
        const ids =
          request.csvUserIds && request.csvUserIds.length > 0
            ? request.csvUserIds
            : request.segmentConfig?.includeUserIds || [];
        return this.resolveManualUsers(ids);
      }
      case "dynamic-segment":
        return this.resolveDynamicSegment(request.segmentConfig);
      case "all-active-subscribers":
      default:
        return this.resolveAllActiveSubscribers();
    }
  }

  private static async resolveManualUsers(userIds: string[]): Promise<string[]> {
    const objectIds = userIds.filter((id) => mongoose.Types.ObjectId.isValid(id)).map((id) => new mongoose.Types.ObjectId(id));
    if (!objectIds.length) return [];

    // Pins are AUTHORITATIVE — no subscription requirement. The admin picker explicitly offers
    // inactive/any subscription filters, so a pinned non-subscriber must still receive the coupon
    // (previously `"subscription.isActive": true` here silently dropped them, contradicting the
    // dynamic-segment pin semantics and the lazy isUserEligibleForCampaign path). Deactivated
    // accounts (isActive false) stay excluded.
    const users = await User.find({ _id: { $in: objectIds }, isActive: true })
      .select("_id")
      .lean();

    return users.map((user) => user._id.toString());
  }

  private static async resolveAllActiveSubscribers(): Promise<string[]> {
    const users = await User.find({
      isActive: true,
      "subscription.isActive": true,
    })
      .select("_id")
      .lean();

    return users.map((user) => user._id.toString());
  }

  private static async resolveDynamicSegment(
    segmentConfig?: TargetingRequest["segmentConfig"]
  ): Promise<string[]> {
    const now = Date.now();
    const requiresEmailVerified = segmentConfig?.requiresEmailVerified ?? true;
    const minInactiveDays = segmentConfig?.minInactiveDays;
    const maxInactiveDays = segmentConfig?.maxInactiveDays;
    const includeUserIds = new Set((segmentConfig?.includeUserIds || []).filter((id) => mongoose.Types.ObjectId.isValid(id)));
    const excludeUserIds = new Set((segmentConfig?.excludeUserIds || []).filter((id) => mongoose.Types.ObjectId.isValid(id)));
    const states = (segmentConfig?.states || []).map((s) => s.trim().toUpperCase()).filter(Boolean);
    const membershipTiers = (segmentConfig?.membershipTiers || []).filter(Boolean);
    const topEntriesPercent = segmentConfig?.topEntriesPercent;

    const query: Record<string, unknown> = {
      isActive: true,
      "subscription.isActive": true,
    };

    if (requiresEmailVerified) {
      query.isEmailVerified = true;
    }

    if (states.length > 0) {
      query.state = { $in: states };
    }

    if (membershipTiers.length > 0) {
      query["subscription.packageId"] = { $in: membershipTiers };
    }

    if (typeof minInactiveDays === "number" || typeof maxInactiveDays === "number") {
      query.lastLogin = {};
      if (typeof minInactiveDays === "number") {
        (query.lastLogin as Record<string, unknown>).$lte = new Date(now - minInactiveDays * 24 * 60 * 60 * 1000);
      }
      if (typeof maxInactiveDays === "number") {
        (query.lastLogin as Record<string, unknown>).$gte = new Date(now - maxInactiveDays * 24 * 60 * 60 * 1000);
      }
    }

    const users = await User.find(query).select("_id").lean();
    let ids = new Set(users.map((user) => user._id.toString()));

    if (typeof topEntriesPercent === "number") {
      const topIds = await loadTopMajorDrawPercentileUserIds(topEntriesPercent);
      const topSet = new Set(topIds);
      ids = new Set([...ids].filter((id) => topSet.has(id)));
    }

    includeUserIds.forEach((id) => ids.add(id));
    excludeUserIds.forEach((id) => ids.delete(id));

    return Array.from(ids);
  }
}
