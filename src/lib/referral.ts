import mongoose from "mongoose";
import User from "@/models/User";
import ReferralEvent, { IReferralEvent } from "@/models/ReferralEvent";
import MajorDraw from "@/models/MajorDraw";

const REFERRAL_CODE_LENGTH = 8;
const REFERRAL_REWARD_ENTRIES = 100;
const REFERRAL_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const sanitizeCode = (code: string): string => code.trim().toUpperCase();

const generateRandomCode = (length = REFERRAL_CODE_LENGTH): string => {
  let result = "";
  for (let i = 0; i < length; i++) {
    const index = Math.floor(Math.random() * REFERRAL_CODE_ALPHABET.length);
    result += REFERRAL_CODE_ALPHABET[index];
  }
  return result;
};

async function generateUniqueReferralCode(): Promise<string> {
  const maxAttempts = 10;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const candidate = `TA${generateRandomCode(REFERRAL_CODE_LENGTH - 2)}`;
    const existing = await User.findOne({ "referral.code": candidate }).select("_id").lean();
    if (!existing) {
      return candidate;
    }
  }
  throw new Error("Failed to generate unique referral code");
}

export async function getOrCreateReferralProfile(userId: string) {
  const user = await User.findById(userId);
  if (!user) {
    throw new Error("User not found");
  }

  let modified = false;

  if (!user.referral || !user.referral.code) {
    const code = await generateUniqueReferralCode();
    user.referral = {
      code,
      successfulConversions: 0,
      totalEntriesAwarded: 0,
    };
    modified = true;
  } else {
    if (user.referral.successfulConversions === undefined) {
      user.referral.successfulConversions = 0;
      modified = true;
    }
    if (user.referral.totalEntriesAwarded === undefined) {
      user.referral.totalEntriesAwarded = 0;
      modified = true;
    }
  }

  if (modified) {
    await user.save();
  }

  return {
    code: user.referral!.code,
    successfulConversions: user.referral!.successfulConversions ?? 0,
    totalEntriesAwarded: user.referral!.totalEntriesAwarded ?? 0,
  };
}

export async function validateReferralCodeForUser({
  referralCode,
  inviteeUserId,
  inviteeEmail,
}: {
  referralCode: string;
  inviteeUserId?: string | null;
  inviteeEmail?: string | null;
}) {
  if (!referralCode) {
    throw new Error("Referral code is required");
  }

  const code = sanitizeCode(referralCode);
  const referrer = await User.findOne({ "referral.code": code }).select("_id firstName lastName referral");
  if (!referrer) {
    throw new Error("Referral code not found");
  }

  const referrerObjectId = new mongoose.Types.ObjectId(referrer._id.toString());

  if (inviteeUserId && referrerObjectId.toString() === inviteeUserId) {
    throw new Error("You cannot use your own referral code");
  }

  type InviteeSnapshot = {
    subscription?: {
      status?: string;
      isActive?: boolean;
    };
    oneTimePackages?: unknown[];
    miniDrawPackages?: unknown[];
  };

  let inviteeUser: InviteeSnapshot | null = null;
  const inviteeFilters: mongoose.FilterQuery<IReferralEvent>[] = [];
  if (inviteeUserId) {
    const inviteeObjectId = new mongoose.Types.ObjectId(inviteeUserId);
    inviteeFilters.push({ inviteeUserId: inviteeObjectId });
    inviteeUser = (await User.findById(inviteeObjectId)
      .select("subscription oneTimePackages miniDrawPackages")
      .lean()) as InviteeSnapshot | null;
  }
  if (inviteeEmail) {
    inviteeFilters.push({ inviteeEmail: inviteeEmail.toLowerCase() });
    if (!inviteeUser) {
      inviteeUser = (await User.findOne({ email: inviteeEmail.toLowerCase() })
        .select("subscription oneTimePackages miniDrawPackages")
        .lean()) as InviteeSnapshot | null;
    }
  }

  if (inviteeUser) {
    const subscriptionStatus = inviteeUser.subscription?.status;
    const hasActiveMembership = inviteeUser.subscription?.isActive;
    const hasCompletedMembership = subscriptionStatus && subscriptionStatus !== "incomplete";
    const hasOneTimePurchases = Array.isArray(inviteeUser.oneTimePackages) && inviteeUser.oneTimePackages.length > 0;
    const hasMiniDrawPurchases = Array.isArray(inviteeUser.miniDrawPackages) && inviteeUser.miniDrawPackages.length > 0;

    if (hasActiveMembership || hasCompletedMembership || hasOneTimePurchases || hasMiniDrawPurchases) {
      throw new Error("Referral codes are only available to new members who haven't purchased yet.");
    }
  }

  if (inviteeFilters.length > 0) {
    const existingReferral = await ReferralEvent.findOne({
      $or: inviteeFilters,
      status: { $in: ["pending", "converted"] },
    })
      .select("referralCode status")
      .lean();

    if (existingReferral && existingReferral.referralCode !== code) {
      throw new Error("Another referral is already in progress for this user");
    }

    if (existingReferral && existingReferral.status === "converted") {
      throw new Error("Referral reward already granted for this user");
    }
  }

  return {
    referrerId: referrer._id.toString(),
    referralCode: code,
    referrerName: `${referrer.firstName} ${referrer.lastName}`.trim(),
  };
}

