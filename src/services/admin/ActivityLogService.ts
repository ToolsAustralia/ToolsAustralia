import mongoose from "mongoose";
import User from "@/models/User";
import PaymentEvent from "@/models/PaymentEvent";
import MajorDraw from "@/models/MajorDraw";
import MiniDraw from "@/models/MiniDraw";
import Winner from "@/models/Winner";
import ReferralEvent from "@/models/ReferralEvent";
import CancellationFlowEvent from "@/models/CancellationFlowEvent";
import StaffActivity from "@/models/StaffActivity";
import AffiliatePayout from "@/models/AffiliatePayout";
import Affiliate from "@/models/Affiliate";

/**
 * Activity Log — paginated, filterable, searchable feed of admin/site activity.
 *
 * Differs from `getRecentActivities` (dashboard slice) in three ways:
 *   1. Time-windowed (90 days) rather than "top N from each source"
 *   2. Filterable by type + search
 *   3. High-value cutoff at $300 (PaymentEvent-based), not the Order-based >=200 path
 *
 * No Request/NextResponse types — pure orchestration consumed by both the admin
 * route and the Norm route.
 */

export type ActivityLogItemType =
  | "user_signup"
  | "membership_purchase"
  | "one_time_purchase"
  | "upsell_accepted"
  | "draw_complete"
  | "high_value_order"
  /** A merchandise order from the shop. */
  | "shop_order"
  | "system_alert"
  | "membership_upgrade"
  | "subscription_past_due"
  | "cancellation_offer_accepted"
  | "admin_role_update"
  | "affiliate_payout";

export type ActivityLogItemStatus = "success" | "info" | "warning" | "error";

export interface ActivityLogItem {
  id: string;
  type: ActivityLogItemType;
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
  status: ActivityLogItemStatus;
  amount?: number;
  timestamp: Date;
  /** For mini-draw purchases: link to /mini-draws/[id] */
  miniDrawId?: string;
}

export interface ActivityLogInput {
  /**
   * Keyset cursor from a previous page's `nextCursor` (`"<timestampMs>:<id>"`).
   * Omit / null for the first (newest) page. Keyset — not a numeric offset — so
   * rows inserted at the top of the feed between requests can't shift the window
   * (which is what caused duplicate rows under the old `page`/offset pagination).
   */
  cursor?: string | null;
  limit: number;
  typeFilter?: string | null;
  searchTerm?: string | null;
}

export interface ActivityLogPage {
  activities: ActivityLogItem[];
  pagination: {
    limit: number;
    /** Total matching rows across all pages (after type/search filters). */
    total: number;
    /** Keyset cursor to pass as `cursor` for the next (older) page; null when there are no more. */
    nextCursor: string | null;
    hasMore: boolean;
  };
}

/** Encode the keyset cursor for a row in the (timestamp DESC, id DESC) total order. */
function encodeActivityCursor(item: ActivityLogItem): string {
  return `${item.timestamp.getTime()}:${item.id}`;
}

/** Decode `"<timestampMs>:<id>"`. Returns null for a malformed cursor (treated as first page). */
function decodeActivityCursor(cursor: string): { ms: number; id: string } | null {
  const sep = cursor.indexOf(":");
  if (sep === -1) return null;
  const ms = Number(cursor.slice(0, sep));
  const id = cursor.slice(sep + 1);
  if (!Number.isFinite(ms) || !id) return null;
  return { ms, id };
}

/** Total-order comparator: timestamp DESC, then id DESC — a stable, unambiguous keyset order. */
export function compareActivitiesNewestFirst(a: ActivityLogItem, b: ActivityLogItem): number {
  const dt = b.timestamp.getTime() - a.timestamp.getTime();
  if (dt !== 0) return dt;
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0; // id DESC
}

/**
 * Keyset-paginate an already-sorted (`compareActivitiesNewestFirst`) list.
 *
 * Returns the window of rows strictly AFTER `cursor` in (timestamp, id) order. Because the
 * boundary is the cursor's *position in the sort order* — not a numeric offset — rows inserted
 * at the top of the feed between requests cannot shift the window, so consecutive pages never
 * overlap (the offset-drift duplicate-row bug this replaced) nor gap.
 */
