import User from "@/models/User";
import PaymentEvent from "@/models/PaymentEvent";
import MajorDraw from "@/models/MajorDraw";
import MiniDraw from "@/models/MiniDraw";
import Winner from "@/models/Winner";
import ReferralEvent from "@/models/ReferralEvent";
import mongoose from "mongoose";
import { getPackageById } from "@/data/membershipPackages";
import { getActiveSubscriptionFilter } from "@/utils/admin/userFilterBuilder";
import {
  createAESTDateAsUTC,
  getStartOfTodayInAEST,
  formatDateInAEST,
  getNextMidnightAEST,
  getTodayThrough27thWindowUTC,
  getWebsiteLaunchDateUTC,
} from "@/utils/common/timezone";
import { fetchNetBenefitsGrantedWithMatch } from "@/utils/payment/payment-event-net-queries";
import { formatInTimeZone } from "date-fns-tz";
import { subDays } from "date-fns";

const AEST_TIMEZONE = "Australia/Sydney";

// ─── Projected income ────────────────────────────────────────────────────────

export interface ProjectedIncomeData {
  projectedIncome: number;
  activeSubscriptions: number;
  nextMonthStart: string;
  nextMonthEnd: string;
  renewingOn27thCount: number;
  renewingOn27thRevenue: number;
  renewingOn27thDate: string;
  pastDueCount: number;
  pastDueRevenue: number;
}

function getNext27thEndUTC(): { endUTC: Date; renewingOn27thDate: Date } {
  const now = new Date();
  const year = parseInt(formatInTimeZone(now, AEST_TIMEZONE, "yyyy"), 10);
  const month = parseInt(formatInTimeZone(now, AEST_TIMEZONE, "M"), 10);
  const day = parseInt(formatInTimeZone(now, AEST_TIMEZONE, "d"), 10);
  let anchorYear = year;
  let anchorMonth = month;
  if (day >= 27) {
    anchorMonth += 1;
    if (anchorMonth > 12) {
      anchorMonth = 1;
      anchorYear += 1;
    }
  }
  const renewingOn27thDate = createAESTDateAsUTC(anchorYear, anchorMonth, 27, 0, 0);
  const endUTC = createAESTDateAsUTC(anchorYear, anchorMonth, 27, 20, 0);
  return { endUTC, renewingOn27thDate };
}

/** Computes projected income from active subscriptions, the upcoming-27th cohort, and past-due risk. */
export async function getProjectedIncome(): Promise<ProjectedIncomeData> {
  const activeSubscribers = await User.find({
    ...getActiveSubscriptionFilter(),
  }).select("subscription.packageId subscription.autoRenew subscription.endDate");

  let projectedIncome = 0;
  let activeSubscriptions = 0;
  activeSubscribers.forEach((user) => {
    if (user.subscription?.autoRenew === false) return;
    const packageId = user.subscription?.packageId;
    if (packageId) {
      const pkg = getPackageById(packageId);
      if (pkg && pkg.price) {
        projectedIncome += pkg.price;
        activeSubscriptions++;
      }
    }
  });

  const startUTC = getStartOfTodayInAEST();
  const { endUTC, renewingOn27thDate } = getNext27thEndUTC();
  const renewingOn27thUsers = await User.find({
    ...getActiveSubscriptionFilter(),
    "subscription.endDate": { $gte: startUTC, $lt: endUTC },
  }).select("subscription.packageId subscription.autoRenew");

  let renewingOn27thCount = 0;
  let renewingOn27thRevenue = 0;
  renewingOn27thUsers.forEach((user) => {
    if (user.subscription?.autoRenew === false) return;
    const packageId = user.subscription?.packageId;
    if (packageId) {
      const pkg = getPackageById(packageId);
      if (pkg && pkg.price) {
        renewingOn27thRevenue += pkg.price;
        renewingOn27thCount++;
      }
    }
  });

  const pastDueUsers = await User.find({
    "subscription.status": "past_due",
    "subscription.packageId": { $exists: true, $ne: null },
    isActive: true,
  }).select("subscription.packageId");

  let pastDueCount = 0;
  let pastDueRevenue = 0;
  pastDueUsers.forEach((user) => {
    const packageId = user.subscription?.packageId;
    if (packageId) {
      const pkg = getPackageById(packageId);
      if (pkg && pkg.price) {
        pastDueRevenue += pkg.price;
        pastDueCount++;
      }
    }
  });

  const now = new Date();
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextMonthEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0);

  return {
    projectedIncome: Math.round(projectedIncome * 100) / 100,
    activeSubscriptions,
    nextMonthStart: nextMonthStart.toISOString(),
    nextMonthEnd: nextMonthEnd.toISOString(),
    renewingOn27thCount,
    renewingOn27thRevenue: Math.round(renewingOn27thRevenue * 100) / 100,
    renewingOn27thDate: renewingOn27thDate.toISOString(),
    pastDueCount,
    pastDueRevenue: Math.round(pastDueRevenue * 100) / 100,
  };
}

