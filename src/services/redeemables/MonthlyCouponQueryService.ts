// src/services/redeemables/MonthlyCouponQueryService.ts
//
// Shared query/projection code for the monthly-coupon admin domain.
// Both the legacy admin routes and the Norm read endpoints import from here so
// the underlying numbers match by construction.
//
// Three responsibilities:
//   1. listCampaignsWithRedemptionCounts — admin campaign list + redeemed-count rollup.
//   2. filterCampaignAudience — POST /target-users/filter body resolution
//      (Mongo filter + pagination + bulk-id mode + draw-entries enrichment).
//   3. mapTargetUserIdsResponse — opaque-id envelopes for the three TargetingService
//      flavours (manual / csv / dynamic) so Norm receives a uniform shape.
//
// PII guidance: the filter helper has TWO callers with DIFFERENT projection needs.
// The admin UI needs full user mini-rows (firstName/lastName/email/state/role/etc)
// for the operator-facing picker; Norm only ever needs counts + opaque IDs to
// scope a coupon distribution. Both pull from the same Mongo filter so totals
// match — the projection layer is split at the route boundary.
import mongoose from "mongoose";
import MonthlyEntryCampaign, {
  type CampaignMode,
  type IMonthlyEntryCampaign,
  type PurchaseRequirement,
  type TargetingMode,
} from "@/models/MonthlyEntryCampaign";
import RedeemableIssuance from "@/models/RedeemableIssuance";
import User from "@/models/User";
import MajorDraw from "@/models/MajorDraw";
import { getPackageById } from "@/data/membershipPackages";
import {
  buildCampaignAudienceMongoFilter,
  type CampaignAudienceSubscriptionStatus,
} from "@/utils/redeemables/campaignAudienceFilter";
import { loadTopMajorDrawPercentileUserIds } from "@/utils/redeemables/topMajorDrawPercentile";

/** Cap bulk ID responses to avoid huge payloads / BSON limits on campaign.includeUserIds */
export const MAX_MATCHING_USER_IDS = 50_000;

// ─── Campaign list ────────────────────────────────────────────────────────────

export interface MonthlyCampaignListRow {
  id: string;
  monthKey: string;
  name: string;
  displayLabel?: string;
  entriesAmount: number;
  campaignMode: CampaignMode;
  targetingMode: TargetingMode;
  startsAt: Date;
  endsAt?: Date;
  neverExpires: boolean;
  isActive: boolean;
  code: string;
  requiresPurchase: boolean;
  purchaseRequirement: PurchaseRequirement;
  segmentConfig?: IMonthlyEntryCampaign["segmentConfig"];
  createdAt: Date;
  updatedAt: Date;
  redeemedCount: number;
}

/**
 * Full list of monthly campaigns + per-campaign redeemed-count rollup.
 * Shared by the admin `GET /api/admin/monthly-coupon/campaign` and the Norm read
 * `GET /v1/monthly-coupon/campaign`.
 */
export async function listCampaignsWithRedemptionCounts(filters?: {
  monthKey?: string;
}): Promise<MonthlyCampaignListRow[]> {
  const query: { monthKey?: string } = {};
  if (filters?.monthKey) query.monthKey = filters.monthKey;

  const campaigns = await MonthlyEntryCampaign.find(query)
    .sort({ monthKey: -1, createdAt: -1 })
    .select(
      "monthKey name displayLabel entriesAmount campaignMode targetingMode startsAt endsAt neverExpires isActive code requiresPurchase purchaseRequirement segmentConfig createdAt updatedAt",
    )
    .lean();

  const campaignIds = campaigns.map((c) => c._id);
  const redemptionCounts = await RedeemableIssuance.aggregate<{
    _id: mongoose.Types.ObjectId;
    redeemedCount: number;
  }>([
    { $match: { campaignId: { $in: campaignIds }, status: "redeemed" } },
    { $group: { _id: "$campaignId", redeemedCount: { $sum: 1 } } },
  ]);
  const redemptionCountMap = new Map(
    redemptionCounts.map((item) => [item._id.toString(), item.redeemedCount]),
  );

  return campaigns.map((c) => ({
    id: String(c._id),
    monthKey: c.monthKey,
    name: c.name,
    displayLabel: c.displayLabel,
    entriesAmount: c.entriesAmount,
    campaignMode: c.campaignMode,
    targetingMode: c.targetingMode,
    startsAt: c.startsAt,
    endsAt: c.endsAt,
    neverExpires: c.neverExpires,
    isActive: c.isActive,
    code: c.code,
    requiresPurchase: c.requiresPurchase,
    purchaseRequirement: c.purchaseRequirement,
    segmentConfig: c.segmentConfig,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    redeemedCount: redemptionCountMap.get(String(c._id)) ?? 0,
  }));
}

// ─── Audience filter (POST target-users/filter) ───────────────────────────────

export interface FilterCampaignAudienceInput {
  subscriptionStatus?: CampaignAudienceSubscriptionStatus;
  membershipTiers?: ("tradie-subscription" | "foreman-subscription" | "boss-subscription")[];
  states?: string[];
  requiresEmailVerified?: boolean;
  topEntriesPercent?: number;
  searchQuery?: string;
  page?: number;
  limit?: number;
  returnMatchingUserIds?: boolean;
}