export function paginateActivitiesByCursor(
  sorted: ActivityLogItem[],
  cursor: string | null,
  limit: number
): { rows: ActivityLogItem[]; nextCursor: string | null; hasMore: boolean } {
  const decoded = cursor ? decodeActivityCursor(cursor) : null;
  let windowStart = 0;
  if (decoded) {
    const idx = sorted.findIndex(
      (a) => a.timestamp.getTime() < decoded.ms || (a.timestamp.getTime() === decoded.ms && a.id < decoded.id)
    );
    windowStart = idx === -1 ? sorted.length : idx;
  }
  const rows = sorted.slice(windowStart, windowStart + limit);
  const hasMore = windowStart + limit < sorted.length;
  const nextCursor = hasMore && rows.length > 0 ? encodeActivityCursor(rows[rows.length - 1]) : null;
  return { rows, nextCursor, hasMore };
}

function getTimeAgo(date: Date): string {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) {
    return `${diffInSeconds} sec ago`;
  } else if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60);
    return `${minutes} min ago`;
  } else if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  } else {
    const days = Math.floor(diffInSeconds / 86400);
    return `${days} day${days > 1 ? "s" : ""} ago`;
  }
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
 * Returns one page of the admin activity log. Collects candidate rows from the
 * last 90 days across signups / payments / subscription changes / completed
 * major draws, optionally filters by type / search term, sorts by timestamp
 * descending, and paginates.
 */