export async function recordReferralPurchase({
  referralCode,
  inviteeUserId,
  inviteeEmail,
  inviteeName,
  qualifyingOrderId,
  qualifyingOrderType,
}: {
  referralCode: string;
  inviteeUserId: string;
  inviteeEmail?: string | null;
  inviteeName?: string | null;
  qualifyingOrderId?: string | null;
  qualifyingOrderType: "membership" | "one-time";
}) {
  const inviteeObjectId = new mongoose.Types.ObjectId(inviteeUserId);
  const code = sanitizeCode(referralCode);

  const referrer = await User.findOne({ "referral.code": code }).select("_id referral");
  if (!referrer) {
    throw new Error("Referral code not found");
  }

  const referrerObjectId = new mongoose.Types.ObjectId(referrer._id.toString());

  if (referrerObjectId.equals(inviteeObjectId)) {
    throw new Error("You cannot refer yourself");
  }

  if (!referrer.referral || referrer.referral.code !== code) {
    referrer.referral = {
      code,
      successfulConversions: referrer.referral?.successfulConversions ?? 0,
      totalEntriesAwarded: referrer.referral?.totalEntriesAwarded ?? 0,
    };
    await referrer.save();
  }

  const existingConverted = await ReferralEvent.findOne({
    inviteeUserId: inviteeObjectId,
    status: "converted",
  })
    .select("_id")
    .lean();

  if (existingConverted) {
    return { status: "already-converted" as const };
  }

  const update = {
    referrerId: referrerObjectId,
    referralCode: code,
    inviteeUserId: inviteeObjectId,
    inviteeEmail: inviteeEmail?.toLowerCase(),
    inviteeName: inviteeName ?? undefined,
    status: "pending",
    qualifyingOrderId: qualifyingOrderId ?? undefined,
    qualifyingOrderType,
    referrerEntriesAwarded: 0,
    referreeEntriesAwarded: 0,
  };

  const event = await ReferralEvent.findOneAndUpdate(
    {
      referrerId: referrerObjectId,
      referralCode: code,
      inviteeUserId: inviteeObjectId,
    },
    { $set: update },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  if (!event) {
    throw new Error("Failed to record referral usage");
  }

  const eventId = event._id instanceof mongoose.Types.ObjectId ? event._id.toString() : String(event._id);

  const invitee = await User.findById(inviteeObjectId).select("isEmailVerified");
  if (invitee?.isEmailVerified) {
    const completionResult = await completeReferralOnEmailVerification(inviteeObjectId.toString());
    return {
      status: completionResult.completed > 0 ? ("converted" as const) : ("pending" as const),
      eventId,
    };
  }

  return {
    status: "pending" as const,
    eventId,
  };
}

export async function completeReferralOnEmailVerification(inviteeUserId: string) {
  const inviteeObjectId = new mongoose.Types.ObjectId(inviteeUserId);
  const invitee = await User.findById(inviteeObjectId);
  if (!invitee) {
    return { completed: 0 };
  }

  const pendingEvents = await ReferralEvent.find({
    inviteeUserId: inviteeObjectId,
    status: "pending",
  });

  if (!pendingEvents.length) {
    return { completed: 0 };
  }

  const session = await mongoose.startSession();
  const completedEvents: Array<{ referrerId: string; inviteeId: string }> = [];

  try {
    await session.withTransaction(async () => {
      for (const event of pendingEvents) {
        const referrer = await User.findById(event.referrerId).session(session);
        if (!referrer) {
          continue;
        }

        // Ensure we do not double-process
        if (event.status === "converted") {
          continue;
        }

        event.status = "converted";
        event.conversionDate = new Date();
        event.referrerEntriesAwarded = REFERRAL_REWARD_ENTRIES;
        event.referreeEntriesAwarded = REFERRAL_REWARD_ENTRIES;
        await event.save({ session });

        await User.updateOne(
          { _id: referrer._id },
          {
            $inc: {
              accumulatedEntries: REFERRAL_REWARD_ENTRIES,
              "referral.successfulConversions": 1,
              "referral.totalEntriesAwarded": REFERRAL_REWARD_ENTRIES,
            },
          },
          { session }
        );

        await User.updateOne(
          { _id: inviteeObjectId },
          {
            $inc: {
              accumulatedEntries: REFERRAL_REWARD_ENTRIES,
            },
          },
          { session }
        );

        completedEvents.push({
          referrerId: referrer._id.toString(),
          inviteeId: inviteeObjectId.toString(),
        });
      }
    });
  } finally {
    await session.endSession();
  }

  for (const event of completedEvents) {
    await addReferralEntriesToMajorDraw(event.referrerId, REFERRAL_REWARD_ENTRIES);
    await addReferralEntriesToMajorDraw(event.inviteeId, REFERRAL_REWARD_ENTRIES);
  }

  return { completed: completedEvents.length };
}

async function addReferralEntriesToMajorDraw(userId: string, entriesToAdd: number) {
  if (entriesToAdd <= 0) {
    return;
  }

  try {
    const activeMajorDraw = await MajorDraw.findOne({ isActive: true });
    if (!activeMajorDraw) {
      return;
    }

    const now = new Date();
    const userObjectId = new mongoose.Types.ObjectId(userId);

    const existingUserEntry = activeMajorDraw.entries.find(
      (entry: { userId: { toString(): string } }) => entry.userId.toString() === userId
    );

    if (existingUserEntry) {
      await MajorDraw.updateOne(
        { _id: activeMajorDraw._id, "entries.userId": userObjectId },
        {
          $inc: {
            "entries.$.totalEntries": entriesToAdd,
            "entries.$.entriesBySource.referral": entriesToAdd,
          },
          $set: {
            "entries.$.lastUpdatedDate": now,
          },
        }
      );
    } else {
      await MajorDraw.updateOne(
        { _id: activeMajorDraw._id },
        {
          $push: {
            entries: {
              userId: userObjectId,
              totalEntries: entriesToAdd,
              entriesBySource: {
                membership: 0,
                "one-time-package": 0,
                upsell: 0,
                "mini-draw": 0,
                referral: entriesToAdd,
              },
              firstAddedDate: now,
              lastUpdatedDate: now,
            },
          },
        }
      );
    }

    const updatedMajorDraw = await MajorDraw.findById(activeMajorDraw._id);
    const totalEntries =
      updatedMajorDraw?.entries.reduce((sum: number, entry: { totalEntries: number }) => sum + entry.totalEntries, 0) ||
      0;

    if (updatedMajorDraw && totalEntries !== updatedMajorDraw.totalEntries) {
      await MajorDraw.updateOne({ _id: activeMajorDraw._id }, { $set: { totalEntries } });
    }
  } catch (error) {
    console.error("Referral major draw update failed:", error);
  }
}

export const REFERRAL_CONSTANTS = {
  rewardEntries: REFERRAL_REWARD_ENTRIES,
};
