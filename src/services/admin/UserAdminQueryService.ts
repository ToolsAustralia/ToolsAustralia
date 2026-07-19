// src/services/admin/UserAdminQueryService.ts
//
// Admin-facing user list + search + export-aggregate + per-id readers.
// Extracted from the fat admin user routes (`/api/admin/users`, `/api/admin/users/search`,
// `/api/admin/users/export`, `/api/admin/users/[id]`, `/api/admin/users/[id]/payment-events`)
// so the admin routes and Norm projections call the same code and report identical
// numbers by construction. Framework-agnostic — no Request / NextResponse types.

import mongoose from "mongoose";
import User from "@/models/User";
import PaymentEvent from "@/models/PaymentEvent";
import MajorDraw from "@/models/MajorDraw";
import MiniDraw from "@/models/MiniDraw";
import type { IUser } from "@/models/User";
import { getPackageById } from "@/data/membershipPackages";
import {
  buildUserFilter,
  getActiveSubscriptionFilter,
  getEverPaidUserFilter,
} from "@/utils/admin/userFilterBuilder";
import { resolvePartnerAccessRing, type PartnerAccessRing } from "@/utils/partner-discounts/partner-access-ring";
import {
  resolveNextRenewalEntries,
  renewalEntriesLandInCurrentDraw,
} from "@/utils/subscription/next-renewal-entries";

/** True iff `id` is a syntactically-valid Mongo ObjectId. */
export function isValidUserObjectId(id: string): boolean {
  return mongoose.Types.ObjectId.isValid(id);
}

// ─── List ─────────────────────────────────────────────────────────────────

export interface ListUsersArgs {
  page: number;
  limit: number;
  search?: string;
  subscriptionStatus?: string;
  autoRenew?: string;
  membershipPackage?: string;
  role?: string;
  dateFrom?: string;
  dateTo?: string;
  states?: string[];
  inActiveMajorDraw?: string;
  /** Membership Streak: "none" = streak 0/absent; a number string = at least N consecutive paid renewals */
  streak?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface UserListRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  mobile?: string;
  state?: string;
  role: string;
  isActive: boolean;
  isEmailVerified: boolean;
  isMobileVerified?: boolean;
  profileSetupCompleted?: boolean;
  createdAt: Date;
  lastLogin?: Date;
  subscription: {
    packageId: string;
    packageName: string | null;
    isActive: boolean;
    startDate: Date;
    endDate?: Date;
    status?: string;
    lastMonthAccumulatedEntries?: number | null;
    /** Membership Streak — consecutive paid renewals (join = month 0). */
    streakMonths?: number;
  } | null;
  totalSpent: number;
  majorDrawEntries: number;
  miniDrawCount: number;
  rewardsPoints: number;
  accumulatedEntries: number;
}

export interface UserListStats {
  totalUsers: number;
  activeSubscriptions: number;
  verifiedUsers: number;
  conversions: number;
}

