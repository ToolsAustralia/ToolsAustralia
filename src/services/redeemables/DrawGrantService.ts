import mongoose from "mongoose";
import { MilestoneService } from "@/services/milestones";

/** Draw buckets this service may grant into. "streak" = Membership Streak auto-grants. */
export type DrawGrantSourceKey = "bonus-entry-promo" | "streak";

export class DrawGrantService {
  /**
   * @returns true when the entries actually landed in a draw; false when no
   * target draw was available (e.g. a freeze window with no queued draw).
   * Callers that grant a PAID entitlement (the streak auto-grant) must treat
   * false/throw as "not delivered" and compensate — a persistence error on the
   * hot draw document (e.g. VersionError) still throws.
   */
  static async grantMonthlyCouponEntries(
    userId: string,
    entries: number,
    sourceKey: DrawGrantSourceKey = "bonus-entry-promo",
    opts: { skipMilestoneCheck?: boolean } = {}
  ): Promise<boolean> {
    if (entries <= 0) return false;

    const { getTargetMajorDraw } = await import("@/utils/draws/major-draw-helpers");

    let activeMajorDraw;
    try {
      activeMajorDraw = await getTargetMajorDraw();
    } catch (error) {
      console.warn("No target major draw available for coupon / milestone / streak entry grant", {
        userId,
        entries,
        sourceKey,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);
    const now = new Date();
    const existingEntry = activeMajorDraw.entries.find(
      (entry: { userId: { toString(): string } }) => entry.userId.toString() === userId
    );

    if (existingEntry) {
      existingEntry.totalEntries += entries;
      existingEntry.entriesBySource[sourceKey] = (existingEntry.entriesBySource[sourceKey] || 0) + entries;
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
          "bonus-entry-promo": 0,
          "cancellation-upsell": 0,
          streak: 0,
          // This service never grants shop entries (see DrawGrantSourceKey above),
          // but the fresh row must still carry every bucket or the first reader
          // of a brand-new row hits a missing key.
          shop: 0,
          [sourceKey]: entries,
        },
        firstAddedDate: now,
        lastUpdatedDate: now,
      });
    }

    await activeMajorDraw.save();

    // The streak auto-grant path passes skipMilestoneCheck to prevent re-entrancy
    // (grant → check → grant …). Streak entries are also excluded from the
    // entries-gained metric, so nothing is lost by skipping here.
    if (!opts.skipMilestoneCheck) {
      try {
        await MilestoneService.checkAndIssueMilestones(userId);
      } catch (error) {
        console.error("Failed to evaluate milestones after entry grant:", error);
      }
    }

    return true;
  }
}