// ─── Recent activities ───────────────────────────────────────────────────────

export interface RecentActivity {
  id: string;
  type:
    | "user_signup"
    | "membership_purchase"
    | "one_time_purchase"
    | "draw_complete"
    | "high_value_order"
    | "system_alert"
    | "membership_upgrade"
    | "subscription_past_due";
  /** Combined "FirstName LastName" for admin display. */
  user: string;
  /** First name as a separate field — set from the underlying User doc so
   * compound first names ("Jean Pierre") are preserved. `null` for System
   * events. PII-safe consumers (like the Norm route) prefer this over
   * splitting `user` on whitespace. */
  firstName: string | null;
  userId?: string;
  action: string;
  time: string;
  status: "success" | "info" | "warning" | "error";
  amount?: number;
  timestamp: Date;
  miniDrawId?: string;
}

export interface RecentActivitiesPage {
  activities: RecentActivity[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diffInSeconds < 60) return `${diffInSeconds} sec ago`;
  if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60);
    return `${minutes} min ago`;
  }
  if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  }
  const days = Math.floor(diffInSeconds / 86400);
  return `${days} day${days > 1 ? "s" : ""} ago`;
}

function getPackageName(packageId: string): string {
  const packageMap: Record<string, string> = {
    "tradie-subscription": "Tradie",
    "foreman-subscription": "Foreman",
    "boss-subscription": "Boss",
    "apprentice-pack": "Apprentice Pack",
    "tradie-pack": "Tradie Pack",
    "foreman-pack": "Foreman Pack",
    "boss-pack": "Boss Pack",
  };
  return packageMap[packageId] || packageId;
}

/**
 * Returns a paged feed of recent admin/site activity (signups, payments, subscription changes,
 * completed draws, high-value orders). Each activity is an opaque, audit-style row.
 */
