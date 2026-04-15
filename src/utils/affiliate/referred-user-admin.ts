import connectDB from "@/lib/mongodb";
import Affiliate from "@/models/Affiliate";
import AffiliateCommission from "@/models/AffiliateCommission";
import PaymentEvent from "@/models/PaymentEvent";
import User from "@/models/User";
import mongoose from "mongoose";
import {
  processOneTimePackageCommission,
  processUpsellCommission,
  processMiniDrawPackageCommission,
  processMembershipFirstCommission,
  processMembershipRecurringCommission,
} from "@/utils/affiliate/commission-processing";

export type AttachResult =
  | { ok: true; alreadyLinked: boolean; backfill?: { created: number; skipped: number } }
  | { ok: false; code: "USER_ALREADY_AFFILIATED"; currentAffiliateCode: string }
  | { ok: false; code: "NOT_FOUND"; message: string };

/**
 * Attach a user as referred by an affiliate (admin action).
 * Does NOT increment Affiliate.totalSignups — manual admin assignment.
 */
export async function attachReferredUserForAdmin({
  affiliateId,
  userId,
  backfillCommissions = false,
}: {
  affiliateId: string;
  userId: string;
  backfillCommissions?: boolean;
}): Promise<AttachResult> {
  await connectDB();

  if (!mongoose.Types.ObjectId.isValid(affiliateId) || !mongoose.Types.ObjectId.isValid(userId)) {
    return { ok: false, code: "NOT_FOUND", message: "Invalid ID format" };
  }

  const affiliate = await Affiliate.findById(affiliateId).lean();
  if (!affiliate) return { ok: false, code: "NOT_FOUND", message: "Affiliate not found" };

  const user = await User.findById(userId);
  if (!user) return { ok: false, code: "NOT_FOUND", message: "User not found" };

  const existing = user.affiliateReferral;
  const existingAffId = existing?.affiliateId ? String(existing.affiliateId) : null;

  if (existingAffId && existingAffId !== affiliateId) {
    return {
      ok: false,
      code: "USER_ALREADY_AFFILIATED",
      currentAffiliateCode: existing?.affiliateCode ?? "unknown",
    };
  }

  const alreadyLinked = existingAffId === affiliateId;

  if (!alreadyLinked) {
    user.affiliateReferral = {
      affiliateId: new mongoose.Types.ObjectId(affiliateId),
      affiliateCode: affiliate.affiliateCode,
      referredAt: new Date(),
      firstPurchaseCompleted: false,
      membershipTied: false,
    };
    await user.save();
  }

  let backfill: { created: number; skipped: number } | undefined;
  if (backfillCommissions) {
    backfill = await backfillCommissionsForUser(affiliateId, userId);
  }

  return { ok: true, alreadyLinked, backfill };
}

export type DetachResult =
  | { ok: true; cancelledPending: number }
  | { ok: false; code: "NOT_FOUND"; message: string }
  | { ok: false; code: "NOT_LINKED"; message: string };

/**
 * Detach a user from an affiliate (admin action).
 * Clears affiliateReferral and cancels any pending commissions.
 * Does NOT modify paid commissions or signup counters.
 */
