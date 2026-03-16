import mongoose from "mongoose";
import User from "@/models/User";
import type { TargetingMode } from "@/models/MonthlyEntryCampaign";

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
  };
}

export class TargetingService {
  static async resolveTargetUserIds(request: TargetingRequest): Promise<string[]> {
    switch (request.targetingMode) {
      case "manual-users":
        return this.resolveManualUsers(request.manualUserIds || []);
      case "csv-users":
        return this.resolveManualUsers(request.csvUserIds || []);
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

    const users = await User.find({ _id: { $in: objectIds }, "subscription.isActive": true, isActive: true })
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

    const query: Record<string, unknown> = {
      isActive: true,
      "subscription.isActive": true,
    };

    if (requiresEmailVerified) {
      query.isEmailVerified = true;
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
    const ids = new Set(users.map((user) => user._id.toString()));

    includeUserIds.forEach((id) => ids.add(id));
    excludeUserIds.forEach((id) => ids.delete(id));

    return Array.from(ids);
  }
}
