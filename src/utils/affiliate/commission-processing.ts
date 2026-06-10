import connectDB from "@/lib/mongodb";
import AffiliateCommission from "@/models/AffiliateCommission";
import User from "@/models/User";
import mongoose from "mongoose";
import {
  recordAffiliateCommission,
  resolveReferralAffiliateId,
} from "@/utils/affiliate/affiliate-attribution";

/**
 * Process commission for one-time package purchases (every successful payment for referred users).
 */
export async function processOneTimePackageCommission({
  userId,
  packageId,
  packageName,
  purchaseAmount,
  paymentIntentId,
  earnedAt,
}: {
  userId: string;
  packageId: string;
  packageName: string;
  purchaseAmount: number;
  paymentIntentId: string;
  /** When the payment happened (Stripe / webhook time); defaults to now */
  earnedAt?: Date;
}) {
  await connectDB();

  const user = await User.findById(userId);
  const affiliateId = resolveReferralAffiliateId(user);
  if (!affiliateId) return null;

  const referredUserId = new mongoose.Types.ObjectId(userId);

  const commission = await recordAffiliateCommission({
    affiliateId,
    referredUserId,
    commissionType: "one-time-package",
    purchaseType: "one-time",
    packageId,
    packageName,
    purchaseAmount,
    stripePaymentIntentId: paymentIntentId,
    isFirstTimePurchase: false,
    isRecurringPayment: false,
    ...(earnedAt ? { earnedAt } : {}),
  });

  if (commission) {
    await User.updateOne(
      { _id: userId, "affiliateReferral.firstPurchaseCompleted": { $ne: true } },
      { $set: { "affiliateReferral.firstPurchaseCompleted": true } }
    );
  }

  return commission;
}

/**
 * Process commission for upsell purchases (every successful payment for referred users).
 */
export async function processUpsellCommission({
  userId,
  offerId,
  offerName,
  purchaseAmount,
  paymentIntentId,
  earnedAt,
}: {
  userId: string;
  offerId: string;
  offerName: string;
  purchaseAmount: number;
  paymentIntentId: string;
  earnedAt?: Date;
}) {
  await connectDB();

  const user = await User.findById(userId);
  const affiliateId = resolveReferralAffiliateId(user);
  if (!affiliateId) return null;

  const referredUserId = new mongoose.Types.ObjectId(userId);

  return recordAffiliateCommission({
    affiliateId,
    referredUserId,
    commissionType: "upsell",
    purchaseType: "upsell",
    packageId: offerId,
    packageName: offerName,
    purchaseAmount,
    stripePaymentIntentId: paymentIntentId,
    isFirstTimePurchase: false,
    isRecurringPayment: false,
    ...(earnedAt ? { earnedAt } : {}),
  });
}

/**
 * Process commission for mini-draw package purchases (every successful payment for referred users).
 */
export async function processMiniDrawPackageCommission({
  userId,
  packageId,
  packageName,
  purchaseAmount,
  paymentIntentId,
  earnedAt,
}: {
  userId: string;
  packageId: string;
  packageName: string;
  purchaseAmount: number;
  paymentIntentId: string;
  earnedAt?: Date;
}) {
  await connectDB();

  const user = await User.findById(userId);
  const affiliateId = resolveReferralAffiliateId(user);
  if (!affiliateId) return null;

  const referredUserId = new mongoose.Types.ObjectId(userId);

  const commission = await recordAffiliateCommission({
    affiliateId,
    referredUserId,
    commissionType: "mini-draw-package",
    purchaseType: "mini-draw",
    packageId,
    packageName,
    purchaseAmount,
    stripePaymentIntentId: paymentIntentId,
    isFirstTimePurchase: false,
    isRecurringPayment: false,
    ...(earnedAt ? { earnedAt } : {}),
  });

  if (commission) {
    await User.updateOne(
      { _id: userId, "affiliateReferral.firstPurchaseCompleted": { $ne: true } },
      { $set: { "affiliateReferral.firstPurchaseCompleted": true } }
    );
  }

  return commission;
}

/**
 * Process commission for membership subscription initial / checkout invoice (grantBenefits path).
 * Re-subscription after cancel earns a new row (idempotent per payment intent).
 * Also ties membership to the affiliate for recurring commissions.
 */
export async function processMembershipFirstCommission({
  userId,
  packageId,
  packageName,
  purchaseAmount,
  paymentIntentId,
  subscriptionId,
  earnedAt,
}: {
  userId: string;
  packageId: string;
  packageName: string;
  purchaseAmount: number;
  paymentIntentId: string;
  subscriptionId: string;
  earnedAt?: Date;
}) {
  await connectDB();

  const user = await User.findById(userId);
  const affiliateId = resolveReferralAffiliateId(user);
  if (!affiliateId) return null;

  const referredUserId = new mongoose.Types.ObjectId(userId);

  const commission = await recordAffiliateCommission({
    affiliateId,
    referredUserId,
    commissionType: "membership-first",
    purchaseType: "membership",
    packageId,
    packageName,
    purchaseAmount,
    stripePaymentIntentId: paymentIntentId,
    stripeSubscriptionId: subscriptionId,
    isFirstTimePurchase: true,
    isRecurringPayment: false,
    ...(earnedAt ? { earnedAt } : {}),
  });

  if (commission) {
    await User.findByIdAndUpdate(userId, {
      $set: {
        "affiliateReferral.membershipTied": true,
        "affiliateReferral.firstPurchaseCompleted": true,
      },
    });
  }

  return commission;
}