export interface FilteredAudienceUserRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  state?: string;
  role?: string;
  isActive: boolean;
  isEmailVerified: boolean;
  createdAt: Date | null;
  lastLogin: Date | null;
  subscription: {
    packageId: string;
    packageName: string | null;
    isActive: boolean;
    status: string;
  } | null;
  majorDrawEntries: number;
}

export interface FilteredAudiencePaged {
  mode: "page";
  users: FilteredAudienceUserRow[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalCount: number;
    limit: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
  warning?: string;
}

export interface FilteredAudienceBulkIds {
  mode: "bulk";
  userIds: string[];
  totalCount: number;
}

export interface FilteredAudienceBulkTooLarge {
  mode: "bulk-too-large";
  totalCount: number;
  cap: number;
}

export type FilterCampaignAudienceResult =
  | FilteredAudiencePaged
  | FilteredAudienceBulkIds
  | FilteredAudienceBulkTooLarge;

/**
 * Resolve a coupon-targeting audience filter into either a paged user list
 * (admin picker UX) or a flat user-id array (bulk-add to `campaign.includeUserIds`).
 * Used by the admin `POST /api/admin/monthly-coupon/target-users/filter` and the
 * Norm read `POST /v1/monthly-coupon/target-users/filter`.
 */
export async function filterCampaignAudience(
  input: FilterCampaignAudienceInput,
): Promise<FilterCampaignAudienceResult> {
  const page = input.page ?? 1;
  const limit = input.limit ?? 25;

  let restrictToUserIds: string[] | undefined;
  if (typeof input.topEntriesPercent === "number") {
    restrictToUserIds = await loadTopMajorDrawPercentileUserIds(input.topEntriesPercent);
    if (restrictToUserIds.length === 0) {
      return {
        mode: "page",
        users: [],
        pagination: {
          currentPage: page,
          totalPages: 0,
          totalCount: 0,
          limit,
          hasNextPage: false,
          hasPrevPage: false,
        },
        warning:
          "No users match the top % filter (no active major draw or no entries). Adjust or clear Top % entries.",
      };
    }
  }

  const mongoFilter = buildCampaignAudienceMongoFilter({
    subscriptionStatus: input.subscriptionStatus,
    membershipTiers: input.membershipTiers,
    states: input.states,
    requiresEmailVerified: input.requiresEmailVerified ?? true,
    searchQuery: input.searchQuery,
    restrictToUserIds,
  });

  if (input.returnMatchingUserIds) {
    const totalCount = await User.countDocuments(mongoFilter);
    if (totalCount > MAX_MATCHING_USER_IDS) {
      return { mode: "bulk-too-large", totalCount, cap: MAX_MATCHING_USER_IDS };
    }
    const idDocs = await User.find(mongoFilter).select("_id").sort({ createdAt: -1 }).lean();
    const userIds = idDocs.map((d) => d._id.toString());
    return { mode: "bulk", userIds, totalCount };
  }

  const [totalCount, rawUsers] = await Promise.all([
    User.countDocuments(mongoFilter),
    User.find(mongoFilter)
      .select(
        "_id firstName lastName email state role isActive isEmailVerified createdAt lastLogin subscription.packageId subscription.isActive subscription.status",
      )
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);

  const currentMajorDraw = await MajorDraw.findOne({ status: "active" }).select("entries").lean();
  const userEntriesMap = new Map<string, number>();
  if (currentMajorDraw?.entries) {
    for (const entry of currentMajorDraw.entries as Array<{
      userId: { toString: () => string };
      totalEntries?: number;
      quantity?: number;
    }>) {
      const uid = entry.userId.toString();
      const c = entry.totalEntries || entry.quantity || 0;
      userEntriesMap.set(uid, (userEntriesMap.get(uid) || 0) + c);
    }
  }

  const users: FilteredAudienceUserRow[] = rawUsers.map((user) => {
    const userId = user._id.toString();
    let packageName: string | null = null;
    const pkgId = user.subscription?.packageId;
    if (pkgId) {
      const packageData = getPackageById(pkgId.toString());
      packageName = packageData?.name ?? null;
    }
    return {
      id: userId,
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
      email: user.email ?? "",
      state: user.state,
      role: user.role,
      isActive: Boolean(user.isActive),
      isEmailVerified: Boolean(user.isEmailVerified),
      createdAt: user.createdAt ?? null,
      lastLogin: user.lastLogin ?? null,
      subscription: user.subscription?.packageId
        ? {
            packageId: user.subscription.packageId.toString(),
            packageName,
            isActive: Boolean(user.subscription.isActive),
            status: user.subscription.status ?? "",
          }
        : null,
      majorDrawEntries: userEntriesMap.get(userId) ?? 0,
    };
  });

  const totalPages = Math.ceil(totalCount / limit) || 0;

  return {
    mode: "page",
    users,
    pagination: {
      currentPage: page,
      totalPages,
      totalCount,
      limit,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  };
}