export async function detachReferredUserForAdmin({
  affiliateId,
  userId,
}: {
  affiliateId: string;
  userId: string;
}): Promise<DetachResult> {
  await connectDB();

  if (!mongoose.Types.ObjectId.isValid(affiliateId) || !mongoose.Types.ObjectId.isValid(userId)) {
    return { ok: false, code: "NOT_FOUND", message: "Invalid ID format" };
  }

  const user = await User.findById(userId);
  if (!user) return { ok: false, code: "NOT_FOUND", message: "User not found" };

  const currentAffId = user.affiliateReferral?.affiliateId
    ? String(user.affiliateReferral.affiliateId)
    : null;

  if (currentAffId !== affiliateId) {
    return { ok: false, code: "NOT_LINKED", message: "User is not linked to this affiliate" };
  }

  user.affiliateReferral = undefined;
  await user.save();

  const affiliateOid = new mongoose.Types.ObjectId(affiliateId);
  const userOid = new mongoose.Types.ObjectId(userId);

  const cancelResult = await AffiliateCommission.updateMany(
    { affiliateId: affiliateOid, referredUserId: userOid, status: "pending" },
    { $set: { status: "cancelled" } },
  );

  const cancelledPending = cancelResult.modifiedCount;

  if (cancelledPending > 0) {
    const cancelledTotals = await AffiliateCommission.aggregate<{
      totalSales: number;
      totalCommissions: number;
    }>([
      { $match: { affiliateId: affiliateOid, referredUserId: userOid, status: "cancelled" } },
      {
        $group: {
          _id: null,
          totalSales: { $sum: "$purchaseAmount" },
          totalCommissions: { $sum: "$commissionAmount" },
        },
      },
    ]);

    if (cancelledTotals.length > 0) {
      await Affiliate.findByIdAndUpdate(affiliateId, {
        $inc: {
          totalSales: -cancelledTotals[0].totalSales,
          totalCommissions: -cancelledTotals[0].totalCommissions,
        },
      });
    }
  }

  return { ok: true, cancelledPending };
}

/**
 * Replay PaymentEvent history to create commission rows for a newly-attached user.
 * Uses the existing commission-processing helpers so idempotency rules are respected.
 */
async function backfillCommissionsForUser(
  affiliateId: string,
  userId: string,
): Promise<{ created: number; skipped: number }> {
  const userOid = new mongoose.Types.ObjectId(userId);

  const events = await PaymentEvent.find({
    userId: userOid,
    eventType: { $in: ["BenefitsGranted", "UpsellProcessed", "MiniDrawProcessed"] },
  })
    .sort({ timestamp: 1 })
    .lean();

  let created = 0;
  let skipped = 0;

  const existingBefore = await AffiliateCommission.countDocuments({
    affiliateId: new mongoose.Types.ObjectId(affiliateId),
    referredUserId: userOid,
  });

  for (const evt of events) {
    const price = evt.data?.price;
    if (typeof price !== "number" || price <= 0) {
      skipped++;
      continue;
    }

    const purchaseAmount = Math.round(price * 100);
    const paymentIntentId = evt.paymentIntentId;
    const packageId = evt.packageId || "";
    const packageName = evt.packageName || "";
    const earnedAt = evt.timestamp;
    const subscriptionId =
      typeof evt.data?.subscriptionId === "string" ? evt.data.subscriptionId : "";

    try {
      if (evt.packageType === "one-time") {
        await processOneTimePackageCommission({
          userId,
          packageId,
          packageName,
          purchaseAmount,
          paymentIntentId,
          earnedAt,
        });
      } else if (evt.packageType === "upsell") {
        await processUpsellCommission({
          userId,
          offerId: packageId,
          offerName: packageName,
          purchaseAmount,
          paymentIntentId,
          earnedAt,
        });
      } else if (evt.packageType === "mini-draw") {
        await processMiniDrawPackageCommission({
          userId,
          packageId,
          packageName,
          purchaseAmount,
          paymentIntentId,
          earnedAt,
        });
      } else if (evt.packageType === "membership") {
        if (paymentIntentId.startsWith("invoice_") || paymentIntentId.startsWith("in_")) {
          await processMembershipRecurringCommission({
            userId,
            invoiceId: paymentIntentId,
            subscriptionId,
            purchaseAmount,
            packageId: packageId || undefined,
            packageName: packageName || undefined,
            earnedAt,
          });
        } else {
          await processMembershipFirstCommission({
            userId,
            packageId,
            packageName,
            purchaseAmount,
            paymentIntentId,
            subscriptionId,
            earnedAt,
          });
        }
      }
    } catch {
      skipped++;
    }
  }

  const existingAfter = await AffiliateCommission.countDocuments({
    affiliateId: new mongoose.Types.ObjectId(affiliateId),
    referredUserId: userOid,
  });

  created = existingAfter - existingBefore;
  skipped = events.length - created;

  return { created, skipped };
}