export async function getRecentActivities(input: { page: number; limit: number }): Promise<RecentActivitiesPage> {
  const { page, limit } = input;
  const skip = (page - 1) * limit;

  const activities: RecentActivity[] = [];

  // Signups
  const recentSignups = await User.find({ isActive: true })
    .sort({ createdAt: -1 })
    .limit(50)
    .select("firstName lastName email createdAt _id affiliateReferral");

  const userIds = recentSignups.map((user) => new mongoose.Types.ObjectId(user._id));
  const referralEvents = await ReferralEvent.find({
    inviteeUserId: { $in: userIds },
    status: { $in: ["pending", "converted"] },
  })
    .select("inviteeUserId referralCode referrerId")
    .lean();

  const referralMap = new Map<string, string>();
  referralEvents.forEach((event) => {
    const inviteeId = event.inviteeUserId?.toString();
    const referrerId = event.referrerId?.toString();
    if (inviteeId && referrerId && inviteeId !== referrerId && event.referralCode) {
      referralMap.set(inviteeId, event.referralCode);
    }
  });

  recentSignups.forEach((user) => {
    const timeAgo = getTimeAgo(user.createdAt);
    let action = "Signed up for an account";
    const usedReferralCode = referralMap.get(user._id.toString());
    if (usedReferralCode) {
      action = `Signed up via friend referral (code: ${usedReferralCode})`;
    } else if (user.affiliateReferral?.affiliateCode) {
      action = `Signed up via affiliate (code: ${user.affiliateReferral.affiliateCode})`;
    }
    activities.push({
      id: `signup-${user._id}`,
      type: "user_signup",
      user: `${user.firstName} ${user.lastName}`,
      firstName: user.firstName || null,
      userId: user._id.toString(),
      action,
      time: timeAgo,
      status: "success",
      timestamp: user.createdAt,
    });
  });

  // Payments
  const recentPayments = await PaymentEvent.find({ eventType: "BenefitsGranted" })
    .sort({ timestamp: -1 })
    .limit(100)
    .lean();

  const paymentUserIds = [
    ...new Set(recentPayments.map((p) => (p.userId as mongoose.Types.ObjectId).toString())),
  ];
  const paymentUsers = await User.find({ _id: { $in: paymentUserIds } })
    .select("firstName lastName email subscription")
    .lean();
  const userMap = new Map(paymentUsers.map((u) => [u._id.toString(), u]));

  const rawMiniDrawIds = [
    ...new Set(
      recentPayments
        .filter((p) => p.packageType === "mini-draw")
        .map((p) => (p.data as Record<string, unknown>)?.miniDrawId as string)
        .filter(Boolean)
    ),
  ];
  const validMiniDrawIds = rawMiniDrawIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
  const miniDraws =
    validMiniDrawIds.length > 0
      ? await MiniDraw.find({ _id: { $in: validMiniDrawIds } }).select("_id name").lean()
      : [];
  type MiniDrawLean = { _id: mongoose.Types.ObjectId; name: string };
  const miniDrawMap = new Map<string, string>(
    (miniDraws as unknown as MiniDrawLean[]).map((d) => [d._id.toString(), d.name])
  );

  recentPayments.forEach((payment) => {
    const userDoc = userMap.get((payment.userId as mongoose.Types.ObjectId).toString());
    type UserType = {
      firstName: string;
      lastName: string;
      email: string;
      subscription?: {
        packageId?: string;
        previousSubscription?: { packageId?: string; packageName?: string };
        lastUpgradeDate?: Date;
        lastDowngradeDate?: Date;
      };
    };

    let user: UserType | null = null;
    if (userDoc) user = userDoc as UserType;

    const timeAgo = getTimeAgo(payment.timestamp);
    const paymentData = payment.data as Record<string, unknown> | undefined;
    const amount = (paymentData?.price as number | undefined) || 0;
    const packageName = payment.packageName || "Unknown Package";

    let action = "";
    let type: RecentActivity["type"] = "one_time_purchase";

    if (payment.packageType === "membership") {
      const billingReason = paymentData?.billingReason as string | undefined;
      let isRenewal = billingReason === "subscription_cycle";
      if (!billingReason && user?.subscription) {
        const hasExistingSubscription =
          user.subscription.packageId === payment.packageId &&
          user.subscription.lastUpgradeDate &&
          new Date(user.subscription.lastUpgradeDate).getTime() <
            payment.timestamp.getTime() - 24 * 60 * 60 * 1000;
        if (hasExistingSubscription) isRenewal = true;
      }
      action = isRenewal
        ? `Renewed ${packageName} subscription`
        : `Subscribed to ${packageName} Membership Package`;
      type = "membership_purchase";
    } else if (payment.packageType === "one-time") {
      action = `Purchased ${packageName}`;
      type = "one_time_purchase";
    } else if (payment.packageType === "upsell") {
      action = `Purchased ${packageName}`;
      type = "one_time_purchase";
    } else if (payment.packageType === "mini-draw") {
      const miniDrawId = paymentData?.miniDrawId as string | undefined;
      const entries = (paymentData?.entries as number | undefined) ?? 0;
      const miniDrawTitle = miniDrawId ? miniDrawMap.get(miniDrawId) : null;
      action =
        miniDrawId && miniDrawTitle
          ? `Entered in "${miniDrawTitle}" with ${entries} ${entries === 1 ? "entry" : "entries"}`
          : `Purchased ${packageName}`;
      type = "one_time_purchase";
    }

    if (amount >= 300) {
      type = "high_value_order";
      action = `High-value purchase: ${action} - $${amount}`;
    }

    const activityPayload: RecentActivity = {
      id: `payment-${payment._id}`,
      type,
      user: user ? `${user.firstName} ${user.lastName}` : "Unknown User",
      firstName: user?.firstName || null,
      userId: payment.userId ? (payment.userId as mongoose.Types.ObjectId).toString() : undefined,
      action,
      time: timeAgo,
      status: "success",
      amount,
      timestamp: payment.timestamp,
    };
    if (payment.packageType === "mini-draw") {
      const miniDrawId = (payment.data as Record<string, unknown>)?.miniDrawId as string | undefined;
      if (miniDrawId && miniDrawMap.has(miniDrawId)) activityPayload.miniDrawId = miniDrawId;
    }
    activities.push(activityPayload);
  });

  // Subscription changes
  const usersWithSubscriptionChanges = await User.find({
    $or: [
      { "subscription.lastUpgradeDate": { $exists: true } },
      { "subscription.lastDowngradeDate": { $exists: true } },
      { "subscription.cancelledAt": { $exists: true } },
      { "subscription.pastDueAt": { $exists: true } },
    ],
    isActive: true,
  })
    .sort({
      "subscription.lastUpgradeDate": -1,
      "subscription.lastDowngradeDate": -1,
      "subscription.cancelledAt": -1,
      "subscription.pastDueAt": -1,
    })
    .limit(50)
    .select("firstName lastName email subscription");

  usersWithSubscriptionChanges.forEach((user) => {
    if (!user.subscription) return;

    if (user.subscription.lastUpgradeDate) {
      const timeAgo = getTimeAgo(user.subscription.lastUpgradeDate);
      const currentPackage = user.subscription.packageId || "Unknown";
      const previousPackage = user.subscription.previousSubscription?.packageId || "Unknown";
      const currentPackageName = getPackageName(currentPackage);
      const previousPackageName =
        user.subscription.previousSubscription?.packageName || getPackageName(previousPackage);

      activities.push({
        id: `upgrade-${user._id}-${user.subscription.lastUpgradeDate.getTime()}`,
        type: "membership_upgrade",
        user: `${user.firstName} ${user.lastName}`,
        firstName: user.firstName || null,
        userId: user._id.toString(),
        action: `Upgraded subscription from ${previousPackageName} to ${currentPackageName}`,
        time: timeAgo,
        status: "success",
        timestamp: user.subscription.lastUpgradeDate,
      });
    }

    if (user.subscription.lastDowngradeDate) {
      const timeAgo = getTimeAgo(user.subscription.lastDowngradeDate);
      const currentPackage = user.subscription.packageId || "Unknown";
      const previousPackage = user.subscription.previousSubscription?.packageId || "Unknown";
      const currentPackageName = getPackageName(currentPackage);
      const previousPackageName =
        user.subscription.previousSubscription?.packageName || getPackageName(previousPackage);

      activities.push({
        id: `downgrade-${user._id}-${user.subscription.lastDowngradeDate.getTime()}`,
        type: "membership_upgrade",
        user: `${user.firstName} ${user.lastName}`,
        firstName: user.firstName || null,
        userId: user._id.toString(),
        action: `Downgraded subscription from ${previousPackageName} to ${currentPackageName}`,
        time: timeAgo,
        status: "info",
        timestamp: user.subscription.lastDowngradeDate,
      });
    }

    if (
      user.subscription.cancelledAt &&
      (!user.subscription.lastDowngradeDate ||
        user.subscription.cancelledAt.getTime() !== user.subscription.lastDowngradeDate.getTime())
    ) {
      const timeAgo = getTimeAgo(user.subscription.cancelledAt);
      const packageName = getPackageName(user.subscription.packageId || "Unknown");

      activities.push({
        id: `cancel-${user._id}-${user.subscription.cancelledAt.getTime()}`,
        type: "membership_upgrade",
        user: `${user.firstName} ${user.lastName}`,
        firstName: user.firstName || null,
        userId: user._id.toString(),
        action: `Cancelled ${packageName} membership`,
        time: timeAgo,
        status: "warning",
        timestamp: user.subscription.cancelledAt,
      });
    }

    if (user.subscription.pastDueAt) {
      const timeAgo = getTimeAgo(user.subscription.pastDueAt);
      const packageName = getPackageName(user.subscription.packageId || "Unknown");

      activities.push({
        id: `past-due-${user._id}-${user.subscription.pastDueAt.getTime()}`,
        type: "subscription_past_due",
        user: `${user.firstName} ${user.lastName}`,
        firstName: user.firstName || null,
        userId: user._id.toString(),
        action: `Membership renewal failed — ${packageName} account past due`,
        time: timeAgo,
        status: "error",
        timestamp: user.subscription.pastDueAt,
      });
    }
  });

  // Completed major draws
  const recentCompletedDraws = await MajorDraw.find({ status: "completed" })
    .sort({ updatedAt: -1 })
    .limit(20)
    .select("name updatedAt _id")
    .lean();

  const drawIds = recentCompletedDraws.map((draw) => draw._id);
  const winners = await Winner.find({ drawId: { $in: drawIds }, drawType: "major" })
    .select("drawId")
    .lean();
  const drawsWithWinners = new Set(
    winners.map((w: { drawId: { toString(): string } }) => w.drawId.toString())
  );

  recentCompletedDraws.forEach((draw) => {
    const drawTyped = draw as unknown as { _id: { toString(): string }; name: string; updatedAt: Date };
    const drawId = drawTyped._id.toString();
    const timeAgo = getTimeAgo(drawTyped.updatedAt);
    const hasWinner = drawsWithWinners.has(drawId);
    const winnerName = hasWinner ? "Winner selected" : "No winner yet";

    activities.push({
      id: `draw-${drawId}`,
      type: "draw_complete",
      user: "System",
      firstName: null,
      action: `${drawTyped.name} completed - ${winnerName}`,
      time: timeAgo,
      status: "info",
      timestamp: drawTyped.updatedAt,
    });
  });

  /*
    The Order-based "high-value order" feed was DELETED (2026-08-21).

    It read `Order.find({ totalAmount: { $gte: 200 } })` with NO status filter and
    rendered every row as `status: "success"` with the words "Purchased $X worth of
    tools" — so an abandoned checkout, or a duplicate created by a refresh at the
    card step, appeared to staff AND to Norm as a completed high-value purchase with
    money attached, and inflated `totalActivities` alongside it.

    Shop purchases now reach both activity surfaces through the PaymentEvent-based
    ActivityLogService, which only ever sees orders that were actually paid. One
    source, so the dashboard card, the Activity Log page and Norm cannot disagree.
  */

  activities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  const totalActivities = activities.length;
  const paginatedActivities = activities.slice(skip, skip + limit);
  const hasMore = skip + limit < totalActivities;

  return {
    activities: paginatedActivities,
    pagination: { page, limit, total: totalActivities, hasMore },
  };
}