export interface UserListPagination {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  limit: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface ListUsersResult {
  users: UserListRow[];
  stats: UserListStats;
  pagination: UserListPagination;
}

const COMPUTED_SORT_FIELDS = new Set([
  "totalSpent",
  "majorDrawEntries",
  "miniDrawCount",
]);

/**
 * Paginated + filtered user list with computed `totalSpent`, `majorDrawEntries`,
 * `miniDrawCount` per row plus headline stats counts.
 */
export async function listAdminUsers(args: ListUsersArgs): Promise<ListUsersResult> {
  const page = Math.max(1, Math.floor(args.page) || 1);
  const limit = Math.min(100, Math.max(1, Math.floor(args.limit) || 25));
  const sortBy = args.sortBy || "createdAt";
  const sortOrder = args.sortOrder === "asc" ? "asc" : "desc";

  const filter = await buildUserFilter({
    search: args.search ?? "",
    subscriptionStatus: args.subscriptionStatus ?? "",
    autoRenew: args.autoRenew ?? "",
    membershipPackage: args.membershipPackage ?? "",
    role: args.role ?? "",
    dateFrom: args.dateFrom ?? "",
    dateTo: args.dateTo ?? "",
    states: args.states ?? [],
    inActiveMajorDraw: args.inActiveMajorDraw ?? "",
    streak: args.streak ?? "",
  });

  const isComputedFieldSort = COMPUTED_SORT_FIELDS.has(sortBy);

  let users: Array<Record<string, unknown>>;
  let totalCount: number;

  if (isComputedFieldSort) {
    const all = await User.find(filter)
      .select("-password -emailVerificationToken -passwordResetToken -smsOtpCode")
      .lean();
    users = all as unknown as Array<Record<string, unknown>>;
    totalCount = users.length;
  } else {
    const sort: Record<string, 1 | -1> = {};
    sort[sortBy] = sortOrder === "asc" ? 1 : -1;
    const skip = (page - 1) * limit;
    const [list, count] = await Promise.all([
      User.find(filter)
        .select("-password -emailVerificationToken -passwordResetToken -smsOtpCode")
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments(filter),
    ]);
    users = list as unknown as Array<Record<string, unknown>>;
    totalCount = count;
  }

  const userIds = users.map((u) => String((u._id as { toString: () => string }).toString()));

  // Per-user totalSpent (Option B: exclude refunded BenefitsGranted)
  const [paymentEvents, refundEvents] = await Promise.all([
    PaymentEvent.find({
      userId: { $in: userIds },
      eventType: "BenefitsGranted",
    }).lean(),
    PaymentEvent.find({
      userId: { $in: userIds },
      eventType: "RefundProcessed",
    })
      .select("userId paymentIntentId")
      .lean(),
  ]);

  const refundedKeys = new Set(
    refundEvents.map((e) => `${e.userId.toString()}|${e.paymentIntentId}`),
  );

  const userSpentMap = new Map<string, number>();
  for (const event of paymentEvents) {
    const userId = event.userId.toString();
    const key = `${userId}|${event.paymentIntentId}`;
    if (refundedKeys.has(key)) continue;
    const current = userSpentMap.get(userId) || 0;
    userSpentMap.set(userId, current + (event.data?.price || 0));
  }

  // Per-user current-major-draw entries
  const currentMajorDraw = await MajorDraw.findOne({ status: "active" }).lean();
  const userEntriesMap = new Map<string, number>();
  if (currentMajorDraw?.entries) {
    for (const entry of currentMajorDraw.entries as Array<{
      userId: { toString: () => string };
      totalEntries?: number;
      quantity?: number;
    }>) {
      const uid = entry.userId.toString();
      const count = entry.totalEntries || entry.quantity || 0;
      userEntriesMap.set(uid, (userEntriesMap.get(uid) || 0) + count);
    }
  }

  // Headline stats (across the whole user collection — not the filtered page)
  const [totalUsers, activeSubscriptions, verifiedUsers, conversions] = await Promise.all([
    User.countDocuments({ isActive: true }),
    User.countDocuments(getActiveSubscriptionFilter()),
    User.countDocuments({ isEmailVerified: true, isActive: true }),
    User.countDocuments(getEverPaidUserFilter()),
  ]);

  // Build per-row rich shape (still admin-flavoured; Norm route projects to a
  // narrower PII-safe subset before responding).
  const allRows: UserListRow[] = users.map((raw) => {
    const u = raw as {
      _id: { toString: () => string };
      firstName: string;
      lastName: string;
      email: string;
      mobile?: string;
      state?: string;
      role: string;
      isActive: boolean;
      isEmailVerified: boolean;
      isMobileVerified?: boolean;
      profileSetupCompleted?: boolean;
      createdAt: Date;
      lastLogin?: Date;
      subscription?: {
        packageId: string;
        isActive: boolean;
        startDate: Date;
        endDate?: Date;
        status?: string;
        lastMonthAccumulatedEntries?: number;
        streakMonths?: number;
      };
      miniDrawParticipation?: Array<{ isActive?: boolean }>;
      rewardsPoints?: number;
      accumulatedEntries?: number;
    };
    const id = u._id.toString();
    const totalSpent = userSpentMap.get(id) || 0;
    const majorDrawEntries = userEntriesMap.get(id) || 0;
    const miniDrawCount = (u.miniDrawParticipation || []).filter(
      (p) => p.isActive !== false,
    ).length;

    let packageName: string | null = null;
    if (u.subscription?.packageId) {
      packageName = getPackageById(u.subscription.packageId.toString())?.name ?? null;
    }

    return {
      id,
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      mobile: u.mobile,
      state: u.state,
      role: u.role,
      isActive: u.isActive,
      isEmailVerified: u.isEmailVerified,
      isMobileVerified: u.isMobileVerified,
      profileSetupCompleted: u.profileSetupCompleted,
      createdAt: u.createdAt,
      lastLogin: u.lastLogin,
      subscription:
        u.subscription && u.subscription.packageId
          ? {
              packageId: u.subscription.packageId.toString(),
              packageName,
              isActive: u.subscription.isActive,
              startDate: u.subscription.startDate,
              endDate: u.subscription.endDate,
              status: u.subscription.status,
              lastMonthAccumulatedEntries: u.subscription.lastMonthAccumulatedEntries ?? null,
              streakMonths: u.subscription.streakMonths ?? 0,
            }
          : null,
      totalSpent,
      majorDrawEntries,
      miniDrawCount,
      rewardsPoints: u.rewardsPoints || 0,
      accumulatedEntries: u.accumulatedEntries || 0,
    };
  });

  let rows = allRows;
  if (isComputedFieldSort) {
    rows.sort((a, b) => {
      const av = (a as unknown as Record<string, number>)[sortBy] || 0;
      const bv = (b as unknown as Record<string, number>)[sortBy] || 0;
      return sortOrder === "asc" ? av - bv : bv - av;
    });
    const skip = (page - 1) * limit;
    rows = rows.slice(skip, skip + limit);
  }

  const totalPages = Math.ceil(totalCount / limit);
  return {
    users: rows,
    stats: {
      totalUsers,
      activeSubscriptions,
      verifiedUsers,
      conversions,
    },
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

// ─── Search ───────────────────────────────────────────────────────────────

export interface SearchUsersArgs {
  q: string;
  page: number;
  limit: number;
  majorDrawId?: string;
  miniDrawId?: string;
}

export interface UserSearchRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  mobile?: string;
  state?: string;
  role: string;
  isActive: boolean;
  createdAt: Date;
  lastLogin?: Date;
  currentDrawEntries?: {
    totalEntries: number;
    entriesBySource: Record<string, number>;
  };
}

export interface SearchUsersResult {
  users: UserSearchRow[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalCount: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
    limit: number;
  };
  currentDraw:
    | { id: string; name: string; status: string; type: "major" | "mini" }
    | null;
}

/**
 * Fuzzy user search by name/email/mobile/ObjectId with optional draw-participant filter.
 * Implementation mirrors the legacy admin/users/search route.
 */
export async function searchAdminUsers(args: SearchUsersArgs): Promise<SearchUsersResult> {
  const q = (args.q ?? "").trim();
  const page = Math.max(1, args.page);
  const limit = Math.min(100, Math.max(1, args.limit));

  const searchQuery: Record<string, unknown> = {};
  if (q.length > 0) {
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(q);
    if (isObjectId) {
      searchQuery._id = q;
    } else {
      searchQuery.$or = [
        { email: { $regex: q, $options: "i" } },
        { mobile: { $regex: q, $options: "i" } },
        { firstName: { $regex: q, $options: "i" } },
        { lastName: { $regex: q, $options: "i" } },
        {
          $expr: {
            $regexMatch: {
              input: { $concat: ["$firstName", " ", "$lastName"] },
              regex: q,
              options: "i",
            },
          },
        },
      ];
    }
  }

  type DrawLike = {
    _id: mongoose.Types.ObjectId;
    name?: string;
    status?: string;
    entries?: unknown[];
  };
  let participantUserIds: string[] = [];
  let targetMajorDraw: DrawLike | null = null;
  let targetMiniDraw: DrawLike | null = null;

  if (args.majorDrawId) {
    // .lean() so subdoc entries[].entriesBySource resolves to a plain JS object
    // rather than a Mongoose Map (the Zod `record` schema in the Norm wrapper rejects Maps).
    const draw = await MajorDraw.findById(args.majorDrawId).lean();
    if (draw?.entries) {
      participantUserIds = draw.entries.map((e: { userId: { toString: () => string } }) =>
        e.userId.toString(),
      );
      targetMajorDraw = draw as unknown as DrawLike;
    }
  } else if (args.miniDrawId) {
    const draw = await MiniDraw.findById(args.miniDrawId).lean();
    if (draw?.entries) {
      participantUserIds = draw.entries
        .filter((e: { totalEntries: number }) => e.totalEntries > 0)
        .map((e: { userId: { toString: () => string } }) => e.userId.toString());
      targetMiniDraw = draw as unknown as DrawLike;
    }
  }

  if (participantUserIds.length > 0) {
    const participantFilter = { _id: { $in: participantUserIds } };
    if (q) {
      const textConditions = searchQuery.$or as unknown[] | undefined;
      if (textConditions?.length) {
        searchQuery.$and = [participantFilter, { $or: textConditions }];
        delete searchQuery.$or;
      } else if (searchQuery._id) {
        const searchId = searchQuery._id as string;
        searchQuery._id = participantUserIds.includes(searchId) ? searchId : "000000000000000000000000";
      }
    } else {
      Object.keys(searchQuery).forEach((k) => delete searchQuery[k]);
      Object.assign(searchQuery, participantFilter);
    }
  } else if (args.majorDrawId || args.miniDrawId) {
    return {
      users: [],
      pagination: {
        currentPage: page,
        totalPages: 0,
        totalCount: 0,
        hasNextPage: false,
        hasPrevPage: false,
        limit,
      },
      currentDraw: null,
    };
  }

  const skip = (page - 1) * limit;
  const [docs, totalCount] = await Promise.all([
    User.find(searchQuery)
      .select("firstName lastName email mobile state role isActive createdAt lastLogin")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(searchQuery),
  ]);

  if (!targetMajorDraw && !targetMiniDraw) {
    const activeMajor = await MajorDraw.findOne({
      status: { $in: ["active", "frozen"] },
    })
      .sort({ activationDate: -1 })
      .lean();
    targetMajorDraw = activeMajor as unknown as DrawLike | null;
  }

  const rows: UserSearchRow[] = docs.map((user) => {
    let currentDrawEntries: UserSearchRow["currentDrawEntries"] | undefined;
    if (targetMajorDraw?.entries) {
      const entry = (targetMajorDraw.entries as Array<{
        userId: { toString: () => string };
        totalEntries: number;
        entriesBySource: Record<string, number>;
      }>).find((e) => e.userId.toString() === user._id.toString());
      if (entry) {
        currentDrawEntries = {
          totalEntries: entry.totalEntries,
          entriesBySource: entry.entriesBySource,
        };
      }
    } else if (targetMiniDraw?.entries) {
      const entry = (targetMiniDraw.entries as Array<{
        userId: { toString: () => string };
        totalEntries: number;
      }>).find((e) => e.userId.toString() === user._id.toString());
      if (entry) {
        currentDrawEntries = {
          totalEntries: entry.totalEntries,
          entriesBySource: {
            membership: 0,
            "one-time-package": 0,
            upsell: 0,
            "mini-draw": entry.totalEntries,
          },
        };
      }
    }

    return {
      id: user._id.toString(),
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      mobile: user.mobile,
      state: user.state,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin,
      currentDrawEntries,
    };
  });

  const totalPages = Math.ceil(totalCount / limit);
  return {
    users: rows,
    pagination: {
      currentPage: page,
      totalPages,
      totalCount,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
      limit,
    },
    currentDraw: targetMajorDraw
      ? {
          id: targetMajorDraw._id.toString(),
          name: targetMajorDraw.name ?? "",
          status: targetMajorDraw.status ?? "",
          type: "major",
        }
      : targetMiniDraw
        ? {
            id: targetMiniDraw._id.toString(),
            name: targetMiniDraw.name ?? "",
            status: targetMiniDraw.status ?? "",
            type: "mini",
          }
        : null,
  };
}

// ─── Export aggregate (Norm projection only) ───────────────────────────────

export interface ExportAggregateArgs {
  search?: string;
  subscriptionStatus?: string;
  autoRenew?: string;
  membershipPackage?: string;
  role?: string;
  dateFrom?: string;
  dateTo?: string;
  states?: string[];
  inActiveMajorDraw?: string;
  segment?: string;
}

export interface ExportAggregateResult {
  totalCount: number;
  byState: Array<{ state: string; count: number }>;
  byPackage: Array<{ packageId: string; packageName: string | null; count: number }>;
  bySubscriptionStatus: Array<{ status: string; count: number }>;
  /** True iff the request was the `top20MajorDraw` segment (not the standard filter set). */
  segment: string | null;
}

/**
 * Aggregate-only Norm projection of the export route. Returns counts grouped
 * by state / package / subscription status — never per-user PII rows. The
 * admin route's CSV/Excel binary export contract is intentionally NOT
 * re-implemented here; the aggregates use the same `buildUserFilter` so the
 * Norm count matches what the admin export would produce.
 */
export async function aggregateUserExport(
  args: ExportAggregateArgs,
): Promise<ExportAggregateResult> {
  let docs: Array<{
    _id: { toString: () => string };
    state?: string;
    subscription?: { packageId?: string; status?: string; isActive?: boolean };
  }>;

  if (args.segment === "top20MajorDraw") {
    const currentMajorDraw = await MajorDraw.findOne({ status: "active" }).lean();
    if (!currentMajorDraw?.entries || currentMajorDraw.entries.length === 0) {
      return { totalCount: 0, byState: [], byPackage: [], bySubscriptionStatus: [], segment: "top20MajorDraw" };
    }
    const countMap = new Map<string, number>();
    for (const entry of currentMajorDraw.entries as Array<{
      userId: { toString: () => string } | string;
      totalEntries?: number;
      quantity?: number;
    }>) {
      const uid = typeof entry.userId === "string" ? entry.userId : entry.userId.toString();
      const count = entry.totalEntries || entry.quantity || 0;
      if (count > 0) countMap.set(uid, (countMap.get(uid) || 0) + count);
    }
    const entryCounts = Array.from(countMap.entries()).map(([uid, count]) => ({ uid, count }));
    entryCounts.sort((a, b) => b.count - a.count);
    const takeCount = Math.max(1, Math.ceil(entryCounts.length * 0.2));
    const thresholdCount = entryCounts[takeCount - 1]?.count ?? 0;
    const topUserIds = entryCounts.filter((e) => e.count >= thresholdCount).map((e) => e.uid);
    docs = (await User.find({ _id: { $in: topUserIds } })
      .select("_id state subscription.packageId subscription.status subscription.isActive")
      .lean()) as unknown as typeof docs;
  } else {
    const filter = await buildUserFilter({
      search: args.search ?? "",
      subscriptionStatus: args.subscriptionStatus ?? "",
      autoRenew: args.autoRenew ?? "",
      membershipPackage: args.membershipPackage ?? "",
      role: args.role ?? "",
      dateFrom: args.dateFrom ?? "",
      dateTo: args.dateTo ?? "",
      states: args.states ?? [],
      inActiveMajorDraw: args.inActiveMajorDraw ?? "",
    });
    docs = (await User.find(filter)
      .select("_id state subscription.packageId subscription.status subscription.isActive")
      .lean()) as unknown as typeof docs;
  }

  const byState = new Map<string, number>();
  const byPackage = new Map<string, number>();
  const bySubStatus = new Map<string, number>();

  for (const doc of docs) {
    const stateKey = (doc.state || "unknown").toUpperCase();
    byState.set(stateKey, (byState.get(stateKey) || 0) + 1);

    const pkgId = doc.subscription?.packageId ?? "none";
    byPackage.set(pkgId, (byPackage.get(pkgId) || 0) + 1);

    let subKey: string;
    if (!doc.subscription) subKey = "none";
    else if (doc.subscription.status) subKey = doc.subscription.status;
    else if (doc.subscription.isActive) subKey = "active";
    else subKey = "inactive";
    bySubStatus.set(subKey, (bySubStatus.get(subKey) || 0) + 1);
  }

  return {
    totalCount: docs.length,
    byState: Array.from(byState.entries())
      .map(([state, count]) => ({ state, count }))
      .sort((a, b) => b.count - a.count),
    byPackage: Array.from(byPackage.entries())
      .map(([pkgId, count]) => ({
        packageId: pkgId,
        packageName: pkgId === "none" ? null : getPackageById(pkgId)?.name ?? null,
        count,
      }))
      .sort((a, b) => b.count - a.count),
    bySubscriptionStatus: Array.from(bySubStatus.entries())
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count),
    segment: args.segment === "top20MajorDraw" ? "top20MajorDraw" : null,
  };
}

// ─── Get-by-id (PII-safe projection — caller may use rich admin shape) ──────

export interface AdminUserDetailResult {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  mobile?: string;
  state?: string;
  role: string;
  isActive: boolean;
  isEmailVerified: boolean;
  isMobileVerified?: boolean;
  profileSetupCompleted?: boolean;
  acceptsPromotionalEmail?: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastLogin?: Date;
  subscription: {
    packageId: string | null;
    packageName: string | null;
    isActive: boolean;
    startDate?: Date;
    endDate?: Date;
    cancelledAt?: Date | null;
    status?: string;
    autoRenew?: boolean;
    lastMonthAccumulatedEntries?: number | null;
    /** Entries granted on the next successful renewal (carry-forward + base; never promo-multiplied). null when no renewal is coming. */
    nextRenewalEntries?: number | null;
    /** True iff those renewal entries land in the CURRENTLY-ACTIVE draw (renewal before its freeze). false = they land in a future draw, so don't surface against the current draw. */
    renewalLandsInCurrentDraw?: boolean;
    /** Membership Streak — consecutive paid renewals (join = month 0). */
    streakMonths?: number;
    /** Streak generation — bumps on each out-of-grace resubscribe reset (scopes milestone re-earning). */
    streakGeneration?: number;
  } | null;
  /** Partner-access ring — same derivation as the /my-account hero (pastdue > active > onetime > none). */
  partnerAccessRing: PartnerAccessRing;
  totalSpent: number;
  totalOrders: number;
  totalOrderValue: number;
  currentDrawEntries: number;
  accountAgeDays: number;
  daysSinceLastLogin: number | null;
  rewardsPoints: number;
  accumulatedEntries: number;
  paymentEventsTotal: number;
}

/**
 * Lean detail read for one user — counts + headline subscription. Skips the
 * fat fields the admin route ships (full order list, referral feed, saved-
 * payment-method Stripe lookups) so Norm can reason about user state without
 * hitting Stripe per call. Returns `null` when the id is unknown.
 */
export async function getAdminUserDetail(userId: string): Promise<AdminUserDetailResult | null> {
  if (!isValidUserObjectId(userId)) return null;

  const user = await User.findById(userId)
    .select(
      "-password -emailVerificationToken -passwordResetToken -smsOtpCode -savedPaymentMethods -bankDetails",
    )
    .lean();
  if (!user) return null;

  const userObjectId = new mongoose.Types.ObjectId(userId);

  const [paymentEvents, currentMajorDraw, paymentEventsTotal] = await Promise.all([
    PaymentEvent.find({ userId: userObjectId })
      .select("eventType paymentIntentId data")
      .lean(),
    MajorDraw.findOne({ status: "active" }).select("entries freezeEntriesAt drawDate").lean(),
    PaymentEvent.countDocuments({ userId: userObjectId }),
  ]);

  const refundedPaymentIntentIds = new Set(
    paymentEvents
      .filter((e) => e.eventType === "RefundProcessed")
      .map((e) => e.paymentIntentId),
  );
  const totalSpent = paymentEvents
    .filter(
      (event) =>
        event.eventType === "BenefitsGranted" &&
        !refundedPaymentIntentIds.has(event.paymentIntentId),
    )
    .reduce((sum, event) => sum + (event.data?.price || 0), 0);

  const currentDrawEntries = currentMajorDraw?.entries
    ? (currentMajorDraw.entries as Array<{
        userId: { toString: () => string };
        totalEntries?: number;
      }>)
        .filter((e) => e.userId.toString() === userId)
        .reduce((sum, e) => sum + (e.totalEntries ?? 0), 0)
    : 0;

  // Order count — keep this as count only so the service stays light.
  // (Admin route loads the full Order list; Norm only needs the count.)
  const { default: Order } = await import("@/models/Order");
  const orders = (await Order.find({ user: userObjectId })
    .select("totalAmount")
    .lean()) as unknown as Array<{ totalAmount?: number }>;
  const totalOrders = orders.length;
  const totalOrderValue = orders.reduce<number>(
    (sum, order) => sum + (order.totalAmount || 0),
    0,
  );

  const daysSinceLastLogin = user.lastLogin
    ? Math.floor((Date.now() - new Date(user.lastLogin).getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const accountAgeDays = Math.floor(
    (Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24),
  );

  const packageName = user.subscription?.packageId
    ? getPackageById(user.subscription.packageId.toString())?.name ?? null
    : null;

  // Same shared derivations as the admin user-detail route, so Norm and the
  // admin UI report identical numbers by construction (the lean doc carries
  // subscription + partnerDiscountQueue + oneTimePackages — the exclusion
  // .select() above only drops PII/secret fields).
  const partnerAccessRing = resolvePartnerAccessRing(user as unknown as IUser);
  const nextRenewalEntries = resolveNextRenewalEntries(user as unknown as IUser);
  // Only meaningful for an active renewing member — gates the "+N on renewal"
  // preview to the current draw (a renewal after this draw's freeze lands in the
  // NEXT draw). currentMajorDraw here is the active draw (not user-scoped).
  const renewalDateForDrawGate =
    user.subscription?.isActive && user.subscription?.autoRenew !== false
      ? user.subscription?.endDate ?? null
      : null;
  const renewalLandsInCurrentDraw = renewalEntriesLandInCurrentDraw(
    renewalDateForDrawGate,
    currentMajorDraw as { freezeEntriesAt?: Date | null; drawDate?: Date | null } | null,
  );

  return {
    id: user._id.toString(),
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    mobile: user.mobile,
    state: user.state,
    role: user.role,
    isActive: user.isActive,
    isEmailVerified: user.isEmailVerified,
    isMobileVerified: user.isMobileVerified,
    profileSetupCompleted: user.profileSetupCompleted,
    acceptsPromotionalEmail: user.acceptsPromotionalEmail !== false,
    createdAt: user.createdAt as Date,
    updatedAt: user.updatedAt as Date,
    lastLogin: user.lastLogin,
    subscription: user.subscription
      ? {
          packageId: (user.subscription.packageId as string | null) ?? null,
          packageName,
          isActive: user.subscription.isActive ?? false,
          startDate: user.subscription.startDate,
          endDate: user.subscription.endDate,
          cancelledAt: user.subscription.cancelledAt ?? null,
          status: user.subscription.status,
          autoRenew: user.subscription.autoRenew,
          lastMonthAccumulatedEntries: user.subscription.lastMonthAccumulatedEntries ?? null,
          nextRenewalEntries,
          renewalLandsInCurrentDraw,
          streakMonths: user.subscription.streakMonths ?? 0,
          streakGeneration: user.subscription.streakGeneration ?? 1,
        }
      : null,
    partnerAccessRing,
    totalSpent,
    totalOrders,
    totalOrderValue,
    currentDrawEntries,
    accountAgeDays,
    daysSinceLastLogin,
    rewardsPoints: user.rewardsPoints || 0,
    accumulatedEntries: user.accumulatedEntries || 0,
    paymentEventsTotal,
  };
}

// ─── Per-user past-due charge preview ──────────────────────────────────────

export interface UserChargePastDuePreviewArgs {
  userId: string;
}

export interface UserChargePastDuePreviewInvoice {
  invoiceId: string;
  amountCents: number;
  currency: string;
  willRecover: boolean;
}

export type UserChargePastDuePreviewResult =
  | {
      ok: true;
      preview: {
        eligibleCount: number;
        totalInvoices: number;
        filterStats: {
          wrongCollectionMethod: number;
          noAmountRemaining: number;
          noPaymentMethod: number;
          noCustomerId: number;
          userNotFound: number;
          notPastDue: number;
          duplicateOrStaleCycle: number;
        };
        invoices: UserChargePastDuePreviewInvoice[];
      };
    }
  | { ok: false; status: number; message: string };

/**
 * Per-user past-due charge preview. Same eligibility filters as the bulk job;
 * returns invoice metadata only (no PII per row). Mirrors the admin GET handler
 * at `/api/admin/users/[id]/charge-past-due` but collapsed to the shape Norm
 * needs.
 */
export async function previewUserChargePastDue(
  args: UserChargePastDuePreviewArgs,
): Promise<UserChargePastDuePreviewResult> {
  if (!isValidUserObjectId(args.userId)) {
    return { ok: false, status: 400, message: "Invalid user ID" };
  }

  // Dynamic imports to keep the service surface lean — these helpers carry
  // heavy Stripe deps that admin-only callers don't need on every page render.
  const { stripe } = await import("@/lib/stripe");
  const {
    batchFetchCustomers,
    resolveInvoicePaymentMethodId,
    selectCurrentSubscriptionChargeable,
  } = await import("@/server/admin/chargePastDueShared");
  const { chooseChargeAction } = await import("@/server/admin/chargeOrRecoverPolicy");

  const user = await User.findById(args.userId)
    .select("_id stripeCustomerId stripeSubscriptionId subscription.status")
    .lean<
      | {
          _id: mongoose.Types.ObjectId;
          stripeCustomerId?: string | null;
          stripeSubscriptionId?: string | null;
          subscription?: { status?: string | null } | null;
        }
      | null
    >();

  if (!user) return { ok: false, status: 404, message: "User not found" };
  if (user.subscription?.status !== "past_due") {
    return {
      ok: false,
      status: 400,
      message:
        "This action only applies when the member's subscription status is past_due in the database.",
    };
  }
  const customerId = user.stripeCustomerId?.trim();
  if (!customerId) return { ok: false, status: 400, message: "User has no Stripe customer ID." };

  // List all open invoices for the customer
  const allInvoices: Array<{
    id?: string;
    collection_method?: string;
    amount_remaining?: number | null;
    customer?: string | { id?: string };
    currency?: string;
  }> = [];
  let hasMore = true;
  let startingAfter: string | undefined;
  while (hasMore) {
    const resp = await stripe.invoices.list({
      customer: customerId,
      status: "open",
      collection_method: "charge_automatically",
      limit: 100,
      starting_after: startingAfter,
    });
    allInvoices.push(...(resp.data as typeof allInvoices));
    hasMore = resp.has_more;
    if (hasMore && resp.data.length > 0) {
      startingAfter = resp.data[resp.data.length - 1].id;
    }
  }

  const customerPaymentMethodMap = await batchFetchCustomers([customerId], 15, 200);
  const filterStats = {
    wrongCollectionMethod: 0,
    noAmountRemaining: 0,
    noPaymentMethod: 0,
    noCustomerId: 0,
    notPastDue: 0,
    duplicateOrStaleCycle: 0,
  };

  const eligibleInvoices: typeof allInvoices = [];
  for (const invoice of allInvoices) {
    if (!invoice.id) continue;
    if (invoice.collection_method !== "charge_automatically") {
      filterStats.wrongCollectionMethod++;
      continue;
    }
    if (!invoice.amount_remaining || invoice.amount_remaining <= 0) {
      filterStats.noAmountRemaining++;
      continue;
    }
    const invCustomerId =
      typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
    if (!invCustomerId || invCustomerId !== customerId) {
      filterStats.noCustomerId++;
      continue;
    }
    const defaultPm = customerPaymentMethodMap.get(customerId) || null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!resolveInvoicePaymentMethodId(invoice as any, defaultPm)) {
      filterStats.noPaymentMethod++;
      continue;
    }
    eligibleInvoices.push(invoice);
  }

  const { target, skipped } = selectCurrentSubscriptionChargeable(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    eligibleInvoices as any,
    user.stripeSubscriptionId,
  );
  filterStats.duplicateOrStaleCycle = skipped.length;
  const finalInvoices = target ? [target] : [];

  return {
    ok: true,
    preview: {
      eligibleCount: finalInvoices.length,
      totalInvoices: allInvoices.length,
      filterStats: {
        wrongCollectionMethod: filterStats.wrongCollectionMethod,
        noAmountRemaining: filterStats.noAmountRemaining,
        noPaymentMethod: filterStats.noPaymentMethod,
        noCustomerId: filterStats.noCustomerId,
        userNotFound: 0,
        notPastDue: filterStats.notPastDue,
        duplicateOrStaleCycle: filterStats.duplicateOrStaleCycle,
      },
      invoices: finalInvoices.map((inv) => ({
        invoiceId: inv.id ?? "",
        amountCents: inv.amount_remaining || 0,
        currency: inv.currency || "aud",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        willRecover: chooseChargeAction(inv as any).kind === "recover",
      })),
    },
  };
}

// ─── Per-user recover-past-due-invoice preview ────────────────────────────

export interface UserRecoverPastDueInvoicePreviewArgs {
  userId: string;
  originalInvoiceId: string;
}

export interface UserRecoverPastDueInvoicePreviewResult {
  ok: boolean;
  reason: string | null;
  message: string | null;
  invoice: {
    invoiceId: string;
    amountCents: number;
    currency: string;
    status: string | null;
    collectionMethod: string | null;
    subscriptionId: string | null;
  } | null;
}

/**
 * Read-only eligibility verdict for the per-user `recover-past-due-invoice`
 * route, joined with minimal Stripe invoice metadata. No customer PII.
 */
export async function previewUserRecoverPastDueInvoice(
  args: UserRecoverPastDueInvoicePreviewArgs,
): Promise<UserRecoverPastDueInvoicePreviewResult> {
  const { checkRecoveryEligibility } = await import("@/server/admin/recoverStrandedPastDue");
  const verdict = await checkRecoveryEligibility({
    userId: args.userId,
    originalInvoiceId: args.originalInvoiceId,
    bypassRecentRecoveryLock: true,
  });

  let invoiceMeta: UserRecoverPastDueInvoicePreviewResult["invoice"] = null;
  // Try to fetch the invoice metadata regardless of verdict — gives Norm enough
  // signal to explain why it can't recover without revealing customer email.
  try {
    const { stripe } = await import("@/lib/stripe");
    const inv = (await stripe.invoices.retrieve(args.originalInvoiceId)) as {
      id?: string;
      amount_remaining?: number | null;
      currency?: string;
      status?: string | null;
      collection_method?: string | null;
      subscription?: string | { id?: string } | null;
    };
    invoiceMeta = {
      invoiceId: inv.id ?? args.originalInvoiceId,
      amountCents: inv.amount_remaining || 0,
      currency: inv.currency || "aud",
      status: inv.status ?? null,
      collectionMethod: inv.collection_method ?? null,
      subscriptionId:
        typeof inv.subscription === "string"
          ? inv.subscription
          : inv.subscription?.id ?? null,
    };
  } catch {
    // Stripe lookup failed (likely invalid id). Skip metadata; verdict carries the reason.
  }

  if (verdict.eligible) {
    return {
      ok: true,
      reason: null,
      message: null,
      invoice: invoiceMeta,
    };
  }
  return {
    ok: false,
    reason: verdict.reason,
    message: verdict.message,
    invoice: invoiceMeta,
  };
}

// ─── Payment events (per-user, paged) ──────────────────────────────────────

export interface ListUserPaymentEventsArgs {
  userId: string;
  page: number;
  limit: number;
}

export interface UserPaymentEventRow {
  id: string;
  eventType: string;
  paymentIntentId?: string;
  hasRefundProcessed: boolean;
  refundProcessedAt?: string;
  timestamp: string;
  packageType?: string;
  packageId?: string;
  packageName?: string;
  amount?: number;
  stripeChargeId?: string;
}

export interface ListUserPaymentEventsResult {
  events: UserPaymentEventRow[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

const PAYMENT_EVENTS_MAX_LIMIT = 50;

export async function listUserPaymentEvents(
  args: ListUserPaymentEventsArgs,
): Promise<ListUserPaymentEventsResult | null> {
  if (!isValidUserObjectId(args.userId)) return null;
  const page = Math.max(1, args.page);
  const limit = Math.min(PAYMENT_EVENTS_MAX_LIMIT, Math.max(1, args.limit));
  const skip = (page - 1) * limit;

  const userObjectId = new mongoose.Types.ObjectId(args.userId);

  const [events, total] = await Promise.all([
    PaymentEvent.find({ userId: userObjectId })
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    PaymentEvent.countDocuments({ userId: userObjectId }),
  ]);

  const benefitsPaymentIntentIds = events
    .filter((e) => e.eventType === "BenefitsGranted" && typeof e.paymentIntentId === "string")
    .map((e) => e.paymentIntentId as string);

  const refundRows = benefitsPaymentIntentIds.length
    ? await PaymentEvent.find({
        userId: userObjectId,
        eventType: "RefundProcessed",
        paymentIntentId: { $in: benefitsPaymentIntentIds },
      })
        .select("paymentIntentId timestamp")
        .lean()
    : [];

  const refundProcessedAtByPi = new Map<string, string>();
  for (const row of refundRows) {
    const pi = row.paymentIntentId;
    if (typeof pi !== "string" || !row.timestamp) continue;
    const iso = row.timestamp instanceof Date ? row.timestamp.toISOString() : new Date(row.timestamp).toISOString();
    const prev = refundProcessedAtByPi.get(pi);
    if (!prev || new Date(iso) > new Date(prev)) {
      refundProcessedAtByPi.set(pi, iso);
    }
  }
  const refundedSet = new Set(refundProcessedAtByPi.keys());

  const rows: UserPaymentEventRow[] = events.map((event) => {
    const pi = typeof event.paymentIntentId === "string" ? event.paymentIntentId : undefined;
    const isRefundedBenefits =
      event.eventType === "BenefitsGranted" && pi != null && refundedSet.has(pi);
    const data = event.data as
      | { price?: number; amount?: number; stripeChargeId?: string }
      | undefined;
    return {
      id: event._id.toString(),
      eventType: event.eventType,
      paymentIntentId: pi,
      hasRefundProcessed: isRefundedBenefits,
      refundProcessedAt: isRefundedBenefits ? refundProcessedAtByPi.get(pi) : undefined,
      timestamp:
        event.timestamp instanceof Date ? event.timestamp.toISOString() : String(event.timestamp),
      packageType: event.packageType,
      packageId: event.packageId != null ? String(event.packageId) : undefined,
      packageName: typeof event.packageName === "string" ? event.packageName : undefined,
      amount: typeof data?.price === "number" ? data.price : data?.amount,
      stripeChargeId: data?.stripeChargeId,
    };
  });

  return {
    events: rows,
    page,
    limit,
    total,
    hasMore: skip + rows.length < total,
  };
}
