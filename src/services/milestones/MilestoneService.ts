import mongoose from "mongoose";
import MilestoneReward, { IMilestoneReward, MilestoneType } from "@/models/MilestoneReward";
import MilestoneIssuance from "@/models/MilestoneIssuance";
import User from "@/models/User";
import { RedemptionService } from "@/services/redeemables/RedemptionService";
import { MilestoneEvaluator, UserMilestoneMetrics } from "./MilestoneEvaluator";

/**
 * Explicit metric mapping — every MilestoneType names its metric. The old
 * implicit "anything else → loyaltyDays" fallthrough was a mass-fire hazard:
 * a new type reaching an unpatched resolver would bind to the wrong metric.
 */
export function resolveMetricValue(milestoneType: MilestoneType, metrics: UserMilestoneMetrics): number {
  switch (milestoneType) {
    case "spend-amount":
      return metrics.spendAmount;
    case "entries-gained":
      return metrics.entriesGained;
    case "loyalty-days":
      return metrics.loyaltyDays;
    case "streak-months":
      return metrics.streakMonths;
  }
}

/**
 * Cycles a reward has earned at a given metric value.
 * - Non-recurring: fires once at threshold.
 * - Recurring, no recurrencePeriod (legacy spend/entries rewards): one cycle
 *   per whole multiple of the threshold — floor(metric/threshold).
 * - Recurring WITH recurrencePeriod (the Membership Streak ladder, period 12):
 *   the rung repeats every period AFTER its threshold — fires at threshold,
 *   threshold+period, threshold+2·period… so the full ladder cycles annually
 *   (streak month 14 ≡ month 2, 24 ≡ 12, owner decision 2026-07-07).
 */
export function computeCycles(
  reward: Pick<IMilestoneReward, "isRecurring" | "threshold" | "recurrencePeriod">,
  metricValue: number
): number {
  if (metricValue < reward.threshold) return 0;
  if (!reward.isRecurring) return 1;
  if (reward.recurrencePeriod && reward.recurrencePeriod > 0) {
    return Math.floor((metricValue - reward.threshold) / reward.recurrencePeriod) + 1;
  }
  return Math.max(1, Math.floor(metricValue / reward.threshold));
}

function isDuplicateKeyError(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && "code" in err && (err as { code?: number }).code === 11000);
}

export interface MilestoneRewardPerformance {
  issuedCount: number;
  redeemedCount: number;
  activeCount: number;
  expiredCount: number;
  cancelledCount: number;
  /** Pre-launch streak rungs marked achieved with zero entries (spec §3). Excluded from issuedCount. */
  backfilledCount: number;
  totalEntriesGranted: number;
  redemptionRate: number;
}

export interface MilestoneRewardWithPerformance {
  id: string;
  name: string;
  displayLabel?: string;
  milestoneType: MilestoneType;
  threshold: number;
  entriesAmount: number;
  code: string;
  isActive: boolean;
  neverExpires: boolean;
  startsAt: Date | null;
  endsAt: Date | null;
  isRecurring: boolean;
  /** Annual-cycle cadence (12 for streak rungs); null = legacy whole-multiple recurrence. */
  recurrencePeriod: number | null;
  autoGrant: boolean;
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
      backfilledCount: number;
      totalEntriesGranted: number;
    }>([
      { $match: { milestoneRewardId: { $in: rewardIds } } },
      {
        $group: {
          _id: "$milestoneRewardId",
          // Backfilled markers are recognition-without-grant — not real issuances.
          issuedCount: { $sum: { $cond: [{ $ne: ["$status", "backfilled"] }, 1, 0] } },
          redeemedCount: { $sum: { $cond: [{ $eq: ["$status", "redeemed"] }, 1, 0] } },
          activeCount: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } },
          expiredCount: { $sum: { $cond: [{ $eq: ["$status", "expired"] }, 1, 0] } },
          cancelledCount: { $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] } },
          backfilledCount: { $sum: { $cond: [{ $eq: ["$status", "backfilled"] }, 1, 0] } },
          totalEntriesGranted: {
            $sum: { $cond: [{ $eq: ["$status", "redeemed"] }, "$entriesAmount", 0] },
          },
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
            backfilledCount: row.backfilledCount || 0,
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
        backfilledCount: 0,
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
        recurrencePeriod: reward.recurrencePeriod ?? null,
        autoGrant: reward.autoGrant ?? false,
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
    milestoneType: MilestoneType;
    threshold: number;
    entriesAmount: number;
    code: string;
    isActive?: boolean;
    neverExpires?: boolean;
    startsAt?: Date;
    endsAt?: Date;
    isRecurring?: boolean;
    recurrencePeriod?: number;
    autoGrant?: boolean;
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
      recurrencePeriod: input.recurrencePeriod,
      autoGrant: input.autoGrant ?? false,
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
      milestoneType: MilestoneType;
      threshold: number;
      entriesAmount: number;
      code: string;
      isActive: boolean;
      neverExpires: boolean;
      startsAt: Date;
      endsAt: Date;
      isRecurring: boolean;
      recurrencePeriod: number;
      autoGrant: boolean;
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
      const currentMetric = resolveMetricValue(reward.milestoneType, metrics);
      const effectiveCycles = computeCycles(reward, currentMetric);
      if (effectiveCycles === 0) continue;

      // Streak rungs are scoped to the CURRENT streak generation so they are
      // re-earnable after a full lapse → resubscribe reset; other types live
      // on generation 1 forever (their metrics never reset).
      const issuanceGeneration = reward.milestoneType === "streak-months" ? metrics.streakGeneration : 1;

      for (let cycle = 1; cycle <= effectiveCycles; cycle++) {
        const existing = await MilestoneIssuance.findOne({
          milestoneRewardId: reward._id,
          userId: new mongoose.Types.ObjectId(userId),
          streakGeneration: issuanceGeneration,
          achievementCycle: cycle,
        })
          .select("_id status")
          .lean();

        if (existing) {
          // Crash-safety sweep: an ACTIVE issuance of an autoGrant reward means a
          // previous run created it but died before granting — grant it now.
          if (reward.autoGrant && existing.status === "active") {
            try {
              await RedemptionService.autoRedeemMilestoneIssuance(userId, String(existing._id));
            } catch (grantErr) {
              console.error(`Auto-grant sweep failed for issuance ${existing._id}:`, grantErr);
            }
          }
          continue;
        }

        let created;
        try {
          created = await MilestoneIssuance.create({
            milestoneRewardId: reward._id,
            userId: new mongoose.Types.ObjectId(userId),
            milestoneType: reward.milestoneType,
            thresholdReached: reward.threshold * cycle,
            achievementCycle: cycle,
            streakGeneration: issuanceGeneration,
            entriesAmount: reward.entriesAmount,
            status: "active",
            issuedAt: now,
            expiresAt: reward.neverExpires ? undefined : reward.endsAt,
          });
        } catch (createErr) {
          // Concurrent webhook/cron/grant paths race here; the unique index is
          // the guarantee — a duplicate-key loser just moves on, it must never
          // abort the remaining rungs.
          if (isDuplicateKeyError(createErr)) continue;
          throw createErr;
        }
        issuedCount++;
        issuanceIds.push(String(created._id));

        if (reward.autoGrant) {
          try {
            await RedemptionService.autoRedeemMilestoneIssuance(userId, String(created._id));
          } catch (grantErr) {
            // Issuance stays "active" — the nightly cron sweep (above) self-heals.
            console.error(`Auto-grant failed for issuance ${created._id} (will self-heal):`, grantErr);
          }
        }
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