export async function getActivityLog(input: ActivityLogInput): Promise<ActivityLogPage> {
  const { cursor, limit, typeFilter, searchTerm } = input;
  const search = (searchTerm || "").toLowerCase();

  const activities: ActivityLogItem[] = [];
  const now = new Date();
  const startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  // ─── User signups ──────────────────────────────────────────────────────────
  const signups = await User.find({
    createdAt: { $gte: startDate },
    isActive: true,
  })
    .sort({ createdAt: -1 })
    .select("firstName lastName email createdAt _id affiliateReferral");

  const userIds = signups.map((user) => new mongoose.Types.ObjectId(user._id));
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

  signups.forEach((user) => {
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

  // ─── Payment events ────────────────────────────────────────────────────────
  const payments = await PaymentEvent.find({
    eventType: "BenefitsGranted",
    timestamp: { $gte: startDate },
  })
    .sort({ timestamp: -1 })
    .lean();

  const paymentUserIds = [
    ...new Set(payments.map((p) => (p.userId as mongoose.Types.ObjectId).toString())),
  ];
  const paymentUsers = await User.find({ _id: { $in: paymentUserIds } })
    .select("firstName lastName email subscription")
    .lean();

  const userMap = new Map(paymentUsers.map((u) => [u._id.toString(), u]));

  const rawMiniDrawIds = [
    ...new Set(
      payments
        .filter((p) => p.packageType === "mini-draw")
        .map((p) => (p.data as Record<string, unknown>)?.miniDrawId as string)
        .filter(Boolean)
    ),
  ];
  const validMiniDrawIds = rawMiniDrawIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
  const miniDraws =
    validMiniDrawIds.length > 0
      ? await MiniDraw.find({ _id: { $in: validMiniDrawIds } })
          .select("_id name")
          .lean()
      : [];
  type MiniDrawLean = { _id: mongoose.Types.ObjectId; name: string };
  const miniDrawMap = new Map<string, string>(
    (miniDraws as unknown as MiniDrawLean[]).map((d) => [d._id.toString(), d.name])
  );

  payments.forEach((payment) => {
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
    let type: ActivityLogItemType = "one_time_purchase";

    if (payment.packageType === "membership") {
      const billingReason = paymentData?.billingReason as string | undefined;
      let isRenewal = billingReason === "subscription_cycle";

      // Fallback heuristic for legacy events that lack billingReason
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
      action = `Accepted upsell: ${packageName}`;
      type = "upsell_accepted";
    } else if (payment.packageType === "shop") {
      // `packageId` is the ORDER NUMBER for a shop payment (finalizeShopOrder passes
      // order.orderNumber), which is the identifier staff search by.
      action = `Ordered merchandise (${payment.packageId ?? packageName})`;
      type = "shop_order";
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

    // An accepted upsell is more informative than the generic high-value flag, so it
    // takes precedence over the >= $300 override — and so does a shop order, for the
    // same reason: "High-value purchase: Ordered merchandise (SHOP-…)" buries the one
    // fact that makes the row actionable behind a label that says less.
    if (amount >= 300 && type !== "upsell_accepted" && type !== "shop_order") {
      type = "high_value_order";
      action = `High-value purchase: ${action} - $${amount}`;
    }

    const activityPayload: ActivityLogItem = {
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
      if (miniDrawId && miniDrawMap.has(miniDrawId)) {
        activityPayload.miniDrawId = miniDrawId;
      }
    }
    activities.push(activityPayload);
  });

  // ─── Subscription changes ──────────────────────────────────────────────────
  const usersWithChanges = await User.find({
    $or: [
      { "subscription.lastUpgradeDate": { $gte: startDate } },
      { "subscription.lastDowngradeDate": { $gte: startDate } },
      { "subscription.cancelledAt": { $gte: startDate } },
      { "subscription.pastDueAt": { $gte: startDate } },
    ],
    isActive: true,
  })
    .sort({
      "subscription.lastUpgradeDate": -1,
      "subscription.lastDowngradeDate": -1,
      "subscription.cancelledAt": -1,
      "subscription.pastDueAt": -1,
    })
    .select("firstName lastName email subscription");

  usersWithChanges.forEach((user) => {
    if (!user.subscription) return;

    if (user.subscription.lastUpgradeDate && user.subscription.lastUpgradeDate >= startDate) {
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

    if (user.subscription.lastDowngradeDate && user.subscription.lastDowngradeDate >= startDate) {
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
      user.subscription.cancelledAt >= startDate &&
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

    if (user.subscription.pastDueAt && user.subscription.pastDueAt >= startDate) {
      const timeAgo = getTimeAgo(user.subscription.pastDueAt);
      const packageName = getPackageName(user.subscription.packageId || "Unknown");

      activities.push({
        id: `past-due-${user._id}-${user.subscription.pastDueAt.getTime()}`,
        type: "subscription_past_due",
        user: `${user.firstName} ${user.lastName}`,
        firstName: user.firstName || null,
        userId: user._id.toString(),
        action: `Membership renewal failed — ${packageName}`,
        time: timeAgo,
        status: "error",
        timestamp: user.subscription.pastDueAt,
      });
    }
  });

  // ─── Completed major draws ─────────────────────────────────────────────────
  const completedDraws = await MajorDraw.find({
    status: "completed",
    updatedAt: { $gte: startDate },
  })
    .sort({ updatedAt: -1 })
    .select("name updatedAt _id")
    .lean();

  const drawIds = completedDraws.map((draw) => draw._id);
  const winners = await Winner.find({ drawId: { $in: drawIds }, drawType: "major" })
    .select("drawId")
    .lean();
  const drawsWithWinners = new Set(
    winners.map((w: { drawId: { toString(): string } }) => w.drawId.toString())
  );

  completedDraws.forEach((draw) => {
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

  // ─── Cancellation-flow acceptances ─────────────────────────────────────────
  // Members who accepted a retention offer instead of cancelling.
  const cancellationSaves = await CancellationFlowEvent.find({
    outcome: "saved",
    offerAccepted: { $ne: null },
    savedAt: { $gte: startDate },
  }).lean();

  if (cancellationSaves.length > 0) {
    const saveUserIds = [
      ...new Set(
        cancellationSaves
          .map((e) => (e.userId ? (e.userId as mongoose.Types.ObjectId).toString() : null))
          .filter((id): id is string => Boolean(id))
      ),
    ];
    const saveUsers = await User.find({ _id: { $in: saveUserIds } })
      .select("firstName lastName")
      .lean();
    const saveUserMap = new Map(saveUsers.map((u) => [u._id.toString(), u]));

    const offerActionMap: Record<string, string> = {
      bonus_entries_100: "Accepted 100 free entries to stay",
      discount_50_2mo: "Accepted 50% off for 2 months",
      pause_30d: "Paused membership for 30 days",
      tier_downgrade: "Downgraded instead of cancelling",
      unsubscribe_marketing: "Unsubscribed from marketing to stay",
    };

    cancellationSaves.forEach((evt) => {
      if (!evt.savedAt || !evt.offerAccepted) return;
      const userId = evt.userId ? (evt.userId as mongoose.Types.ObjectId).toString() : undefined;
      const userDoc = userId ? saveUserMap.get(userId) : undefined;
      const action = offerActionMap[evt.offerAccepted] || `Accepted retention offer: ${evt.offerAccepted}`;

      activities.push({
        id: `cancel-save-${evt._id}`,
        type: "cancellation_offer_accepted",
        user: userDoc ? `${userDoc.firstName} ${userDoc.lastName}` : "Unknown User",
        firstName: userDoc?.firstName ?? null,
        userId,
        action,
        time: getTimeAgo(evt.savedAt),
        status: "success",
        timestamp: evt.savedAt,
      });
    });
  }

  // ─── Admin role updates ────────────────────────────────────────────────────
  // Staff-member edits made through PATCH /api/admin/staff/*.
  const staffRoleUpdates = await StaffActivity.find({
    action: "settings.edit",
    method: "PATCH",
    path: { $regex: /^\/api\/admin\/staff\// },
    status: 200,
    timestamp: { $gte: startDate },
  }).lean();

  staffRoleUpdates.forEach((evt) => {
    activities.push({
      id: `staff-role-${evt._id}`,
      type: "admin_role_update",
      user: evt.actorEmail,
      firstName: null,
      action: `${evt.actorEmail} updated a staff member`,
      time: getTimeAgo(evt.timestamp),
      status: "info",
      timestamp: evt.timestamp,
    });
  });

  // ─── Affiliate payouts ─────────────────────────────────────────────────────
  // Committed affiliate payouts (totalAmount stored in cents).
  const affiliatePayouts = await AffiliatePayout.find({
    paidAt: { $gte: startDate },
  }).lean();

  if (affiliatePayouts.length > 0) {
    const payoutAffiliateIds = [
      ...new Set(
        affiliatePayouts
          .map((p) => (p.affiliateId ? (p.affiliateId as mongoose.Types.ObjectId).toString() : null))
          .filter((id): id is string => Boolean(id))
      ),
    ];
    const affiliates = await Affiliate.find({ _id: { $in: payoutAffiliateIds } })
      .select("name")
      .lean();
    const affiliateMap = new Map(affiliates.map((a) => [a._id.toString(), a]));

    affiliatePayouts.forEach((payout) => {
      if (!payout.paidAt) return;
      const affiliateId = payout.affiliateId
        ? (payout.affiliateId as mongoose.Types.ObjectId).toString()
        : undefined;
      const affiliateDoc = affiliateId ? affiliateMap.get(affiliateId) : undefined;
      const commissionCount = payout.commissionCount ?? 0;

      activities.push({
        id: `affiliate-payout-${payout._id}`,
        type: "affiliate_payout",
        user: affiliateDoc?.name || "Unknown Affiliate",
        firstName: null,
        action: `Affiliate payout: ${commissionCount} commissions paid`,
        time: getTimeAgo(payout.paidAt),
        status: "success",
        amount: (payout.totalAmount ?? 0) / 100,
        timestamp: payout.paidAt,
      });
    });
  }

  // ─── Sort (deterministic total order), filter, keyset-paginate ─────────────
  activities.sort(compareActivitiesNewestFirst);

  let filteredActivities = activities;
  if (typeFilter) {
    filteredActivities = filteredActivities.filter((a) => a.type === typeFilter);
  }
  if (search) {
    filteredActivities = filteredActivities.filter(
      (a) => a.user.toLowerCase().includes(search) || a.action.toLowerCase().includes(search)
    );
  }

  const total = filteredActivities.length;
  const { rows, nextCursor, hasMore } = paginateActivitiesByCursor(filteredActivities, cursor ?? null, limit);

  return {
    activities: rows,
    pagination: { limit, total, nextCursor, hasMore },
  };
}
