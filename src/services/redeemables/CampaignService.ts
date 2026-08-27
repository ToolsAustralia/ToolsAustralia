import mongoose from "mongoose";
import MonthlyEntryCampaign, { CampaignMode, IMonthlyEntryCampaign, TargetingMode, PurchaseRequirement } from "@/models/MonthlyEntryCampaign";
import RedeemableIssuance from "@/models/RedeemableIssuance";
import SegmentSnapshot from "@/models/SegmentSnapshot";
import User from "@/models/User";
import { loadTopMajorDrawPercentileUserIds } from "@/utils/redeemables/topMajorDrawPercentile";
import {
  BonusCodeTrigger,
  RearmOutcome,
  decideRearm,
  expiryAfterHours,
  personalWindowGoverns,
} from "@/utils/redeemables/bonus-code-policy";

export const NEVER_EXPIRES_ISSUANCE_DATE = new Date("9999-12-31T23:59:59.999Z");

/** Stand-in for a legacy row that was persisted without an `expiresAt`. Reads as long expired. */
export const LEGACY_MISSING_EXPIRY = new Date(0);

/**
 * The row as it was PERSISTED, handed back to the caller so every downstream
 * copy of the deadline is the STORED instant — the `Bonus Code Issued` event's
 * `expires_at` / `expires_at_label`, the wallet's `expiresAtLabel`, and the
 * checkout refusal sentence. The stored instant is the one the redemption gate
 * compares against, so any recomputed value is a second source of truth that
 * can only ever be wrong.
 *
 * RATIONALE UPDATED 2026-08-26 — the rule survived the exact-hours switch, the
 * reason changed. This used to read "a 150ms gap across Sydney midnight would
 * print a date a full calendar day off": `endOfDayAESTAfterDays` snapped every
 * expiry to the end of a Sydney day, so a caller recomputing a millisecond
 * later could land on the next day. `expiryAfterHours` removed that midnight
 * cliff, so do NOT conclude the drift is now harmless milliseconds. A re-arm
 * MOVES this instant, so a caller recomputing `now + validForHours` against a
 * row it did not just write can be a whole 72-hour window away from what is
 * enforced — a bigger error than the one this comment used to describe.
 */
export interface StampedIssuance {
  id: string;
  campaignId: string;
  campaignCode: string;
  code?: string;
  entriesAmount: number;
  issuedAt: Date;
  expiresAt: Date;
}

export interface StampedIssuanceResult {
  outcome: RearmOutcome | "not_applicable" | "error";
  issuance?: StampedIssuance;
}

/**
 * Precedence: validForHours > neverExpires > campaign.endsAt.
 * validForHours wins because a personal window is the whole point of a
 * trigger campaign; the pair is rejected at the zod boundary and in pre("save").
 * Returns null when the campaign has no usable expiry (legacy endsAt-less row).
 *
 * The `personalWindowGoverns` predicate is imported, never inlined — every
 * truncation site in the codebase must agree on what "personal window" means.
 */
