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

  const inviteeFilters: mongoose.FilterQuery<IReferralEvent>[] = [];
  let inviteeObjectId: mongoose.Types.ObjectId | null = null;

  if (inviteeUserId) {
    inviteeObjectId = new mongoose.Types.ObjectId(inviteeUserId);
    inviteeFilters.push({ inviteeUserId: inviteeObjectId });
  }
  if (inviteeEmail) {
    inviteeFilters.push({ inviteeEmail: inviteeEmail.toLowerCase() });
    if (!inviteeObjectId) {
      const inviteeUser = await User.findOne({ email: inviteeEmail.toLowerCase() }).select("_id").lean();
      if (inviteeUser) {
        inviteeObjectId = new mongoose.Types.ObjectId(inviteeUser._id.toString());
      }
    }
  }

  // Check for existing referral events FIRST
  // If user already has a pending referral for the same code, allow it
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

    // If user has a converted referral for the SAME code, return success (idempotent)
    // This allows frontend to validate without errors after purchase
    if (existingReferral && existingReferral.referralCode === code && existingReferral.status === "converted") {
      return {
        referrerId: referrer._id.toString(),
        referralCode: code,
        referrerName: `${referrer.firstName} ${referrer.lastName}`.trim(),
      };
    }

    // If user has a pending referral for the SAME code, allow validation
    // (they may be re-validating after purchase but before conversion completes)
    if (existingReferral && existingReferral.referralCode === code && existingReferral.status === "pending") {
      return {
        referrerId: referrer._id.toString(),
        referralCode: code,
        referrerName: `${referrer.firstName} ${referrer.lastName}`.trim(),
      };
    }

    // If user has a converted referral for a DIFFERENT code, reject
    if (existingReferral && existingReferral.status === "converted") {
      throw new Error("Referral reward already granted for this user");
    }
  }

  // Check if user is first-time (no purchases yet)
  // Use processedPayments count - if length > 0, user has made purchases
  if (inviteeObjectId) {
    const inviteeUser = await User.findById(inviteeObjectId).select("processedPayments").lean();
    if (inviteeUser) {
      const processedPaymentsCount = inviteeUser.processedPayments?.length || 0;
      if (processedPaymentsCount > 0) {
        throw new Error("Referral codes are only available to first-time users who haven't made any purchases yet.");
      }
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

  // Always complete referral immediately (no email verification requirement)
  const completionResult = await completeReferralConversion(inviteeObjectId.toString());
  if (completionResult.completed > 0) {
    console.log(`🎉 Referral rewards granted immediately: ${completionResult.completed} referral(s) converted for user ${inviteeObjectId.toString()}`);
  }

  return {
    status: completionResult.completed > 0 ? ("converted" as const) : ("pending" as const),
    eventId,
  };
}

export async function completeReferralConversion(inviteeUserId: string) {
  const inviteeObjectId = new mongoose.Types.ObjectId(inviteeUserId);
  const invitee = await User.findById(inviteeObjectId);
  if (!invitee) {
    console.warn(`⚠️ Referral completion: User ${inviteeUserId} not found`);
    return { completed: 0 };
  }

  const pendingEvents = await ReferralEvent.find({
    inviteeUserId: inviteeObjectId,
    status: "pending",
  });

  if (!pendingEvents.length) {
    console.log(`ℹ️ Referral completion: No pending referral events for user ${inviteeUserId}`);
    return { completed: 0 };
  }

  console.log(`🔄 Processing ${pendingEvents.length} pending referral event(s) for user ${inviteeUserId}`);

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

        // Update referral stats for referrer (no entries to user, entries go directly to major draw)
        await User.updateOne(
          { _id: referrer._id },
          {
            $inc: {
              "referral.successfulConversions": 1,
              "referral.totalEntriesAwarded": REFERRAL_REWARD_ENTRIES,
            },
          },
          { session }
        );

        // Add entries directly to major draw (inside transaction for atomicity)
        await addReferralEntriesToMajorDrawInTransaction(referrer._id.toString(), REFERRAL_REWARD_ENTRIES, session);
        await addReferralEntriesToMajorDrawInTransaction(inviteeObjectId.toString(), REFERRAL_REWARD_ENTRIES, session);

        console.log(`✅ Referral bonus entries awarded: ${REFERRAL_REWARD_ENTRIES} entries to referrer ${referrer._id.toString()} and invitee ${inviteeObjectId.toString()} (added directly to major draw)`);

        completedEvents.push({
          referrerId: referrer._id.toString(),
          inviteeId: inviteeObjectId.toString(),
        });
      }
    });
  } finally {
    await session.endSession();
  }

  if (completedEvents.length > 0) {
    console.log(`🎉 Successfully completed ${completedEvents.length} referral conversion(s) for user ${inviteeUserId}`);
  }

  return { completed: completedEvents.length };
}

/**
 * Add referral entries directly to major draw (within transaction)
 * Entries go directly to major draw, not to user's accumulatedEntries
 */
async function addReferralEntriesToMajorDrawInTransaction(
  userId: string,
  entriesToAdd: number,
  session: mongoose.ClientSession
) {
  if (entriesToAdd <= 0) {
    return;
  }

  try {
    const activeMajorDraw = await MajorDraw.findOne({ isActive: true }).session(session);
    if (!activeMajorDraw) {
      console.warn(`⚠️ No active major draw found for referral entries`);
      return;
    }

    const now = new Date();
    const userObjectId = new mongoose.Types.ObjectId(userId);

    // Find existing user entry
    const existingUserEntry = activeMajorDraw.entries.find(
      (entry: { userId: { toString(): string } }) => entry.userId.toString() === userId
    );

    if (existingUserEntry) {
      // Update existing entry using updateOne with positional operator
      await MajorDraw.updateOne(
        {
          _id: activeMajorDraw._id,
          "entries.userId": userObjectId,
        },
        {
          $inc: {
            "entries.$.totalEntries": entriesToAdd,
            "entries.$.entriesBySource.referral": entriesToAdd,
          },
          $set: {
            "entries.$.lastUpdatedDate": now,
          },
        },
        { session }
      );

      console.log(`✅ Updated existing major draw entry for user ${userId}: +${entriesToAdd} referral entries`);
    } else {
      // Create new entry using updateOne with $push
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
        },
        { session }
      );

      console.log(`✅ Created new major draw entry for user ${userId}: ${entriesToAdd} referral entries`);
    }

    // Update totalEntries - reload document to get fresh data
    const updatedMajorDraw = await MajorDraw.findById(activeMajorDraw._id).session(session);
    if (updatedMajorDraw) {
      const totalEntries =
        updatedMajorDraw.entries.reduce((sum: number, entry: { totalEntries: number }) => sum + entry.totalEntries, 0) || 0;

      if (totalEntries !== updatedMajorDraw.totalEntries) {
        await MajorDraw.updateOne({ _id: activeMajorDraw._id }, { $set: { totalEntries } }, { session });
      }
    }
  } catch (error) {
    console.error("Referral major draw update failed:", error);
    throw error; // Re-throw to rollback transaction
  }
}

export const REFERRAL_CONSTANTS = {
  rewardEntries: REFERRAL_REWARD_ENTRIES,
};
