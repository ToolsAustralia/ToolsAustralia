import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import User, { IUser } from "@/models/User";
import PaymentEvent from "@/models/PaymentEvent";
import MajorDraw from "@/models/MajorDraw";
import MiniDraw from "@/models/MiniDraw";
import Order from "@/models/Order";
import ReferralEvent from "@/models/ReferralEvent";
import { REFERRAL_CONSTANTS } from "@/lib/referral";
import mongoose from "mongoose";
import { getPackageById } from "@/data/membershipPackages";
import { getMiniDrawPackageById } from "@/data/miniDrawPackages";
import { adminUserUpdateSchema } from "@/utils/validation/admin-user-update";
import type { AdminUserUpdatePayload } from "@/types/admin";
import { rewardsEnabled } from "@/config/featureFlags";
import { rewardsDisabledMessage } from "@/config/rewardsSettings";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/users/[id]
 * Get detailed user profile with all related data
 *
 * Returns comprehensive user information including:
 * - Basic profile data
 * - Subscription details and history
 * - Purchase history (orders, packages, upsells)
 * - Major draw entries and participation
 * - Partner discount queue status
 * - Rewards points and redemption history
 * - Computed metrics (LTV, total orders, etc.)
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await connectDB();

    // Guard: ensure only admins can load detailed user records
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: userId } = await params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
    }

    console.log("📊 Fetching detailed user profile:", userId);

    const userProfile = await buildAdminUserProfile(userId);

    if (!userProfile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: userProfile,
    });
  } catch (error) {
    console.error("❌ Error fetching user detail:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch user details",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/users/[id]
 * Update specific sections of the user profile from the admin dashboard.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    await connectDB();

    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.user.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: userId } = await params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
    }

    const rawPayload = await request.json();
    const parsedPayload = adminUserUpdateSchema.safeParse(rawPayload);

    if (!parsedPayload.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          issues: parsedPayload.error.issues,
        },
        { status: 400 }
      );
    }

    const payload = parsedPayload.data;

    const rewardsUpdateRequested =
      !!payload.rewards &&
      ["rewardsPoints", "accumulatedEntries", "entryWallet"].some(
        (key) => payload.rewards?.[key as keyof typeof payload.rewards] !== undefined
      );

    if (!rewardsEnabled() && rewardsUpdateRequested) {
      return NextResponse.json(
        {
          success: false,
          error: rewardsDisabledMessage(),
          code: "REWARDS_PAUSED",
        },
        { status: 503 }
      );
    }

    const dbSession = await mongoose.startSession();
    let userMissing = false;
    let transactionError: unknown;

    try {
      await dbSession.withTransaction(async () => {
        const user = await User.findById(userId).session(dbSession);

        if (!user) {
          userMissing = true;
          throw new Error("User not found");
        }

        // Apply each optional update block only when provided
        applyBasicInfoUpdate(user, payload.basicInfo);
        applySubscriptionUpdate(user, payload.subscription);
        applyRewardsUpdate(user, payload.rewards);

        if (payload.oneTimePackages) {
          applyOneTimePackagesUpdate(user, payload.oneTimePackages);
        }

        if (payload.miniDrawPackages) {
          applyMiniDrawPackagesUpdate(user, payload.miniDrawPackages);
        }

        if (payload.partnerDiscountQueue) {
          applyPartnerDiscountUpdate(user, payload.partnerDiscountQueue);
        }

        if (payload.majorDrawParticipation) {
          await syncMajorDrawParticipation(userId, payload.majorDrawParticipation, dbSession);
        }

        if (payload.miniDrawParticipation) {
          await syncMiniDrawParticipation(user, userId, payload.miniDrawParticipation, dbSession);
        }

        await user.save({ session: dbSession, validateModifiedOnly: true });
      });
    } catch (error) {
      transactionError = error;
    } finally {
      await dbSession.endSession();
    }

    if (userMissing) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    if (transactionError) {
      throw transactionError;
    }

    const updatedProfile = await buildAdminUserProfile(userId);

    if (!updatedProfile) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: updatedProfile,
    });
  } catch (error) {
    console.error("❌ Error updating user detail:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Failed to update user",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * Calculate engagement score based on user activity
 * Higher score = more engaged user
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function calculateEngagementScore(user: any, paymentEvents: any[], majorDrawParticipation: any[]): number {
  let score = 0;

  // Base score for account setup
  if (user.profileSetupCompleted) score += 10;
  if (user.isEmailVerified) score += 5;
  if (user.isMobileVerified) score += 5;

  // Activity score
  if (user.lastLogin) {
    const daysSinceLogin = Math.floor(
      (Date.now() - new Date(user.lastLogin as string).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSinceLogin <= 7) score += 20;
    else if (daysSinceLogin <= 30) score += 10;
    else if (daysSinceLogin <= 90) score += 5;
  }

  // Purchase activity
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const purchaseCount = paymentEvents.filter((e: any) => e.eventType === "BenefitsGranted").length;
  score += Math.min(purchaseCount * 5, 50); // Max 50 points for purchases

  // Major draw participation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalDrawEntries = majorDrawParticipation.reduce((sum: number, draw: any) => sum + (draw.totalEntries || 0), 0);
  score += Math.min(totalDrawEntries * 2, 30); // Max 30 points for draw entries

  // Subscription activity
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((user as any).subscription?.isActive) score += 15;

  // One-time packages
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((user as any).oneTimePackages?.length > 0) score += 10;

  // Upsell engagement
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ((user as any).upsellStats?.totalAccepted > 0) score += 10;

  return Math.min(score, 100); // Cap at 100
}

async function buildAdminUserProfile(userId: string) {
  const user = await User.findById(userId)
    .select("-password -emailVerificationToken -passwordResetToken -smsOtpCode")
    .lean();

  if (!user) {
    return null;
  }

  const resolveMembershipPackageName = (packageId?: unknown, fallback?: string | null) => {
    if (!packageId) return fallback ?? null;
    const id = packageId.toString();
    return getPackageById(id)?.name ?? fallback ?? id;
  };

  const resolveMiniPackageName = (packageId?: unknown, fallback?: string | null) => {
    if (!packageId) return fallback ?? null;
    const id = packageId.toString();
    return getMiniDrawPackageById(id)?.name ?? fallback ?? id;
  };

  const paymentEvents = await PaymentEvent.find({
    userId: new mongoose.Types.ObjectId(userId),
  })
    .sort({ timestamp: -1 })
    .lean();

  const orders = await Order.find({
    user: new mongoose.Types.ObjectId(userId),
  })
    .populate("products.product", "name price")
    .populate("tickets.miniDrawId", "name")
    .sort({ createdAt: -1 })
    .lean();

  const majorDraws = await MajorDraw.find({
    "entries.userId": new mongoose.Types.ObjectId(userId),
  })
    .select("name title status endDate entries")
    .lean<
      {
        _id: mongoose.Types.ObjectId;
        name?: string;
        title?: string;
        status?: string;
        endDate?: Date;
        entries: Array<{
          userId: mongoose.Types.ObjectId;
          totalEntries?: number;
          quantity?: number;
          entriesBySource?: Record<string, number>;
          firstAddedDate?: Date;
          lastUpdatedDate?: Date;
        }>;
      }[]
    >();

  const totalSpent = paymentEvents
    .filter((event) => event.eventType === "BenefitsGranted")
    .reduce((sum, event) => sum + (event.data?.price || 0), 0);

  const totalOrders = orders.length;
  const totalOrderValue = orders.reduce((sum, order) => sum + order.totalAmount, 0);

  const miniDrawIds = (user.miniDrawParticipation || [])
    .map((participation) => participation.miniDrawId?.toString())
    .filter((id): id is string => Boolean(id));

  const miniDrawDocs = miniDrawIds.length
    ? await MiniDraw.find({ _id: { $in: miniDrawIds } })
        .select("name status totalEntries minimumEntries")
        .lean<
          {
            _id: mongoose.Types.ObjectId;
            name?: string;
            status?: string;
            totalEntries?: number;
            minimumEntries?: number;
          }[]
        >()
    : [];

  const miniDrawDocMap = new Map(miniDrawDocs.map((doc) => [doc._id.toString(), doc]));

  const majorDrawParticipation = majorDraws.map((draw) => {
    const userEntries =
      draw.entries?.filter((entry: { userId: { toString: () => string } }) => entry.userId.toString() === userId) || [];
    const totalEntries = userEntries.reduce(
      (sum: number, entry: { totalEntries?: number }) => sum + (entry.totalEntries ?? 0),
      0
    );

    return {
      drawId: draw._id,
      title: draw.title || draw.name || draw._id.toString(),
      status: draw.status,
      endDate: draw.endDate,
      totalEntries,
      entries: userEntries,
    };
  });

  const currentMajorDraw = majorDraws.find((draw) => draw.status === "active");
  const currentDrawEntries = currentMajorDraw
    ? currentMajorDraw.entries
        ?.filter((entry: { userId: { toString: () => string } }) => entry.userId.toString() === userId)
        .reduce((sum: number, entry: { totalEntries?: number }) => sum + (entry.totalEntries ?? 0), 0) || 0
    : 0;

  const subscriptionHistory = paymentEvents
    .filter((event) => event.packageType === "subscription")
    .map((event) => ({
      timestamp: event.timestamp,
      packageId: event.data?.packageId,
      packageName: resolveMembershipPackageName(event.data?.packageId, event.data?.packageName ?? null),
      price: event.data?.price,
      status: event.eventType,
    }));

  const oneTimePackageHistory = paymentEvents
    .filter((event) => event.packageType === "one-time")
    .map((event) => ({
      timestamp: event.timestamp,
      packageId: event.data?.packageId,
      packageName: resolveMembershipPackageName(event.data?.packageId, event.data?.packageName ?? null),
      price: event.data?.price,
      entries: event.data?.entries,
    }));

  const upsellHistory = paymentEvents
    .filter((event) => event.packageType === "upsell")
    .map((event) => ({
      timestamp: event.timestamp,
      offerId: event.data?.offerId,
      offerTitle: event.data?.offerTitle,
      price: event.data?.price,
      entries: event.data?.entries,
    }));

  const miniDrawHistory = paymentEvents
    .filter((event) => event.packageType === "mini-draw")
    .map((event) => ({
      timestamp: event.timestamp,
      packageId: event.data?.packageId,
      packageName: resolveMiniPackageName(event.data?.packageId, event.data?.packageName ?? null),
      price: event.data?.price,
      entries: event.data?.entries,
    }));

  const activePartnerDiscount = user.partnerDiscountQueue?.find((discount) => discount.status === "active");
  const queuedPartnerDiscounts = user.partnerDiscountQueue?.filter((discount) => discount.status === "queued") || [];

  const redemptionHistory = user.redemptionHistory || [];

  const daysSinceLastLogin = user.lastLogin
    ? Math.floor((Date.now() - new Date(user.lastLogin).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const accountAge = Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24));

  const userObjectId = new mongoose.Types.ObjectId(userId);
  const referralEvents = await ReferralEvent.find({
    $or: [{ referrerId: userObjectId }, { inviteeUserId: userObjectId }],
  })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  const referralSummary = {
    code: user.referral?.code ?? null,
    successfulConversions: user.referral?.successfulConversions ?? 0,
    totalEntriesAwarded: user.referral?.totalEntriesAwarded ?? 0,
    pendingCount: referralEvents.filter((event) => event.status === "pending").length,
    history: referralEvents.map((event) => {
      const isReferrer = event.referrerId?.toString() === userObjectId.toString();
      return {
        id: event._id.toString(),
        referralCode: event.referralCode,
        status: event.status,
        role: (isReferrer ? "referrer" : "friend") as "referrer" | "friend",
        friendEmail: isReferrer ? event.inviteeEmail : undefined,
        conversionDate: event.conversionDate ? new Date(event.conversionDate).toISOString() : undefined,
        createdAt: event.createdAt ? new Date(event.createdAt).toISOString() : new Date().toISOString(),
        entriesAwarded: isReferrer
          ? event.referrerEntriesAwarded ?? REFERRAL_CONSTANTS.rewardEntries
          : event.referreeEntriesAwarded ?? REFERRAL_CONSTANTS.rewardEntries,
      };
    }),
  };

  return {
    id: user._id,
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
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastLogin: user.lastLogin,
    subscription: user.subscription
      ? {
          packageId: user.subscription.packageId,
          packageName: resolveMembershipPackageName(user.subscription.packageId),
          isActive: user.subscription.isActive,
          startDate: user.subscription.startDate,
          endDate: user.subscription.endDate,
          status: user.subscription.status,
          autoRenew: user.subscription.autoRenew,
          previousSubscription: user.subscription.previousSubscription,
          pendingChange: user.subscription.pendingChange,
          lastDowngradeDate: user.subscription.lastDowngradeDate,
          lastUpgradeDate: user.subscription.lastUpgradeDate,
        }
      : null,
    oneTimePackages: (user.oneTimePackages || []).map((pkg) => ({
      ...pkg,
      packageName: resolveMembershipPackageName(pkg.packageId),
    })),
    miniDrawPackages: user.miniDrawPackages || [],
    rewardsPoints: user.rewardsPoints || 0,
    accumulatedEntries: user.accumulatedEntries || 0,
    entryWallet: user.entryWallet || 0,
    partnerDiscountQueue: user.partnerDiscountQueue || [],
    activePartnerDiscount,
    queuedPartnerDiscounts,
    upsellPurchases: user.upsellPurchases || [],
    upsellHistory,
    upsellStats: user.upsellStats || null,
    redemptionHistory,
    statistics: {
      totalSpent,
      totalOrders,
      totalOrderValue,
      currentDrawEntries,
      accountAge,
      daysSinceLastLogin,
      lifetimeValue: totalSpent,
      averageOrderValue: totalOrders > 0 ? totalOrderValue / totalOrders : 0,
      engagementScore: calculateEngagementScore(user, paymentEvents, majorDrawParticipation),
    },
    subscriptionHistory,
    oneTimePackageHistory,
    miniDrawHistory,
    majorDrawParticipation,
    miniDrawParticipation: (user.miniDrawParticipation || []).map((participation) => {
      const miniDrawId = participation.miniDrawId?.toString();
      const doc = miniDrawId ? miniDrawDocMap.get(miniDrawId) : undefined;

      return {
        ...participation,
        miniDrawName: doc?.name || miniDrawId,
        miniDrawStatus: doc?.status || (participation.isActive ? "active" : "inactive"),
        entriesRemaining:
          doc && typeof doc.minimumEntries === "number" && typeof doc.totalEntries === "number"
            ? Math.max(doc.minimumEntries - doc.totalEntries, 0)
            : undefined,
      };
    }),
    orders,
    paymentEvents: paymentEvents.slice(0, 50),
    referral: referralSummary,
  };
}

function applyBasicInfoUpdate(user: IUser, basicInfo?: AdminUserUpdatePayload["basicInfo"]) {
  if (!basicInfo) return;

  if (basicInfo.firstName !== undefined) {
    user.firstName = basicInfo.firstName.trim();
  }

  if (basicInfo.lastName !== undefined) {
    user.lastName = basicInfo.lastName.trim();
  }

  if (basicInfo.email !== undefined) {
    user.email = basicInfo.email.toLowerCase();
  }

  if (basicInfo.mobile !== undefined) {
    user.mobile = basicInfo.mobile.replace(/\s+/g, "");
  }

  if (basicInfo.state !== undefined) {
    user.state = basicInfo.state.toUpperCase();
  }

  if (basicInfo.role !== undefined) {
    user.role = basicInfo.role;
  }

  if (basicInfo.isActive !== undefined) {
    user.isActive = basicInfo.isActive;
  }

  if (basicInfo.isEmailVerified !== undefined) {
    user.isEmailVerified = basicInfo.isEmailVerified;
  }

  if (basicInfo.isMobileVerified !== undefined) {
    user.isMobileVerified = basicInfo.isMobileVerified;
  }

  if (basicInfo.profileSetupCompleted !== undefined) {
    user.profileSetupCompleted = basicInfo.profileSetupCompleted;
  }
}

function applySubscriptionUpdate(user: IUser, subscription?: AdminUserUpdatePayload["subscription"]) {
  if (subscription === undefined) return;

  if (subscription === null) {
    user.subscription = undefined;
    user.markModified("subscription");
    return;
  }

  if (!user.subscription) {
    user.subscription = {
      packageId: subscription.packageId || "",
      startDate: subscription.startDate ? new Date(subscription.startDate) : new Date(),
      endDate: subscription.endDate ? new Date(subscription.endDate) : undefined,
      isActive: subscription.isActive ?? false,
      autoRenew: subscription.autoRenew ?? true,
      status: subscription.status ?? "incomplete",
    };
    return;
  }

  if (subscription.packageId !== undefined) {
    user.subscription.packageId = subscription.packageId;
  }

  if (subscription.status !== undefined) {
    user.subscription.status = subscription.status;
  }

  if (subscription.isActive !== undefined) {
    user.subscription.isActive = subscription.isActive;
  }

  if (subscription.autoRenew !== undefined) {
    user.subscription.autoRenew = subscription.autoRenew;
  }

  if (subscription.startDate !== undefined) {
    user.subscription.startDate = new Date(subscription.startDate);
  }

  if (subscription.endDate !== undefined) {
    user.subscription.endDate = new Date(subscription.endDate);
  }

  if (subscription.lastDowngradeDate !== undefined) {
    user.subscription.lastDowngradeDate = new Date(subscription.lastDowngradeDate);
  }

  if (subscription.lastUpgradeDate !== undefined) {
    user.subscription.lastUpgradeDate = new Date(subscription.lastUpgradeDate);
  }

  user.markModified("subscription");
}

function applyRewardsUpdate(user: IUser, rewards?: AdminUserUpdatePayload["rewards"]) {
  if (!rewards) return;

  if (rewards.rewardsPoints !== undefined) {
    user.rewardsPoints = rewards.rewardsPoints;
  }

  if (rewards.accumulatedEntries !== undefined) {
    user.accumulatedEntries = rewards.accumulatedEntries;
  }

  if (rewards.entryWallet !== undefined) {
    user.entryWallet = rewards.entryWallet;
  }
}

function applyOneTimePackagesUpdate(user: IUser, packages: NonNullable<AdminUserUpdatePayload["oneTimePackages"]>) {
  // We rebuild the one-time package list from the payload while keeping any missing optional fields intact.
  const existingMap = new Map((user.oneTimePackages || []).map((pkg) => [pkg.packageId?.toString(), pkg]));

  const normalisedPackages = packages.map((pkg) => ({
    packageId: pkg.packageId,
    purchaseDate: pkg.purchaseDate
      ? new Date(pkg.purchaseDate)
      : existingMap.get(pkg.packageId)?.purchaseDate || new Date(),
    startDate: new Date(pkg.startDate),
    endDate: new Date(pkg.endDate),
    isActive: pkg.isActive,
    entriesGranted: pkg.entriesGranted,
  }));

  user.oneTimePackages = normalisedPackages;
  user.markModified("oneTimePackages");
}

function applyMiniDrawPackagesUpdate(user: IUser, packages: NonNullable<AdminUserUpdatePayload["miniDrawPackages"]>) {
  // Packages are keyed by their Stripe payment intent so we can safely merge optional fields.
  const existingMap = new Map(
    (user.miniDrawPackages || []).map((pkg) => [
      pkg.stripePaymentIntentId || `${pkg.packageId}-${pkg.startDate?.toISOString()}`,
      pkg,
    ])
  );

  const normalisedPackages = packages.map((pkg) => {
    const mapKey = pkg.stripePaymentIntentId || `${pkg.packageId}-${pkg.startDate}`;
    const previous = existingMap.get(mapKey);

    return {
      packageId: pkg.packageId,
      packageName: pkg.packageName,
      miniDrawId: pkg.miniDrawId ? new mongoose.Types.ObjectId(pkg.miniDrawId) : undefined,
      purchaseDate: new Date(pkg.purchaseDate),
      startDate: new Date(pkg.startDate),
      endDate: new Date(pkg.endDate),
      isActive: pkg.isActive,
      entriesGranted: pkg.entriesGranted,
      price: pkg.price,
      partnerDiscountHours: pkg.partnerDiscountHours ?? previous?.partnerDiscountHours ?? 0,
      partnerDiscountDays: pkg.partnerDiscountDays ?? previous?.partnerDiscountDays ?? 0,
      stripePaymentIntentId: pkg.stripePaymentIntentId,
    };
  });

  user.miniDrawPackages = normalisedPackages;
  user.markModified("miniDrawPackages");
}

function applyPartnerDiscountUpdate(user: IUser, updates: NonNullable<AdminUserUpdatePayload["partnerDiscountQueue"]>) {
  if (!user.partnerDiscountQueue || user.partnerDiscountQueue.length === 0) {
    return;
  }

  const statusMap = new Map<string, NonNullable<AdminUserUpdatePayload["partnerDiscountQueue"]>[number]["status"]>(
    updates.map((item) => [item.queueId, item.status])
  );

  user.partnerDiscountQueue = user.partnerDiscountQueue.map((queueItem) => {
    const key = queueItem._id?.toString();
    if (!key) return queueItem;

    const nextStatus = statusMap.get(key);
    if (!nextStatus) return queueItem;

    return {
      ...queueItem,
      status: nextStatus,
    };
  });

  user.markModified("partnerDiscountQueue");
}

async function syncMajorDrawParticipation(
  userId: string,
  updates: NonNullable<AdminUserUpdatePayload["majorDrawParticipation"]>,
  session: mongoose.ClientSession
) {
  const now = new Date();

  for (const participation of updates) {
    const draw = await MajorDraw.findById(participation.drawId).session(session);

    if (!draw) {
      throw new Error(`Major draw ${participation.drawId} not found`);
    }

    const entries = (draw.entries || []) as Array<{
      userId: mongoose.Types.ObjectId;
      totalEntries?: number;
      entriesBySource?: Record<string, number>;
      firstAddedDate?: Date;
      lastUpdatedDate?: Date;
    }>;

    const existingIndex = entries.findIndex((entry) => entry.userId.toString() === userId);

    if (participation.totalEntries === 0) {
      if (existingIndex !== -1) {
        entries.splice(existingIndex, 1);
        draw.entries = entries as typeof draw.entries;
        draw.markModified("entries");
        await draw.save({ session });
      }
      continue;
    }

    const previousEntry = existingIndex !== -1 ? entries[existingIndex] : undefined;
    const payload = {
      userId: new mongoose.Types.ObjectId(userId),
      totalEntries: participation.totalEntries,
      entriesBySource: {
        ...(previousEntry?.entriesBySource ?? {}),
        membership: participation.totalEntries,
      },
      firstAddedDate: previousEntry?.firstAddedDate ?? now,
      lastUpdatedDate: now,
    };

    if (existingIndex === -1) {
      entries.push(payload);
    } else {
      entries[existingIndex] = {
        ...previousEntry,
        ...payload,
      };
    }

    draw.entries = entries as typeof draw.entries;
    draw.markModified("entries");
    await draw.save({ session });
  }
}

async function syncMiniDrawParticipation(
  user: IUser,
  userId: string,
  updates: NonNullable<AdminUserUpdatePayload["miniDrawParticipation"]>,
  session: mongoose.ClientSession
) {
  const now = new Date();
  const nextUserParticipation: typeof user.miniDrawParticipation = [];
  const existingParticipationMap = new Map(
    (user.miniDrawParticipation || []).map((entry) => [entry.miniDrawId?.toString(), entry])
  );

  for (const participation of updates) {
    const miniDraw = await MiniDraw.findById(participation.miniDrawId).session(session);

    if (!miniDraw) {
      throw new Error(`Mini draw ${participation.miniDrawId} not found`);
    }

    const entries = (miniDraw.entries || []) as Array<{
      userId: mongoose.Types.ObjectId;
      totalEntries: number;
      entriesBySource?: Record<string, number>;
      firstAddedDate?: Date;
      lastUpdatedDate?: Date;
    }>;

    const existingIndex = entries.findIndex((entry) => entry.userId.toString() === userId);
    const miniDrawObjectId = new mongoose.Types.ObjectId(participation.miniDrawId);

    if (participation.totalEntries === 0) {
      if (existingIndex !== -1) {
        entries.splice(existingIndex, 1);
        miniDraw.entries = entries as typeof miniDraw.entries;
        miniDraw.markModified("entries");
        await miniDraw.save({ session });
      }
      continue;
    }

    const previousDrawEntry = existingIndex !== -1 ? entries[existingIndex] : undefined;
    const entriesPayload = {
      userId: new mongoose.Types.ObjectId(userId),
      totalEntries: participation.totalEntries,
      entriesBySource: {
        ...(previousDrawEntry?.entriesBySource ?? {}),
        "mini-draw-package": participation.totalEntries,
      },
      firstAddedDate: previousDrawEntry?.firstAddedDate ?? now,
      lastUpdatedDate: now,
    };

    if (existingIndex === -1) {
      entries.push(entriesPayload);
    } else {
      entries[existingIndex] = {
        ...previousDrawEntry,
        ...entriesPayload,
      };
    }

    miniDraw.entries = entries as typeof miniDraw.entries;
    miniDraw.markModified("entries");
    await miniDraw.save({ session });

    const previousUserParticipation = existingParticipationMap.get(participation.miniDrawId);

    nextUserParticipation.push({
      miniDrawId: miniDrawObjectId,
      totalEntries: participation.totalEntries,
      entriesBySource: {
        "mini-draw-package": participation.totalEntries,
        "free-entry": previousUserParticipation?.entriesBySource?.["free-entry"] ?? 0,
      },
      firstParticipatedDate: previousUserParticipation?.firstParticipatedDate ?? now,
      lastParticipatedDate: now,
      isActive: participation.isActive ?? true,
    });
  }

  user.miniDrawParticipation = nextUserParticipation;
  user.markModified("miniDrawParticipation");
}