// ─── Revenue details ─────────────────────────────────────────────────────────

export type RevenueDetailsCategory =
  | "membership-purchase"
  | "membership-renewal"
  | "one-time-purchase"
  | "additional-one-time"
  | "mini-draw"
  | "upsell"
  | "shop";

export type RevenueDetailsDateRange =
  | "today"
  | "yesterday"
  | "all-time"
  | "custom"
  | "current-draw"
  | "last-draw";

export interface RevenueDetailsInput {
  category: RevenueDetailsCategory;
  startDate: Date;
  endDate: Date;
  page: number;
  limit: number;
}

export interface RevenueDetailsPurchase {
  paymentEventId: string;
  timestamp: string;
  amount: number;
  packageId?: string;
  packageName?: string;
  billingReason?: string;
}

export interface RevenueDetailsUserRow {
  userId: string;
  userInfo: {
    firstName: string;
    lastName: string;
    email: string;
    mobile?: string;
  };
  purchases: RevenueDetailsPurchase[];
  totalContributed: number;
  purchaseCount: number;
}

export interface RevenueDetailsData {
  category: RevenueDetailsCategory;
  totalRevenue: number;
  totalPurchases: number;
  totalUsers: number;
  users: RevenueDetailsUserRow[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalCount: number;
    limit: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

/** Result of hydrating sorted net BenefitsGranted events into a paginated per-user contribution list. */
export interface RevenueUserRowsResult {
  users: RevenueDetailsUserRow[];
  totalUsers: number;
  totalPurchases: number;
  totalRevenue: number;
  pagination: {
    currentPage: number;
    totalPages: number;
    totalCount: number;
    limit: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

/**
 * Shared "sorted net events → paginated buyer rows + pagination" step used by BOTH
 * getRevenueDetails (single category) and getPlatformRevenueBreakdown (per platform).
 * One definition keeps the two buyer lists — and their PII-safe Norm projections — in
 * lockstep (a select-fields or row-shape change can't silently drift between them).
 * `events` must already be filtered + sorted (newest first) by the caller.
 */
export async function hydrateRevenueUserRows(
  events: Array<{
    _id?: string;
    userId?: unknown;
    packageId?: string;
    packageName?: string;
    data?: { price?: number; billingReason?: string; [key: string]: unknown };
    timestamp?: Date;
  }>,
  page: number,
  limit: number,
): Promise<RevenueUserRowsResult> {
  const userEventsMap = new Map<string, typeof events>();
  for (const event of events) {
    const userId = event.userId?.toString() || "";
    if (!userId) continue;
    if (!userEventsMap.has(userId)) userEventsMap.set(userId, []);
    userEventsMap.get(userId)!.push(event);
  }

  const userIds = Array.from(userEventsMap.keys());
  const totalUsers = userIds.length;
  const totalPurchases = events.length;
  const totalRevenue = events.reduce((sum, event) => sum + (event.data?.price || 0), 0);

  const startIndex = (page - 1) * limit;
  const paginatedUserIds = userIds.slice(startIndex, startIndex + limit);

  const users = await User.find({ _id: { $in: paginatedUserIds } })
    .select("firstName lastName email mobile")
    .lean();

  const usersData: RevenueDetailsUserRow[] = paginatedUserIds.map((userId) => {
    const user = users.find((u) => u._id.toString() === userId);
    const userEvents = userEventsMap.get(userId) || [];
    const purchases: RevenueDetailsPurchase[] = userEvents.map((event) => ({
      paymentEventId: event._id?.toString() ?? "",
      timestamp: event.timestamp instanceof Date ? event.timestamp.toISOString() : "",
      amount: event.data?.price || 0,
      packageId: event.packageId,
      packageName: event.packageName,
      billingReason: event.data?.billingReason,
    }));
    const totalContributed = purchases.reduce((sum, p) => sum + p.amount, 0);

    return {
      userId,
      userInfo: user
        ? {
            firstName: user.firstName || "",
            lastName: user.lastName || "",
            email: user.email || "",
            mobile: user.mobile || undefined,
          }
        : { firstName: "Unknown", lastName: "", email: "", mobile: undefined },
      purchases,
      totalContributed,
      purchaseCount: purchases.length,
    };
  });

  const totalPages = Math.ceil(totalUsers / limit);
  return {
    users: usersData,
    totalUsers,
    totalPurchases,
    totalRevenue,
    pagination: {
      currentPage: page,
      totalPages,
      totalCount: totalUsers,
      limit,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  };
}

/**
 * Returns the per-user contribution list for one revenue category within a date range.
 * Pure orchestration extracted from the admin revenue-details route.
 */
export async function getRevenueDetails(input: RevenueDetailsInput): Promise<RevenueDetailsData> {
  const { category, startDate, endDate, page, limit } = input;

  const eventQuery: Record<string, unknown> = {
    eventType: "BenefitsGranted",
    timestamp: { $gte: startDate, $lte: endDate },
  };

  if (category === "membership-purchase") {
    eventQuery.packageType = "membership";
    eventQuery["data.billingReason"] = { $ne: "subscription_cycle" };
  } else if (category === "membership-renewal") {
    eventQuery.packageType = "membership";
    eventQuery["data.billingReason"] = "subscription_cycle";
  } else if (category === "one-time-purchase") {
    eventQuery.packageType = "one-time";
    eventQuery.$or = [
      { packageId: { $regex: /-pack$/, $not: { $regex: /^additional-/ } } },
      { packageId: { $exists: false } },
      { packageId: "" },
    ];
  } else if (category === "additional-one-time") {
    eventQuery.packageType = "one-time";
    eventQuery.packageId = { $regex: /^additional-/ };
  } else if (category === "mini-draw") {
    eventQuery.packageType = "mini-draw";
  } else if (category === "upsell") {
    eventQuery.packageType = "upsell";
  } else if (category === "shop") {
    eventQuery.packageType = "shop";
  }

  const paymentEventsRaw = await fetchNetBenefitsGrantedWithMatch(eventQuery, {
    userId: 1,
    packageType: 1,
    packageId: 1,
    packageName: 1,
    data: 1,
    timestamp: 1,
    _id: 1,
  });
  const paymentEvents = [...paymentEventsRaw].sort(
    (a, b) => new Date(b.timestamp ?? 0).getTime() - new Date(a.timestamp ?? 0).getTime()
  );

  const { users, totalUsers, totalPurchases, totalRevenue, pagination } = await hydrateRevenueUserRows(
    paymentEvents,
    page,
    limit,
  );

  return { category, totalRevenue, totalPurchases, totalUsers, users, pagination };
}

/**
 * Resolves the AEST date-window for the admin revenue-details endpoint (matches admin dashboard
 * stats range semantics). Returns { ok: true, value } or { ok: false, error, status }.
 */
export function resolveRevenueDetailsRange(input: {
  dateRange: RevenueDetailsDateRange;
  startDateParam: string | null;
  endDateParam: string | null;
}):
  | { ok: true; value: { startDate: Date; endDate: Date } }
  | { ok: false; error: string; status: number } {
  const { dateRange, startDateParam, endDateParam } = input;

  const startOfToday = getStartOfTodayInAEST();
  const now = new Date();
  const todayYear = parseInt(formatInTimeZone(now, AEST_TIMEZONE, "yyyy"), 10);
  const todayMonth = parseInt(formatInTimeZone(now, AEST_TIMEZONE, "M"), 10);
  const todayDay = parseInt(formatInTimeZone(now, AEST_TIMEZONE, "d"), 10);
  const endOfToday = createAESTDateAsUTC(todayYear, todayMonth, todayDay, 23, 59);
  endOfToday.setUTCSeconds(59, 999);

  let startDate: Date;
  let endDate: Date = endOfToday;

  switch (dateRange) {
    case "today":
      startDate = startOfToday;
      endDate = endOfToday;
      break;
    case "yesterday": {
      const yesterdayStart = subDays(startOfToday, 1);
      startDate = yesterdayStart;
      endDate = new Date(startOfToday.getTime() - 1);
      break;
    }
    case "current-draw":
    case "last-draw": {
      if (!startDateParam || !endDateParam) {
        return { ok: false, error: "startDate and endDate are required for draw-based ranges", status: 400 };
      }
      const drawStartDateParsed = new Date(startDateParam);
      const drawEndDateParsed = new Date(endDateParam);
      const drawStartYear = parseInt(formatInTimeZone(drawStartDateParsed, AEST_TIMEZONE, "yyyy"), 10);
      const drawStartMonth = parseInt(formatInTimeZone(drawStartDateParsed, AEST_TIMEZONE, "M"), 10);
      const drawStartDay = parseInt(formatInTimeZone(drawStartDateParsed, AEST_TIMEZONE, "d"), 10);
      const drawEndYear = parseInt(formatInTimeZone(drawEndDateParsed, AEST_TIMEZONE, "yyyy"), 10);
      const drawEndMonth = parseInt(formatInTimeZone(drawEndDateParsed, AEST_TIMEZONE, "M"), 10);
      const drawEndDay = parseInt(formatInTimeZone(drawEndDateParsed, AEST_TIMEZONE, "d"), 10);
      startDate = createAESTDateAsUTC(drawStartYear, drawStartMonth, drawStartDay, 0, 0);
      const drawNextDayStart = createAESTDateAsUTC(drawEndYear, drawEndMonth, drawEndDay, 0, 0);
      const drawNextDay = new Date(drawNextDayStart);
      drawNextDay.setUTCDate(drawNextDay.getUTCDate() + 1);
      endDate = new Date(drawNextDay.getTime() - 1);
      break;
    }
    case "all-time": {
      startDate = getWebsiteLaunchDateUTC();
      endDate = endOfToday;
      break;
    }
    case "custom": {
      if (!startDateParam || !endDateParam) {
        return { ok: false, error: "startDate and endDate are required for custom range", status: 400 };
      }
      const startDateParsed = new Date(startDateParam);
      const endDateParsed = new Date(endDateParam);
      const startYear = parseInt(formatInTimeZone(startDateParsed, AEST_TIMEZONE, "yyyy"), 10);
      const startMonth = parseInt(formatInTimeZone(startDateParsed, AEST_TIMEZONE, "M"), 10);
      const startDay = parseInt(formatInTimeZone(startDateParsed, AEST_TIMEZONE, "d"), 10);
      const endYear = parseInt(formatInTimeZone(endDateParsed, AEST_TIMEZONE, "yyyy"), 10);
      const endMonth = parseInt(formatInTimeZone(endDateParsed, AEST_TIMEZONE, "M"), 10);
      const endDay = parseInt(formatInTimeZone(endDateParsed, AEST_TIMEZONE, "d"), 10);
      startDate = createAESTDateAsUTC(startYear, startMonth, startDay, 0, 0);
      const nextDayStart = createAESTDateAsUTC(endYear, endMonth, endDay, 0, 0);
      const nextDay = new Date(nextDayStart);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      endDate = new Date(nextDay.getTime() - 1);
      break;
    }
    default:
      startDate = startOfToday;
      endDate = endOfToday;
  }

  return { ok: true, value: { startDate, endDate } };
}

// ─── Upcoming renewals ───────────────────────────────────────────────────────

export const UPCOMING_RENEWALS_VALID_RANGES = [0, 3, 7, 27] as const;
export type UpcomingRenewalsRange = (typeof UPCOMING_RENEWALS_VALID_RANGES)[number];

export interface UpcomingRenewalRow {
  subscriptionId: string;
  customerId: string;
  customerEmail: string;
  customerName?: string;
  userId: string;
  renewalDate: string;
  renewalDateFormatted: string;
  amountCents: number;
  amountFormatted: string;
}

export interface UpcomingRenewalsData {
  renewals: UpcomingRenewalRow[];
  total: number;
  page: number;
  limit: number;
  totalRevenue: number;
}

export interface UpcomingRenewalsInput {
  range: UpcomingRenewalsRange;
  page: number;
  limit: number;
}

/**
 * Returns one page of upcoming renewals within the requested window (0 = today, 3/7 = next N days,
 * 27 = today through 27th 8pm AEST/AEDT). Pure orchestration extracted from the admin route.
 */
export async function getUpcomingRenewals(input: UpcomingRenewalsInput): Promise<UpcomingRenewalsData> {
  const { range, page, limit } = input;

  const now = new Date();
  let rangeStart: Date;
  let rangeEnd: Date;
  if (range === 0) {
    rangeStart = now;
    rangeEnd = getNextMidnightAEST();
  } else if (range === 27) {
    const window = getTodayThrough27thWindowUTC();
    rangeStart = window.startUTC;
    rangeEnd = window.endUTC;
  } else {
    rangeStart = now;
    rangeEnd = new Date(now.getTime() + range * 24 * 60 * 60 * 1000);
  }

  const filter = {
    ...getActiveSubscriptionFilter(),
    "subscription.endDate": { $gte: rangeStart, $lt: rangeEnd },
  };

  const [total, totalRevenueResult, users] = await Promise.all([
    User.countDocuments(filter),
    User.find(filter).select("subscription.packageId").lean(),
    User.find(filter)
      .select(
        "_id firstName lastName email stripeCustomerId stripeSubscriptionId subscription.packageId subscription.endDate"
      )
      .sort({ "subscription.endDate": 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
  ]);

  let totalRevenue = 0;
  for (const u of totalRevenueResult) {
    const packageId = u.subscription?.packageId as string | undefined;
    const pkg = packageId ? getPackageById(packageId) : undefined;
    if (pkg?.price != null) totalRevenue += pkg.price;
  }

  const renewals: UpcomingRenewalRow[] = users.map((u) => {
    const endDate = u.subscription?.endDate as Date | undefined;
    const renewalDate = endDate ? new Date(endDate) : new Date(0);
    const renewalDateValid = endDate && Number.isFinite(renewalDate.getTime());
    let renewalDateFormatted = "—";
    if (renewalDateValid && endDate) {
      try {
        renewalDateFormatted = formatDateInAEST(endDate, "MMM d, yyyy h:mm a");
      } catch {
        // ignore
      }
    }
    const packageId = u.subscription?.packageId as string | undefined;
    const pkg = packageId ? getPackageById(packageId) : undefined;
    const amountCents = pkg?.price != null ? Math.round(pkg.price * 100) : 0;
    const uid = (u._id as { toString: () => string }).toString();
    return {
      subscriptionId: (u.stripeSubscriptionId as string) || "",
      customerId: (u.stripeCustomerId as string) || "",
      customerEmail: u.email as string,
      customerName: [u.firstName, u.lastName].filter(Boolean).join(" ") || undefined,
      userId: uid,
      renewalDate: renewalDateValid ? renewalDate.toISOString() : "",
      renewalDateFormatted,
      amountCents,
      amountFormatted: new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(
        amountCents / 100
      ),
    };
  });

  return {
    renewals,
    total,
    page,
    limit,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
  };
}