/**
 * Process commission for membership upsell (uses same rules as regular upsell — every payment).
 */
export async function processMembershipUpsellCommission({
  userId,
  offerId,
  offerName,
  purchaseAmount,
  paymentIntentId,
  earnedAt,
}: {
  userId: string;
  offerId: string;
  offerName: string;
  purchaseAmount: number;
  paymentIntentId: string;
  earnedAt?: Date;
}) {
  return await processUpsellCommission({
    userId,
    offerId,
    offerName,
    purchaseAmount,
    paymentIntentId,
    earnedAt,
  });
}

/**
 * Process commission for recurring membership payment.
 * Uses the affiliate on the existing `membership-first` row as canonical (same referred user).
 * Self-heal previously required `user.affiliateReferral.affiliateId` to match that row; if it drifted,
 * the lookup missed and recurring was skipped — we now resolve affiliate from membership-first first.
 */
export async function processMembershipRecurringCommission({
  userId,
  invoiceId,
  subscriptionId,
  purchaseAmount,
  packageId,
  packageName,
  earnedAt,
}: {
  userId: string;
  invoiceId: string;
  subscriptionId: string;
  purchaseAmount: number;
  packageId?: string;
  packageName?: string;
  /** Invoice paid time (Stripe); defaults to now if omitted */
  earnedAt?: Date;
}) {
  await connectDB();

  if (purchaseAmount <= 0) {
    // Expected skip (no commission due on a $0 invoice) — info level, not an error.
    console.log(
      `[AffiliateCommission] skip recurring: zero_amount`,
      JSON.stringify({ invoiceId, userId, subscriptionId })
    );
    return null;
  }

  const user = await User.findById(userId);
  if (!user) {
    console.error(`[AffiliateCommission] skip recurring: no_user`, JSON.stringify({ invoiceId, userId }));
    return null;
  }

  const referredUserId = new mongoose.Types.ObjectId(userId);

  const membershipFirstRow = await AffiliateCommission.findOne({
    referredUserId,
    commissionType: "membership-first",
  })
    .select("affiliateId")
    .lean();

  let affiliateId: mongoose.Types.ObjectId | undefined;

  if (membershipFirstRow?.affiliateId) {
    affiliateId = new mongoose.Types.ObjectId(String(membershipFirstRow.affiliateId));
    const userAffStr = user.affiliateReferral?.affiliateId
      ? String(user.affiliateReferral.affiliateId)
      : "";
    const needsSync = !user.affiliateReferral?.membershipTied || userAffStr !== affiliateId.toString();
    if (needsSync) {
      await User.findByIdAndUpdate(userId, {
        $set: {
          "affiliateReferral.affiliateId": affiliateId,
          "affiliateReferral.membershipTied": true,
        },
      });
      console.log(
        `[AffiliateCommission] recurring: aligned affiliate from membership-first`,
        JSON.stringify({ invoiceId, userId, affiliateId: affiliateId.toString() })
      );
    }
  } else {
    if (!user.affiliateReferral?.affiliateId) {
      // Expected skip — most members were not referred by an affiliate (high volume). Info, not error.
      console.log(`[AffiliateCommission] skip recurring: no_affiliate`, JSON.stringify({ invoiceId, userId }));
      return null;
    }
    affiliateId = new mongoose.Types.ObjectId(String(user.affiliateReferral.affiliateId));
    if (!user.affiliateReferral.membershipTied) {
      // Expected skip — referral exists but isn't membership-tied, so recurring commission doesn't apply. Info, not error.
      console.log(
        `[AffiliateCommission] skip recurring: not_membership_tied`,
        JSON.stringify({ invoiceId, userId, affiliateId: affiliateId.toString() })
      );
      return null;
    }
  }

  const commission = await recordAffiliateCommission({
    affiliateId: affiliateId!,
    referredUserId,
    commissionType: "membership-recurring",
    purchaseType: "membership",
    packageId,
    packageName,
    purchaseAmount,
    stripeInvoiceId: invoiceId,
    stripeSubscriptionId: subscriptionId,
    isFirstTimePurchase: false,
    isRecurringPayment: true,
    ...(earnedAt ? { earnedAt } : {}),
  });

  if (!commission) {
    console.error(
      `[AffiliateCommission] skip recurring: record_failed`,
      JSON.stringify({ invoiceId, userId, affiliateId: affiliateId!.toString() })
    );
    return null;
  }

  console.log(
    `[AffiliateCommission] recurring commission`,
    JSON.stringify({ invoiceId, userId, commissionId: commission._id?.toString() })
  );

  return commission;
}
