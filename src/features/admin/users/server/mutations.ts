/**
 * Server-side mutations for admin user management
 * Contains all database write operations for users
 */

import connectDB from "@/lib/mongodb";
import User, { IUser } from "@/models/User";
import MajorDraw from "@/models/MajorDraw";
import MiniDraw from "@/models/MiniDraw";
import mongoose from "mongoose";
import type { AdminUserUpdatePayload } from "@/types/admin";
import { AdminUserDetail } from "@/types/admin";
import { buildAdminUserProfile } from "./queries";
import crypto from "crypto";

/**
 * Apply basic info updates to user
 */
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

  if (basicInfo.profession !== undefined) {
    // Trim and validate profession
    const trimmedProfession = basicInfo.profession.trim();
    if (trimmedProfession.length > 100) {
      throw new Error("Profession cannot exceed 100 characters");
    }
    user.profession = trimmedProfession || undefined;
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

/**
 * Apply subscription updates to user
 */
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

/**
 * Apply rewards updates to user
 */
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

/**
 * Apply one-time packages updates to user
 */
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

/**
 * Apply mini draw packages updates to user
 */
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

/**
 * Apply partner discount queue updates to user
 */
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

/**
 * Sync major draw participation
 */
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

/**
 * Sync mini draw participation
 */
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

/**
 * Update user profile
 */
export async function updateUser(userId: string, payload: AdminUserUpdatePayload): Promise<AdminUserDetail> {
  await connectDB();

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error("Invalid user ID");
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
    throw new Error("User not found");
  }

  if (transactionError) {
    throw transactionError;
  }

  const updatedProfile = await buildAdminUserProfile(userId);

  if (!updatedProfile) {
    throw new Error("User not found");
  }

  return updatedProfile;
}

/**
 * Handle resending email verification
 */
export async function resendEmailVerification(userId: string) {
  await connectDB();

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error("Invalid user ID");
  }

  const user = await User.findById(userId);

  if (!user) {
    throw new Error("User not found");
  }

  // Generate new verification code
  const verificationCode = crypto.randomInt(100000, 999999).toString();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

  // Update user with new verification code
  user.emailVerificationCode = verificationCode;
  user.emailVerificationExpires = expiresAt;
  user.emailVerificationAttempts = 0;
  await user.save();

  return {
    success: true,
    action: "resend_verification",
    message: "Verification email sent successfully",
    verificationCode, // Include for admin reference
  };
}

/**
 * Handle password reset
 */
export async function resetUserPassword(userId: string) {
  await connectDB();

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error("Invalid user ID");
  }

  const user = await User.findById(userId);

  if (!user) {
    throw new Error("User not found");
  }

  // Generate password reset token
  const resetToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  // Update user with reset token
  user.passwordResetToken = resetToken;
  user.passwordResetExpires = expiresAt;
  await user.save();

  const resetUrl = `${process.env.NEXTAUTH_URL}/reset-password?token=${resetToken}`;

  return {
    success: true,
    action: "reset_password",
    message: "Password reset email sent successfully",
    resetToken, // Include for admin reference
    resetUrl,
  };
}

/**
 * Handle account status toggle
 */
export async function toggleUserStatus(userId: string, reason?: string) {
  await connectDB();

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error("Invalid user ID");
  }

  const user = await User.findById(userId);

  if (!user) {
    throw new Error("User not found");
  }

  const newStatus = !user.isActive;
  user.isActive = newStatus;
  await user.save();

  return {
    success: true,
    action: "toggle_status",
    message: `Account ${newStatus ? "activated" : "deactivated"} successfully`,
    newStatus,
    reason,
  };
}

/**
 * Handle adding admin note
 */
export async function addAdminNote(userId: string, note: string, adminId: string) {
  await connectDB();

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error("Invalid user ID");
  }

  if (!note || note.trim().length === 0) {
    throw new Error("Note is required");
  }

  const user = await User.findById(userId);

  if (!user) {
    throw new Error("User not found");
  }

  // Initialize adminNotes array if it doesn't exist
  // Note: adminNotes may not be in the schema, so we use type assertion
  const adminNotes =
    (user as unknown as { adminNotes?: Array<{ note: string; addedBy: string; addedAt: Date }> }).adminNotes || [];
  adminNotes.push({
    note: note.trim(),
    addedBy: adminId,
    addedAt: new Date(),
  });
  (user as unknown as { adminNotes: Array<{ note: string; addedBy: string; addedAt: Date }> }).adminNotes = adminNotes;

  await user.save();

  return {
    success: true,
    action: "add_note",
    message: "Admin note added successfully",
    note: note.trim(),
    addedAt: new Date(),
  };
}

/**
 * Handle resending SMS verification
 */
export async function resendSMSVerification(userId: string) {
  await connectDB();

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    throw new Error("Invalid user ID");
  }

  const user = await User.findById(userId);

  if (!user) {
    throw new Error("User not found");
  }

  if (!user.mobile) {
    throw new Error("User has no mobile number on file");
  }

  // Generate new SMS OTP
  const otpCode = crypto.randomInt(100000, 999999).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  // Update user with new OTP
  user.smsOtpCode = otpCode;
  user.smsOtpExpires = expiresAt;
  user.smsOtpAttempts = 0;
  await user.save();

  return {
    success: true,
    action: "resend_sms_verification",
    message: "SMS verification code sent successfully",
    otpCode, // Include for admin reference
  };
}




