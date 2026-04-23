import mongoose from "mongoose";
import { MilestoneService } from "@/services/milestones";

export class DrawGrantService {
  static async grantMonthlyCouponEntries(userId: string, entries: number): Promise<void> {
    if (entries <= 0) return;

    const { getTargetMajorDraw } = await import("@/utils/draws/major-draw-helpers");

    let activeMajorDraw;
    try {
      activeMajorDraw = await getTargetMajorDraw();
    } catch (error) {
      console.warn("No target major draw available for coupon / milestone entry grant", {
        userId,
        entries,
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);
    const now = new Date();
    const existingEntry = activeMajorDraw.entries.find(
      (entry: { userId: { toString(): string } }) => entry.userId.toString() === userId
    );

    if (existingEntry) {
      existingEntry.totalEntries += entries;
      existingEntry.entriesBySource["bonus-entry-promo"] = (existingEntry.entriesBySource["bonus-entry-promo"] || 0) + entries;
      existingEntry.lastUpdatedDate = now;
    } else {
      activeMajorDraw.entries.push({
        userId: userObjectId,
        totalEntries: entries,
        entriesBySource: {
          membership: 0,
          "one-time-package": 0,
          upsell: 0,
          "mini-draw": 0,
          referral: 0,
          "bonus-entry-promo": entries,
        },
        firstAddedDate: now,
        lastUpdatedDate: now,
      });
    }

    await activeMajorDraw.save();

    try {
      await MilestoneService.checkAndIssueMilestones(userId);
    } catch (error) {
      console.error("Failed to evaluate milestones after entry grant:", error);
    }
  }
}