export function resolveIssuanceExpiry(
  campaign: Pick<IMonthlyEntryCampaign, "validForHours" | "neverExpires" | "endsAt">,
  issuedAt: Date
): Date | null {
  if (personalWindowGoverns(campaign)) {
    // personalWindowGoverns has already proved this is a number >= 1; it is a
    // plain boolean predicate, not a type guard, so TS cannot narrow through it.
    return expiryAfterHours(issuedAt, campaign.validForHours as number);
  }
  if (campaign.neverExpires) return NEVER_EXPIRES_ISSUANCE_DATE;
  return campaign.endsAt ?? null;
}

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
    validForHours?: number;
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
      validForHours: number | null;
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

    // Guard the MERGED state: neverExpires and validForHours are mutually exclusive. The zod
    // refine at the route boundary is a cheap early gate but only sees THIS payload — a
    // `PUT { neverExpires: true }` that omits validForHours (leaving a previously-set value
    // untouched in Mongo) would pass zod and persist a document with BOTH fields set.
    // personalWindowGoverns checks validForHours only (never neverExpires), and it's the sole
    // gate resolveIssuanceExpiry uses for precedence — so the stale rolling window would
    // silently stay in force for every new issuance while the operator believes they just
    // turned expiry off. `validForHours: null` (the clearing sentinel) must still be allowed
    // alongside `neverExpires: true` — only a MERGED pair that is truthy on both sides is an
    // error. Same precedent as the targetingMode/segmentConfig merged-state guard above.
    //
    // The `.select()` below is an UNTYPED Mongo field-name string — tsc cannot check it.
    // Omitting `validForHours` from it would make `existing?.validForHours` read undefined
    // forever, so the merged-state guard would only ever see the CURRENT payload and the
    // stale-window case it exists to catch would sail straight through. Keep it in lockstep
    // with the field name.
    if (updates.neverExpires !== undefined || updates.validForHours !== undefined) {
      const existing = await MonthlyEntryCampaign.findById(campaignId)
        .select("neverExpires validForHours")
        .lean();
      const effectiveNeverExpires = updates.neverExpires ?? existing?.neverExpires ?? false;
      const effectiveValidForHours =
        updates.validForHours !== undefined ? updates.validForHours : existing?.validForHours;
      if (effectiveNeverExpires && typeof effectiveValidForHours === "number") {
        throw new Error("neverExpires and validForHours are mutually exclusive");
      }
    }

    const updateOperation: { $set: Record<string, unknown>; $unset?: Record<string, 1> } = {
      $set: normalizedUpdates,
    };

    // When neverExpires is true, set endsAt to far-future instead of unsetting.
    // $unset triggers Mongoose validation before neverExpires is applied, causing "endsAt is required".
    if (updates.neverExpires === true) {
      normalizedUpdates.endsAt = NEVER_EXPIRES_ISSUANCE_DATE;
    }

    // Two independent undefined-strip layers (the route and the normalizedUpdates loop
    // above) mean the field could otherwise NEVER be cleared once set — the same class of
    // bug displayLabel needed a bespoke escape hatch for. `null` is the clearing sentinel
    // (see the route's `.nullable().optional()`): translate it into a real $unset so a
    // campaign can go from a personal-window trigger campaign back to a plain endsAt one.
    if (updates.validForHours === null) {
      // Both keys below are UNTYPED string literals against a Record<string, unknown> /
      // a Mongo $unset document — tsc checks neither. If either drifts from the field
      // name, the `delete` becomes a silent no-op and `$unset` targets a key that does
      // not exist, so `$set` persists an explicit `validForHours: null` instead of
      // clearing the field. Keep both in lockstep with the field name.
      delete normalizedUpdates.validForHours;
      updateOperation.$unset = {
        ...updateOperation.$unset,
        validForHours: 1,
      };
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
    // ALWAYS soft-delete. This used to hard-delete when issuanceCount === 0, but
    // that count-then-delete was non-atomic AND zero issuances is the NORMAL resting
    // state for a lazily-minted trigger campaign (validForHours personal window) —
    // nobody has hit the eligibility moment yet. A delete racing a trigger would
    // orphan a live issuance: the campaign lookup then misses, and purchaseRequirement
    // collapses to "none", so the orphaned coupon renders as MORE claimable than a
    // real one. Soft delete (isActive: false) is safe under that race either way.
    await MonthlyEntryCampaign.findByIdAndUpdate(campaignObjectId, { $set: { isActive: false } }, { new: true });
    return { deleted: false, softDeleted: true };
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
    // THIRD LEAK DEFENCE (the cron route's own validForHours filter is first, and the
    // trigger gate in isUserEligibleForCampaign is second — but neither is on THIS
    // path, which is why this one exists).
    // getActiveCampaigns() matches any active campaign
    // whose endsAt is still ahead — which a validForHours campaign always has, since
    // its endsAt is the minting backstop. So one scheduled cron run while a trigger
    // campaign is live would mass-mint the entire active-subscriber base with no
    // trigger and no email, burning every one-per-lifetime grant. A personal window
    // may only be minted from an explicit eligibility moment.
    if (params.issuedBy === "cron" && personalWindowGoverns(params.campaign)) {
      // `[bonus-code]` prefix is the documented grep handle for this feature's
      // diagnostics (docs/rewards-redeemables/api.md) — an operator filtering on
      // it during an incident must see every line, not most of them.
      console.error("[bonus-code] issueCampaignToUsers refused: cron cannot mass-mint a personal-window campaign", {
        campaignId: String(params.campaign._id),
        campaignCode: params.campaign.code,
        validForHours: params.campaign.validForHours,
        skipped: params.userIds.length,
      });
      return { issuedCount: 0, skippedCount: params.userIds.length };
    }

    let issuedCount = 0;
    let skippedCount = 0;

    // ONE instant for the whole batch. Hoisted above the loop so every user in a
    // single admin click gets the SAME deadline.
    // Rationale updated 2026-08-26: this used to say "so a click that straddles
    // Sydney midnight cannot hand two users different expiry DAYS". The
    // calendar-day model (`endOfDayAESTAfterDays`) is gone, so there is no
    // midnight cliff left to straddle — but the hoist still earns its place. A
    // per-iteration `new Date()` would spread deadlines across the loop's own
    // wall-clock duration (seconds to minutes on a large batch), so two people
    // granted by the same click would hold windows that end at different times.
    const issuedAt = new Date();
    const batchExpiresAt = resolveIssuanceExpiry(params.campaign, issuedAt) ?? undefined;

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
              issuedAt,
              firstIssuedAt: issuedAt,
              expiresAt: batchExpiresAt,
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
    now: Date,
    options?: { trigger?: BonusCodeTrigger }
  ): Promise<boolean> {
    // LEAK DEFENCE. A trigger campaign is minted ONLY at an explicit eligibility
    // moment. Without this, the "all-active-subscribers" branch below returns a
    // bare hasActiveSubscription, so every active member who opens their rewards
    // wallet would self-enrol into the trigger campaign and burn their
    // one-per-lifetime grant without ever seeing an email.
    if (personalWindowGoverns(campaign) && !options?.trigger) return false;

    // THE TRIGGER IS THE TARGETING.
    //
    // A trigger campaign's population is defined by the ACT, not by a stored
    // audience: the customer already proved eligibility by cancelling, by buying
    // a one-time pack, or by starting checkout as a guest. Every stored-audience
    // branch below keys off `hasActiveSubscription`, and TWO of the three triggers
    // fire for people who by definition do not have one — the one-time trigger
    // fires only when `!user.subscription.isActive`, and checkout-start fires for
    // a guest who has just registered. Without this predicate those two triggers
    // return not_applicable every time, forever, under EVERY targeting mode an
    // admin can configure. (The third, cancel-click, silently no-ops on every
    // immediate / past-due cancellation, because the commit sets
    // subscription.isActive = false before ensureCampaignIssuanceForUser re-reads
    // the user — and past-due members are a prime win-back cohort.)
    //
    // Scope is deliberately narrow. It waives exactly two things: the implicit
    // active-subscription requirement, and the email-verified requirement. Both are
    // proxies for "is this a real, engaged customer?" — a question the trigger has
    // already answered more directly than either proxy could. Everything an admin
    // configured as an AUDIENCE still gates: manual/CSV pins, explicit
    // excludeUserIds, states, membershipTiers, topEntriesPercent, and the
    // inactivity window. And it is false whenever no trigger was passed, so the
    // wallet sweep and every pre-existing path stay byte-identical.
    const triggerIsTargeting = Boolean(options?.trigger) && personalWindowGoverns(campaign);

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
      // The trigger already selected this person. On a trigger campaign this mode
      // is the admin saying "no extra filter", not "members only".
      return triggerIsTargeting || hasActiveSubscription;
    }

    const config = campaign.segmentConfig;
    const includeUserIds = new Set((config?.includeUserIds || []).map(String));
    const excludeUserIds = new Set((config?.excludeUserIds || []).map(String));

    if (excludeUserIds.has(userId)) return false;
    if (includeUserIds.has(userId)) return true;

    if (!triggerIsTargeting && !hasActiveSubscription) return false;

    // requiresEmailVerified does NOT apply to a trigger campaign — at all, whatever
    // the stored value says. checkout-start fires seconds after registration, before
    // any verification email could possibly be actioned, so enforcing it here would
    // exclude that trigger's ENTIRE population.
    //
    // This was previously written as `?? !triggerIsTargeting`, which was dead code:
    // the schema carries `requiresEmailVerified: { type: Boolean, default: true }`
    // (models/MonthlyEntryCampaign.ts), so the field is ALWAYS persisted as a real
    // boolean and the ?? branch could never be reached. The relaxation existed in
    // source and never once ran — the same class of defect as the original gate it
    // was written to fix, and against the very population it was written for.
    //
    // Written as a guarded block rather than a ternary so the no-trigger path is
    // visibly the ORIGINAL two lines, unchanged.
    if (!triggerIsTargeting) {
      const requiresEmailVerified = config?.requiresEmailVerified ?? true;
      if (requiresEmailVerified && !user.isEmailVerified) return false;
    }

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

  /**
   * Mint / re-arm exactly one campaign issuance for one user.
   *
   * `now` is the SINGLE captured instant: both `issuedAt` and `expiresAt` derive
   * from it, so the persisted pair is always exactly `validForHours` apart and a
   * row can never disagree with itself.
   *
   * Rationale updated 2026-08-26: this used to read "so the persisted pair can
   * never straddle Sydney midnight". `expiryAfterHours` replaced the calendar-day
   * model and there is no midnight cliff any more — but two separate `new Date()`
   * calls would still stamp a window that is not the one the campaign promises,
   * and this instant is what the redemption gate and every rendered label are
   * derived from.
   */
  private static async createIssuanceForUser(
    userId: mongoose.Types.ObjectId,
    campaign: IMonthlyEntryCampaign,
    now: Date,
    options?: { trigger?: BonusCodeTrigger }
  ): Promise<StampedIssuanceResult> {
    const issuedAt = now;
    const expiresAt = resolveIssuanceExpiry(campaign, issuedAt);
    if (!expiresAt) return { outcome: "not_applicable" };

    const campaignId = campaign._id as mongoose.Types.ObjectId;
    const hasTrigger = Boolean(options?.trigger);

    const existingRow = await RedeemableIssuance.findOne({ campaignId, userId })
      .select("_id status expiresAt redeemedEverAt code entriesAmount issuedAt firstIssuedAt")
      .lean();

    // issueCampaignToUsers has always upserted WITHOUT validators, so a production
    // row can in principle lack expiresAt. decideRearm dereferences it, and this
    // function is reached from the wallet read — which has no try/catch — so a
    // missing date must read as "long expired", never throw a TypeError that 500s
    // /my-account.
    const existing = existingRow
      ? { ...existingRow, expiresAt: existingRow.expiresAt ?? LEGACY_MISSING_EXPIRY }
      : null;

    const outcome = decideRearm(
      existing
        ? { status: existing.status, expiresAt: existing.expiresAt, redeemedEverAt: existing.redeemedEverAt }
        : null,
      now,
      hasTrigger,
      // Fallback lives HERE, caller-side: decideRearm has no notion of issuedAt, only
      // firstIssuedAt. A legacy row minted before firstIssuedAt existed (issueCampaignToUsers
      // predates it) falls back to issuedAt so the cooldown still has something to anchor on.
      existing?.firstIssuedAt ?? existing?.issuedAt
    );

    const stamp = (doc: {
      _id: unknown;
      code?: string;
      entriesAmount: number;
      issuedAt: Date;
      expiresAt: Date;
    }): StampedIssuance => ({
      id: String(doc._id),
      campaignId: String(campaignId),
      campaignCode: campaign.code,
      code: doc.code,
      entriesAmount: doc.entriesAmount,
      issuedAt: doc.issuedAt,
      expiresAt: doc.expiresAt,
    });

    if (outcome === "spent" || outcome === "expired_no_rearm" || outcome === "already_active") {
      // Hand back the STORED values, never freshly computed ones. None of these
      // three outcomes emails anything (mintBonusCodeForTrigger notifies only on
      // minted/rearmed), so this is not a "re-send" — it is so a later RE-ARM
      // email, and any caller inspecting the outcome, can only ever see the
      // deadline the customer was actually told.
      return existing ? { outcome, issuance: stamp(existing) } : { outcome };
    }

    if (outcome === "rearmed") {
      const rearmed = await RedeemableIssuance.findOneAndUpdate(
        {
          campaignId,
          userId,
          // decideRearm deliberately ignores the status string and CAN return
          // "rearmed" for a legacy status:"expired" row. Demanding "active" here
          // would match nothing, and we would report already_active with no date
          // to a caller that is about to email a deadline.
          status: { $in: ["active", "expired"] },
          expiresAt: { $lte: now },
          redeemedEverAt: { $exists: false },
        },
        // firstIssuedAt records the customer's FIRST qualification and must
        // survive every re-arm. Leaving it out of the update is enough for a row
        // THIS code inserted (the mint's $setOnInsert writes it), but not for a
        // legacy row from issueCampaignToUsers, which has no firstIssuedAt at
        // all — for those, overwriting issuedAt below destroys the only record
        // of the original date. $min writes the field when absent and keeps the
        // EARLIER value when present, so it is idempotent, concurrency-safe, and
        // a no-op on rows that already carry it. Same idiom as
        // RedemptionService's $min: { redeemedEverAt }.
        {
          $set: { status: "active", issuedAt, expiresAt, notifiedAt: null, notifyError: null },
          $min: { firstIssuedAt: existing?.issuedAt ?? issuedAt },
        },
        { new: true }
      ).lean();
      // A racing redemption can flip the row under us; that is not an error.
      if (!rearmed) return { outcome: "already_active" };
      return { outcome: "rearmed", issuance: stamp(rearmed) };
    }

    // outcome === "minted" — atomic upsert rather than findOne + create. The old
    // read-then-write let a double-clicked Cancel throw E11000 out of the caller
    // AFTER Stripe had already cancelled, so the customer saw "cancel failed" on
    // a cancelled subscription. A concurrent trigger now loses the race cleanly.
    const needsUniqueCode = campaign.campaignMode === "unique" || campaign.campaignMode === "both";

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const uniqueCode = needsUniqueCode ? generateUniqueCode(campaign.monthKey) : undefined;

      try {
        const res = await RedeemableIssuance.findOneAndUpdate(
          { campaignId, userId },
          {
            $setOnInsert: {
              campaignId,
              userId,
              monthKey: campaign.monthKey,
              ...(uniqueCode ? { code: uniqueCode } : {}),
              status: "active",
              source: "monthly-coupon",
              entriesAmount: campaign.entriesAmount,
              issuedAt,
              firstIssuedAt: issuedAt,
              expiresAt,
              metadata: {
                targetingMode: campaign.targetingMode,
                issuedBy: options?.trigger ?? "auto",
              },
            },
          },
          // runValidators restores the parity lost by moving off create():
          // findOneAndUpdate runs NO schema validation unless asked.
          { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true, includeResultMetadata: true }
        );

        const doc = res.value;
        if (!doc) return { outcome: "not_applicable" };
        // updatedExisting === true means someone else inserted between our read
        // and this upsert — the same "a concurrent trigger won" case as E11000.
        if (res.lastErrorObject?.updatedExisting) {
          return { outcome: "already_active", issuance: stamp(doc) };
        }
        return { outcome: "minted", issuance: stamp(doc) };
      } catch (error) {
        const isDuplicate =
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          (error as { code?: number }).code === 11000;
        if (!isDuplicate) throw error;

        // WHICH unique index collided decides the handling. Two exist:
        // {campaignId,userId} and {campaignId,code}.
        // The driver always sets keyPattern on E11000. And in global mode there is
        // no per-user code at all, so {campaignId,userId} is the only index that
        // can possibly collide.
        const keyPattern = (error as { keyPattern?: Record<string, number> }).keyPattern;
        const isUserCollision = !needsUniqueCode || Boolean(keyPattern && "userId" in keyPattern);

        if (isUserCollision) {
          // A concurrent trigger won. NOT an error — re-read so the caller still
          // gets the stored stamp for its email.
          const winner = await RedeemableIssuance.findOne({ campaignId, userId })
            .select("_id code entriesAmount issuedAt expiresAt")
            .lean();
          return winner ? { outcome: "already_active", issuance: stamp(winner) } : { outcome: "already_active" };
        }

        // {campaignId,code} collision — the pre-existing regenerate-and-retry.
        if (attempt === 2) throw error;
      }
    }

    return { outcome: "not_applicable" };
  }

  /**
   * Wallet-read sweep. Enrols the user into every live campaign they qualify
   * for. It NEVER passes a trigger, so the leak defence in
   * `isUserEligibleForCampaign` refuses every personal-window campaign here.
   *
   * The return is widened ADDITIVELY (`issued`) so existing callers that only
   * read `issuedCount` are unaffected.
   */
  static async ensureActiveCampaignIssuancesForUser(
    userId: string
  ): Promise<{ issuedCount: number; issued: StampedIssuance[] }> {
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return { issuedCount: 0, issued: [] };
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);
    const user = await User.findById(userObjectId)
      .select("_id isActive isEmailVerified lastLogin state subscription.isActive subscription.packageId")
      .lean();
    if (!user) return { issuedCount: 0, issued: [] };

    const now = new Date();
    const activeCampaigns = await MonthlyEntryCampaign.find({
      isActive: true,
      startsAt: { $lte: now },
      $or: [{ neverExpires: true }, { endsAt: { $gte: now } }],
    }).sort({ startsAt: -1 });

    const issued: StampedIssuance[] = [];
    for (const campaign of activeCampaigns) {
      if (!(await CampaignService.isUserEligibleForCampaign(user, campaign, now))) {
        continue;
      }
      const result = await CampaignService.createIssuanceForUser(userObjectId, campaign, now);
      if (result.outcome === "minted" && result.issuance) issued.push(result.issuance);
    }

    return { issuedCount: issued.length, issued };
  }

  /**
   * The ONE entry point for the three eligibility triggers. Resolves a single
   * campaign by code, checks eligibility, and mints/re-arms the caller's row.
   *
   * WHO CALLS THIS, as of 2026-08-26. Exactly one production caller:
   * `mintBonusCodeForTrigger`, behind `POST /api/bonus-codes/v1/issue`. The
   * three internal call sites this JSDoc used to describe (the cancel route, the
   * payment webhook, registration) were DELETED in the launch reversal — the
   * Klaviyo flow now calls us one step above its discount email instead.
   *
   * Never throws — callers check `outcome`. The old rationale was "a failure
   * here must not take down a cancellation or a payment webhook", and those
   * callers are gone; the contract is load-bearing for a different reason now.
   * The route maps `outcome` onto the status Klaviyo sees, and that mapping is
   * the whole retry design: `error` is the one status whose retry can still
   * recover a grant while the discount email is already in flight. A throw would
   * bypass the map entirely.
   */
  static async ensureCampaignIssuanceForUser(params: {
    userId: string;
    campaignCode: string;
    trigger: BonusCodeTrigger;
  }): Promise<StampedIssuanceResult> {
    try {
      if (!mongoose.Types.ObjectId.isValid(params.userId)) {
        return { outcome: "not_applicable" };
      }

      const now = new Date();

      // Campaign FIRST, user second. `code` is uniquely indexed, and the overwhelmingly
      // common state of this call is "no campaign carries this code" — the feature is
      // inert until an admin creates one. Resolving the campaign first makes that path
      // cost one indexed hit instead of two.
      // (Until 2026-08-26 this said "on live payment/cancel/registration routes",
      // which were deleted with the launch reversal. The ordering is still right,
      // and for a stronger reason: the sole caller is now the Klaviyo webhook,
      // whose traffic is a whole marketing cohort arriving in a burst, and whose
      // NORMAL resting state — before any admin creates the campaign — is exactly
      // the "no campaign carries this code" path being optimised here.)
      const campaign = await MonthlyEntryCampaign.findOne({
        code: params.campaignCode.trim().toUpperCase(),
        isActive: true,
        startsAt: { $lte: now },
        // endsAt still gates MINTING — no new customer qualifies after the
        // campaign closes. It must NOT gate redemption of an already-minted
        // personal window; that distinction is RedemptionService's job, not this
        // query's.
        $or: [{ neverExpires: true }, { endsAt: { $gte: now } }],
      });
      if (!campaign) {
        // Under the webhook model this is a launch-configuration error, not a benign
        // no-op: the marketing flow is live but nobody created the campaign that
        // carries this code. The outcome stays not_applicable (a retry cannot fix a
        // missing campaign), but this is the cheapest early warning available.
        console.error("[bonus-code] no active campaign for code", { campaignCode: params.campaignCode });
        return { outcome: "not_applicable" };
      }

      const userObjectId = new mongoose.Types.ObjectId(params.userId);
      const user = await User.findById(userObjectId)
        .select("_id isActive isEmailVerified lastLogin state subscription.isActive subscription.packageId")
        .lean();
      if (!user || user.isActive === false) return { outcome: "not_applicable" };

      const eligible = await CampaignService.isUserEligibleForCampaign(user, campaign, now, {
        trigger: params.trigger,
      });
      if (!eligible) return { outcome: "not_applicable" };

      return await CampaignService.createIssuanceForUser(userObjectId, campaign, now, {
        trigger: params.trigger,
      });
    } catch (error) {
      // `[bonus-code]` prefix is MANDATORY here, not cosmetic: this is the sole
      // producer of the `error` outcome — the one status whose retry recovers a
      // grant while the discount email is already in flight — and there is no
      // admin surface to fall back on. An operator filtering Vercel logs on
      // `[bonus-code]` during an incident would otherwise see the route's "mint
      // failed" line and NOT the line saying why. (docs/rewards-redeemables/api.md
      // has promised this prefix on all diagnostics since the endpoint shipped;
      // this line and the cron refusal above were the two that did not carry it.)
      console.error("[bonus-code] ensureCampaignIssuanceForUser failed", {
        userId: params.userId,
        campaignCode: params.campaignCode,
        trigger: params.trigger,
        error: error instanceof Error ? error.message : String(error),
      });
      // Genuinely unexpected — invalid ObjectId, no campaign, missing/inactive user,
      // and ineligible are all handled above as not_applicable (a retry changes
      // nothing). This catch is everything else: a transient Mongo failure chief
      // among them. The caller (the webhook endpoint) must be able to tell "nothing
      // to do here" apart from "please retry" — collapsing this into not_applicable
      // permanently loses a customer's grant while the discount email is in flight.
      return { outcome: "error" };
    }
  }
}
