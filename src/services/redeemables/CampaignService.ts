import mongoose from "mongoose";
import MonthlyEntryCampaign, { CampaignMode, IMonthlyEntryCampaign, TargetingMode, PurchaseRequirement } from "@/models/MonthlyEntryCampaign";
import RedeemableIssuance from "@/models/RedeemableIssuance";
import SegmentSnapshot from "@/models/SegmentSnapshot";
import User from "@/models/User";
import { loadTopMajorDrawPercentileUserIds } from "@/utils/redeemables/topMajorDrawPercentile";

const NEVER_EXPIRES_ISSUANCE_DATE = new Date("9999-12-31T23:59:59.999Z");

export function getMonthKey(date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function generateUniqueCode(monthKey: string): string {
  const token = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `TA-${monthKey.replace("-", "")}-${token}`;
}

export class CampaignService {
  private static hasValidatedMonthKeyIndex = false;

  static async ensureLegacyMonthKeyIndexDropped(): Promise<void> {
    if (CampaignService.hasValidatedMonthKeyIndex) return;
    try {
      const indexes = await MonthlyEntryCampaign.collection.indexes();
      const monthKeyUniqueIndex = indexes.find(
        (index) =>
          index.name === "monthKey_1" &&
          index.key &&
          (index.key as Record<string, number>).monthKey === 1 &&
          index.unique === true
      );
      if (monthKeyUniqueIndex) {
        await MonthlyEntryCampaign.collection.dropIndex("monthKey_1");
      }
      CampaignService.hasValidatedMonthKeyIndex = true;
    } catch (error) {
      console.warn("Failed to validate/drop legacy monthKey index:", error);
    }
  }

  static async createCampaign(input: {
    monthKey: string;
    name: string;
    displayLabel?: string;
    entriesAmount: number;
    campaignMode: CampaignMode;
    targetingMode: TargetingMode;
    startsAt: Date;
    endsAt?: Date;
    neverExpires?: boolean;
    code: string;
    requiresPurchase?: boolean;
    purchaseRequirement?: PurchaseRequirement;
    segmentConfig?: IMonthlyEntryCampaign["segmentConfig"];
    isActive?: boolean;
    createdBy?: string;
  }): Promise<IMonthlyEntryCampaign> {
    await CampaignService.ensureLegacyMonthKeyIndexDropped();
    const normalizedCode = input.code.trim().toUpperCase();
    const existingCode = await MonthlyEntryCampaign.findOne({ code: normalizedCode }).select("_id").lean();
    if (existingCode) {
      throw new Error("Campaign code already exists. Please choose a unique code.");
    }

    const createData = {
      ...input,
      code: normalizedCode,
      displayLabel: input.displayLabel?.trim() || undefined,
      createdBy: input.createdBy && mongoose.Types.ObjectId.isValid(input.createdBy)
        ? new mongoose.Types.ObjectId(input.createdBy)
        : undefined,
      isActive: input.isActive ?? true,
      requiresPurchase: input.requiresPurchase ?? false,
      purchaseRequirement: input.purchaseRequirement ?? "none",
      neverExpires: input.neverExpires ?? false,
      endsAt: input.neverExpires ? undefined : input.endsAt,
    };

    return MonthlyEntryCampaign.create(createData);
  }

  static async updateCampaign(
    campaignId: string,
    updates: Partial<{
      monthKey: string;
      name: string;
      displayLabel: string;
      entriesAmount: number;
      campaignMode: CampaignMode;
      targetingMode: TargetingMode;
      startsAt: Date;
      endsAt: Date;
      neverExpires: boolean;
      code: string;
      requiresPurchase: boolean;
      purchaseRequirement: PurchaseRequirement;
      segmentConfig: IMonthlyEntryCampaign["segmentConfig"];
      isActive: boolean;
    }>
  ): Promise<IMonthlyEntryCampaign | null> {
    await CampaignService.ensureLegacyMonthKeyIndexDropped();
    if (!mongoose.Types.ObjectId.isValid(campaignId)) {
      throw new Error("Invalid campaign ID");
    }

    const normalizedUpdates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) normalizedUpdates[key] = value;
    }
    if (updates.code) {
      const normalizedCode = updates.code.trim().toUpperCase();
      const existingCode = await MonthlyEntryCampaign.findOne({
        code: normalizedCode,
        _id: { $ne: new mongoose.Types.ObjectId(campaignId) },
      })
        .select("_id")
        .lean();
      if (existingCode) {
        throw new Error("Coupon code already exists. Please choose a unique code.");
      }
      normalizedUpdates.code = normalizedCode;
    }

    if (typeof updates.displayLabel === "string") {
      const trimmed = updates.displayLabel.trim() || undefined;
      if (trimmed !== undefined) normalizedUpdates.displayLabel = trimmed;
      else delete normalizedUpdates.displayLabel;
    }

    // Guard the MERGED state (PUT is partial): manual-users / csv-users target exactly the pinned
    // users, so the effective pin list must be non-empty — otherwise a mode switch (or a pin wipe)
    // strands a campaign that the issuance paths treat as "nobody" (and historically the lazy path
    // wrongly widened to ALL active subscribers). The create route enforces the same via zod.
    if (updates.targetingMode !== undefined || updates.segmentConfig !== undefined) {
      const existing = await MonthlyEntryCampaign.findById(campaignId)
        .select("targetingMode segmentConfig")
        .lean();
      const effectiveMode = updates.targetingMode ?? existing?.targetingMode;
      const effectiveInclude =
        updates.segmentConfig !== undefined
          ? updates.segmentConfig?.includeUserIds
          : existing?.segmentConfig?.includeUserIds;
      if (
        (effectiveMode === "manual-users" || effectiveMode === "csv-users") &&
        !(effectiveInclude && effectiveInclude.length > 0)
      ) {
        throw new Error(
          `targetingMode "${effectiveMode}" requires at least one user in segmentConfig.includeUserIds`
        );
      }
    }

    const updateOperation: { $set: Record<string, unknown> } = { $set: normalizedUpdates };

    // When neverExpires is true, set endsAt to far-future instead of unsetting.
    // $unset triggers Mongoose validation before neverExpires is applied, causing "endsAt is required".
    if (updates.neverExpires === true) {
      normalizedUpdates.endsAt = NEVER_EXPIRES_ISSUANCE_DATE;
    }

    return MonthlyEntryCampaign.findByIdAndUpdate(campaignId, updateOperation, {
      new: true,
      runValidators: true,
    });
  }

  static async listCampaigns(filters?: { monthKey?: string; isActive?: boolean }): Promise<IMonthlyEntryCampaign[]> {
    await CampaignService.ensureLegacyMonthKeyIndexDropped();
    const query: { monthKey?: string; isActive?: boolean } = {};
    if (filters?.monthKey) {
      query.monthKey = filters.monthKey;
    }
    if (typeof filters?.isActive === "boolean") {
      query.isActive = filters.isActive;
    }

    return MonthlyEntryCampaign.find(query).sort({ startsAt: -1, createdAt: -1 });
  }

  static async getActiveCampaign(date = new Date()): Promise<IMonthlyEntryCampaign | null> {
    await CampaignService.ensureLegacyMonthKeyIndexDropped();
    return MonthlyEntryCampaign.findOne({
      isActive: true,
      startsAt: { $lte: date },
      $or: [{ neverExpires: true }, { endsAt: { $gte: date } }],
    }).sort({ startsAt: -1 });
  }

  static async getActiveCampaigns(date = new Date()): Promise<IMonthlyEntryCampaign[]> {
    await CampaignService.ensureLegacyMonthKeyIndexDropped();
    return MonthlyEntryCampaign.find({
      isActive: true,
      startsAt: { $lte: date },
      $or: [{ neverExpires: true }, { endsAt: { $gte: date } }],
    }).sort({ startsAt: -1 });
  }

  static async deleteCampaign(campaignId: string): Promise<{ deleted: boolean; softDeleted: boolean }> {
    if (!mongoose.Types.ObjectId.isValid(campaignId)) {
      throw new Error("Invalid campaign ID");
    }

    const campaignObjectId = new mongoose.Types.ObjectId(campaignId);
    const issuanceCount = await RedeemableIssuance.countDocuments({ campaignId: campaignObjectId });
    if (issuanceCount > 0) {
      await MonthlyEntryCampaign.findByIdAndUpdate(campaignObjectId, { $set: { isActive: false } }, { new: true });
      return { deleted: false, softDeleted: true };
    }

    await MonthlyEntryCampaign.findByIdAndDelete(campaignObjectId);
    return { deleted: true, softDeleted: false };
  }

  static async toggleCampaignActive(campaignId: string, isActive: boolean): Promise<IMonthlyEntryCampaign | null> {
    if (!mongoose.Types.ObjectId.isValid(campaignId)) {
      throw new Error("Invalid campaign ID");
    }
    return MonthlyEntryCampaign.findByIdAndUpdate(campaignId, { $set: { isActive } }, { new: true, runValidators: true });
  }

  static async issueCampaignToUsers(params: {
    campaign: IMonthlyEntryCampaign;
    userIds: string[];
    issuedBy?: string;
    metadata?: { uploadedFileName?: string; notes?: string };
  }): Promise<{ issuedCount: number; skippedCount: number }> {
    let issuedCount = 0;
    let skippedCount = 0;

    for (const userId of params.userIds) {
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        skippedCount++;
        continue;
      }

      const code =
        params.campaign.campaignMode === "unique" || params.campaign.campaignMode === "both"
          ? generateUniqueCode(params.campaign.monthKey)
          : undefined;

      try {
        await RedeemableIssuance.findOneAndUpdate(
          {
            campaignId: params.campaign._id,
            userId: new mongoose.Types.ObjectId(userId),
          },
          {
            $setOnInsert: {
              campaignId: params.campaign._id,
              userId: new mongoose.Types.ObjectId(userId),
              monthKey: params.campaign.monthKey,
              code,
              status: "active",
              source: "monthly-coupon",
              entriesAmount: params.campaign.entriesAmount,
              issuedAt: new Date(),
              expiresAt: params.campaign.neverExpires ? NEVER_EXPIRES_ISSUANCE_DATE : params.campaign.endsAt,
              metadata: {
                targetingMode: params.campaign.targetingMode,
                issuedBy: params.issuedBy,
              },
            },
          },
          {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true,
          }
        );
        issuedCount++;
      } catch {
        skippedCount++;
      }
    }

    await SegmentSnapshot.create({
      campaignId: params.campaign._id,
      monthKey: params.campaign.monthKey,
      targetingMode: params.campaign.targetingMode,
      totalCandidates: params.userIds.length,
      totalEligible: params.userIds.length - skippedCount,
      totalIssued: issuedCount,
      includedUserIds: params.userIds
        .filter((id) => mongoose.Types.ObjectId.isValid(id))
        .map((id) => new mongoose.Types.ObjectId(id)),
      excludedUserIds: [],
      metadata: {
        uploadedFileName: params.metadata?.uploadedFileName,
        issuedBy: params.issuedBy,
        notes: params.metadata?.notes,
      },
    });

    return { issuedCount, skippedCount };
  }

  private static isCampaignLive(campaign: IMonthlyEntryCampaign, now: Date): boolean {
    if (!campaign.isActive) return false;
    if (campaign.startsAt > now) return false;
    if (campaign.neverExpires) return true;
    return Boolean(campaign.endsAt && campaign.endsAt >= now);
  }

  private static async isUserEligibleForCampaign(
    user: {
      _id: string | mongoose.Types.ObjectId;
      isActive?: boolean;
      isEmailVerified?: boolean;
      lastLogin?: Date;
      state?: string;
      subscription?: { isActive?: boolean; packageId?: string | null };
    },
    campaign: IMonthlyEntryCampaign,
    now: Date
  ): Promise<boolean> {
    const userId = String(user._id);
    const hasActiveSubscription = Boolean(user.subscription?.isActive);
    const isActiveUser = user.isActive !== false;

    if (!isActiveUser) return false;
    if (!CampaignService.isCampaignLive(campaign, now)) return false;

    if (campaign.targetingMode === "manual-users" || campaign.targetingMode === "csv-users") {
      // Pins are AUTHORITATIVE: the admin explicitly picked these users (the picker even offers
      // inactive-subscription filters), so membership status must not silently drop them — matching
      // dynamic-segment pin semantics (and TargetingService.resolveManualUsers). And an EMPTY pin
      // list targets NOBODY: the old `return hasActiveSubscription` fallback lazily issued a
      // "manual users" campaign to the ENTIRE active-subscriber base (the cron, correctly, issued
      // to no one — the two paths contradicted). Zod now also rejects empty pins at create/update.
      const include = (campaign.segmentConfig?.includeUserIds || []).map(String);
      return include.includes(userId);
    }

    if (campaign.targetingMode === "all-active-subscribers") {
      return hasActiveSubscription;
    }

    const config = campaign.segmentConfig;
    const includeUserIds = new Set((config?.includeUserIds || []).map(String));
    const excludeUserIds = new Set((config?.excludeUserIds || []).map(String));

    if (excludeUserIds.has(userId)) return false;
    if (includeUserIds.has(userId)) return true;

    if (!hasActiveSubscription) return false;

    const requiresEmailVerified = config?.requiresEmailVerified ?? true;
    if (requiresEmailVerified && !user.isEmailVerified) return false;

    const states = (config?.states || []).map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (states.length > 0) {
      const userState = (user.state || "").trim().toUpperCase();
      if (!userState || !states.includes(userState)) return false;
    }

    const membershipTiers = config?.membershipTiers || [];
    if (membershipTiers.length > 0) {
      const pkg = user.subscription?.packageId;
      if (!pkg || !membershipTiers.includes(pkg)) return false;
    }

    if (typeof config?.topEntriesPercent === "number") {
      const topIds = await loadTopMajorDrawPercentileUserIds(config.topEntriesPercent);
      const topSet = new Set(topIds);
      if (!topSet.has(userId)) return false;
    }

    const minInactiveDays = config?.minInactiveDays;
    const maxInactiveDays = config?.maxInactiveDays;
    if (typeof minInactiveDays === "number" || typeof maxInactiveDays === "number") {
      if (!user.lastLogin) return false;
      if (typeof minInactiveDays === "number") {
        const minInactiveThreshold = new Date(now.getTime() - minInactiveDays * 24 * 60 * 60 * 1000);
        if (user.lastLogin > minInactiveThreshold) return false;
      }
      if (typeof maxInactiveDays === "number") {
        const maxInactiveThreshold = new Date(now.getTime() - maxInactiveDays * 24 * 60 * 60 * 1000);
        if (user.lastLogin < maxInactiveThreshold) return false;
      }
    }

    return true;
  }

  private static async createIssuanceForUser(
    userId: mongoose.Types.ObjectId,
    campaign: IMonthlyEntryCampaign,
    now: Date
  ): Promise<boolean> {
    const existingIssuance = await RedeemableIssuance.findOne({
      campaignId: campaign._id,
      userId,
    })
      .select("_id")
      .lean();
    if (existingIssuance) return false;

    const expiresAt = campaign.neverExpires ? NEVER_EXPIRES_ISSUANCE_DATE : campaign.endsAt;
    if (!expiresAt) return false;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const uniqueCode =
        campaign.campaignMode === "unique" || campaign.campaignMode === "both"
          ? generateUniqueCode(campaign.monthKey)
          : undefined;

      try {
        await RedeemableIssuance.create({
          campaignId: campaign._id,
          userId,
          monthKey: campaign.monthKey,
          code: uniqueCode,
          status: "active",
          source: "monthly-coupon",
          entriesAmount: campaign.entriesAmount,
          issuedAt: now,
          expiresAt,
          metadata: {
            targetingMode: campaign.targetingMode,
            issuedBy: "auto",
          },
        });
        return true;
      } catch (error) {
        const duplicateKeyError =
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          (error as { code?: number }).code === 11000;
        if (!duplicateKeyError || attempt === 2) {
          throw error;
        }
      }
    }

    return false;
  }

  static async ensureActiveCampaignIssuancesForUser(userId: string): Promise<{ issuedCount: number }> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return { issuedCount: 0 };
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);
    const user = await User.findById(userObjectId)
      .select("_id isActive isEmailVerified lastLogin state subscription.isActive subscription.packageId")
      .lean();
    if (!user) return { issuedCount: 0 };

    const now = new Date();
    const activeCampaigns = await MonthlyEntryCampaign.find({
      isActive: true,
      startsAt: { $lte: now },
      $or: [{ neverExpires: true }, { endsAt: { $gte: now } }],
    }).sort({ startsAt: -1 });

    let issuedCount = 0;
    for (const campaign of activeCampaigns) {
      if (!(await CampaignService.isUserEligibleForCampaign(user, campaign, now))) {
        continue;
      }
      const created = await CampaignService.createIssuanceForUser(userObjectId, campaign, now);
      if (created) issuedCount += 1;
    }

    return { issuedCount };
  }
}
