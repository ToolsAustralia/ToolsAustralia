import mongoose from "mongoose";
import MilestoneReward, { IMilestoneReward } from "@/models/MilestoneReward";
import MilestoneIssuance from "@/models/MilestoneIssuance";
import User from "@/models/User";
import { RedemptionService } from "@/services/redeemables/RedemptionService";
import { MilestoneEvaluator } from "./MilestoneEvaluator";

export interface MilestoneRewardPerformance {
  issuedCount: number;
  redeemedCount: number;
  activeCount: number;
  expiredCount: number;
  cancelledCount: number;
  totalEntriesGranted: number;
  redemptionRate: number;
}

export interface MilestoneRewardWithPerformance {
  id: string;
  name: string;
  displayLabel?: string;
  milestoneType: "spend-amount" | "entries-gained" | "loyalty-days";
  threshold: number;
  entriesAmount: number;
  code: string;
  isActive: boolean;
  neverExpires: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  isRecurring: boolean;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  performance: MilestoneRewardPerformance;
}

export class MilestoneService {
  static async listRewards(): Promise<IMilestoneReward[]> {
    return MilestoneReward.find({}).sort({ createdAt: -1 });
  }

  /**
   * Aggregate per-reward issuance performance (issued/redeemed/active/expired/cancelled
   * counts + total entries granted) keyed by reward id. Shared between the admin GET
   * route and the Norm read endpoint so the numbers match by construction.
   */
  static async aggregatePerformanceByRewardIds(
    rewardIds: mongoose.Types.ObjectId[],
  ): Promise<Map<string, MilestoneRewardPerformance>> {
    if (rewardIds.length === 0) return new Map();
    const performanceRows = await MilestoneIssuance.aggregate<{
      _id: mongoose.Types.ObjectId;
      issuedCount: number;
      redeemedCount: number;
      activeCount: number;
      expiredCount: number;
      cancelledCount: number;
      totalEntriesGranted: number;
    }>([
      { $match: { milestoneRewardId: { $in: rewardIds } } },
      {
        $group: {
          _id: "$milestoneRewardId",
          issuedCount: { $sum: 1 },
          redeemedCount: { $sum: { $cond: [{ $eq: ["$status", "redeemed"] }, 1, 0] } },
          activeCount: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } },
          expiredCount: { $sum: { $cond: [{ $eq: ["$status", "expired"] }, 1, 0] } },
          cancelledCount: { $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] } },
          totalEntriesGranted: { $sum: "$entriesAmount" },
        },
      },
    ]);
    return new Map(
      performanceRows.map((row) => {
        const issuedCount = row.issuedCount || 0;
        const redeemedCount = row.redeemedCount || 0;
        return [
          String(row._id),
          {
            issuedCount,
            redeemedCount,
            activeCount: row.activeCount || 0,
            expiredCount: row.expiredCount || 0,
            cancelledCount: row.cancelledCount || 0,
            totalEntriesGranted: row.totalEntriesGranted || 0,
            redemptionRate: issuedCount > 0 ? Math.round((redeemedCount / issuedCount) * 100) : 0,
          },
        ];
      }),
    );
  }

  /**
   * List rewards joined with per-reward issuance performance aggregates,
   * projected into the shared Norm shape (createdBy collapsed to id string,
   * dates left as Date objects for the caller to serialise).
   */
  static async listRewardsWithPerformance(): Promise<MilestoneRewardWithPerformance[]> {
    const rewards = await MilestoneService.listRewards();
    const rewardIds = rewards.map((reward) => reward._id as mongoose.Types.ObjectId);
    const performanceMap = await MilestoneService.aggregatePerformanceByRewardIds(rewardIds);

    return rewards.map((reward) => {
      const performance = performanceMap.get(String(reward._id)) ?? {
        issuedCount: 0,
        redeemedCount: 0,
        activeCount: 0,
        expiredCount: 0,
        cancelledCount: 0,
        totalEntriesGranted: 0,
        redemptionRate: 0,
      };
      return {
        id: String(reward._id),
        name: reward.name,
        displayLabel: reward.displayLabel,
        milestoneType: reward.milestoneType,
        threshold: reward.threshold,
        entriesAmount: reward.entriesAmount,
        code: reward.code,
        isActive: reward.isActive,
        neverExpires: reward.neverExpires,
        startsAt: reward.startsAt ?? null,
        endsAt: reward.endsAt ?? null,
        isRecurring: reward.isRecurring,
        createdBy: reward.createdBy ? String(reward.createdBy) : null,
        createdAt: reward.createdAt,
        updatedAt: reward.updatedAt,
        performance,
      };
    });
  }

  static async createReward(input: {
    name: string;
    displayLabel?: string;
    milestoneType: "spend-amount" | "entries-gained" | "loyalty-days";
    threshold: number;
    entriesAmount: number;
    code: string;
    isActive?: boolean;
    neverExpires?: boolean;
    startsAt?: Date;
    endsAt?: Date;
    isRecurring?: boolean;
    createdBy?: string;
  }): Promise<IMilestoneReward> {
    const normalizedCode = input.code.trim().toUpperCase();
    const existingCode = await MilestoneReward.findOne({ code: normalizedCode }).select("_id").lean();
    if (existingCode) {
      throw new Error("Milestone reward code already exists");
    }

    return MilestoneReward.create({
      ...input,
      code: normalizedCode,
      displayLabel: input.displayLabel?.trim() || undefined,
      isActive: input.isActive ?? true,
      neverExpires: input.neverExpires ?? false,
      startsAt: input.startsAt,
      endsAt: input.neverExpires ? undefined : input.endsAt,
      isRecurring: input.isRecurring ?? false,
      createdBy:
        input.createdBy && mongoose.Types.ObjectId.isValid(input.createdBy)
          ? new mongoose.Types.ObjectId(input.createdBy)
          : undefined,
    });
  }

  static async updateReward(
    rewardId: string,
    updates: Partial<{
      name: string;
      displayLabel: string;
      milestoneType: "spend-amount" | "entries-gained" | "loyalty-days";
      threshold: number;
      entriesAmount: number;
      code: string;
      isActive: boolean;
      neverExpires: boolean;
      startsAt: Date;
      endsAt: Date;
      isRecurring: boolean;
    }>
  ): Promise<IMilestoneReward | null> {
    if (!mongoose.Types.ObjectId.isValid(rewardId)) {
      throw new Error("Invalid reward ID");
    }

    const normalizedUpdates = { ...updates };
    if (updates.code) {
      const normalizedCode = updates.code.trim().toUpperCase();
      const existingCode = await MilestoneReward.findOne({
        code: normalizedCode,
        _id: { $ne: new mongoose.Types.ObjectId(rewardId) },
      })
        .select("_id")
        .lean();
      if (existingCode) {
        throw new Error("Milestone reward code already exists");
      }
      normalizedUpdates.code = normalizedCode;
    }

    if (updates.neverExpires === true) {
      normalizedUpdates.endsAt = undefined;
    }

    return MilestoneReward.findByIdAndUpdate(rewardId, { $set: normalizedUpdates }, { new: true, runValidators: true });
  }

  static async deleteReward(rewardId: string): Promise<void> {
    if (!mongoose.Types.ObjectId.isValid(rewardId)) {
      throw new Error("Invalid reward ID");
    }
    await MilestoneReward.findByIdAndDelete(rewardId);
  }

  static async toggleRewardActive(rewardId: string, isActive: boolean): Promise<IMilestoneReward | null> {
    if (!mongoose.Types.ObjectId.isValid(rewardId)) {
      throw new Error("Invalid reward ID");
    }
    return MilestoneReward.findByIdAndUpdate(rewardId, { $set: { isActive } }, { new: true, runValidators: true });
  }

  static async getActiveRewards(now = new Date()): Promise<IMilestoneReward[]> {
    return MilestoneReward.find({
      isActive: true,
      $or: [{ startsAt: { $exists: false } }, { startsAt: null }, { startsAt: { $lte: now } }],
      $and: [{ $or: [{ neverExpires: true }, { endsAt: { $gte: now } }, { endsAt: { $exists: false } }] }],
    }).sort({ threshold: 1, createdAt: -1 });
  }

  static async checkAndIssueMilestones(userId: string): Promise<{ issuedCount: number; issuanceIds: string[] }> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return { issuedCount: 0, issuanceIds: [] };
    }

    const now = new Date();
    const [activeRewards, metrics] = await Promise.all([
      MilestoneService.getActiveRewards(now),
      MilestoneEvaluator.evaluateUserMetrics(userId),
    ]);

    let issuedCount = 0;
    const issuanceIds: string[] = [];
    for (const reward of activeRewards) {
      const currentMetric = (() => {
        if (reward.milestoneType === "spend-amount") return metrics.spendAmount;
        if (reward.milestoneType === "entries-gained") return metrics.entriesGained;
        return metrics.loyaltyDays;
      })();

      if (currentMetric < reward.threshold) {
        continue;
      }

      const maxCycles = reward.isRecurring ? Math.floor(currentMetric / reward.threshold) : 1;
      const effectiveCycles = Math.max(1, maxCycles);
      for (let cycle = 1; cycle <= effectiveCycles; cycle++) {
        const existing = await MilestoneIssuance.findOne({
          milestoneRewardId: reward._id,
          userId: new mongoose.Types.ObjectId(userId),
          achievementCycle: cycle,
        })
          .select("_id")
          .lean();
        if (existing) continue;

        const created = await MilestoneIssuance.create({
          milestoneRewardId: reward._id,
          userId: new mongoose.Types.ObjectId(userId),
          milestoneType: reward.milestoneType,
          thresholdReached: reward.threshold * cycle,
          achievementCycle: cycle,
          entriesAmount: reward.entriesAmount,
          status: "active",
          issuedAt: now,
          expiresAt: reward.neverExpires ? undefined : reward.endsAt,
        });
        issuedCount++;
        issuanceIds.push(String(created._id));
      }
    }

    return { issuedCount, issuanceIds };
  }

  /**
   * Revoke milestone issuances issued because of a refunded payment (audit trail — status revoked).
   * If an issuance was redeemed, un-redeems entries first via RedemptionService.unredeemMilestoneRedemption.
   */
  static async revokeIssuancesFromPaymentEvent(
    userId: string,
    milestoneIssuanceIds: string[]
  ): Promise<{ revoked: string[]; errors: string[] }> {
    const revoked: string[] = [];
    const errors: string[] = [];

    for (const id of milestoneIssuanceIds) {
      if (!mongoose.Types.ObjectId.isValid(id)) continue;
      try {
        const doc = await MilestoneIssuance.findOne({
          _id: new mongoose.Types.ObjectId(id),
          userId: new mongoose.Types.ObjectId(userId),
        });
        if (!doc) {
          errors.push(`issuance ${id} not found`);
          continue;
        }
        if (doc.status === "redeemed") {
          const ur = await RedemptionService.unredeemMilestoneRedemption({
            userId,
            milestoneIssuanceId: id,
          });
          if (!ur.success) {
            errors.push(`unredeem milestone ${id}: ${ur.error || "unknown"}`);
            continue;
          }
        }
        await MilestoneIssuance.updateOne(
          { _id: doc._id },
          {
            $set: {
              status: "revoked",
              revokedAt: new Date(),
              revocationReason: "refund",
            },
            $unset: { redeemedAt: 1 },
          }
        );
        revoked.push(id);
      } catch (e) {
        errors.push(`revoke ${id}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return { revoked, errors };
  }

  static async evaluateAllUsersAndIssueMilestones(): Promise<{ issuedCount: number; evaluatedUsers: number }> {
    const users = await User.find({ isActive: true }).select("_id").lean();
    let issuedCount = 0;
    for (const user of users) {
      const result = await MilestoneService.checkAndIssueMilestones(String(user._id));
      issuedCount += result.issuedCount;
    }
    return { issuedCount, evaluatedUsers: users.length };
  }
}
