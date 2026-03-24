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
}: {
  userId: string;
  packageId: string;
  packageName: string;
  purchaseAmount: number;
  paymentIntentId: string;
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
}: {
  userId: string;
  offerId: string;
  offerName: string;
  purchaseAmount: number;
  paymentIntentId: string;
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
}: {
  userId: string;
  packageId: string;
  packageName: string;
  purchaseAmount: number;
  paymentIntentId: string;
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
}: {
  userId: string;
  packageId: string;
  packageName: string;
  purchaseAmount: number;
  paymentIntentId: string;
  subscriptionId: string;
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
}: {
  userId: string;
  offerId: string;
  offerName: string;
  purchaseAmount: number;
  paymentIntentId: string;
}) {
  return await processUpsellCommission({
    userId,
    offerId,
    offerName,
    purchaseAmount,
    paymentIntentId,
  });
}

/**
 * Process commission for recurring membership payment.
 * Eligible when affiliate referral exists and (membershipTied OR legacy self-heal via membership-first commission).
 */
export async function processMembershipRecurringCommission({
  userId,
  invoiceId,
  subscriptionId,
  purchaseAmount,
  packageId,
  packageName,
}: {
  userId: string;
  invoiceId: string;
  subscriptionId: string;
  purchaseAmount: number;
  packageId?: string;
  packageName?: string;
}) {
  await connectDB();

  if (purchaseAmount <= 0) {
    console.error(
      `[AffiliateCommission] skip recurring: zero_amount`,
      JSON.stringify({ invoiceId, userId, subscriptionId })
    );
    return null;
  }

  const user = await User.findById(userId);
  if (!user || !user.affiliateReferral || !user.affiliateReferral.affiliateId) {
    console.error(`[AffiliateCommission] skip recurring: no_affiliate`, JSON.stringify({ invoiceId, userId }));
    return null;
  }

  const affiliateId = user.affiliateReferral.affiliateId;
  const referredUserId = new mongoose.Types.ObjectId(userId);

  if (!user.affiliateReferral.membershipTied) {
    const hadFirstMembership = await AffiliateCommission.findOne({
      affiliateId,
      referredUserId,
      commissionType: "membership-first",
    })
      .select("_id")
      .lean();
    if (hadFirstMembership) {
      await User.findByIdAndUpdate(userId, {
        $set: { "affiliateReferral.membershipTied": true },
      });
      console.log(
        `[AffiliateCommission] self-healed membershipTied`,
        JSON.stringify({ invoiceId, userId, affiliateId: affiliateId.toString() })
      );
    } else {
      console.error(
        `[AffiliateCommission] skip recurring: not_membership_tied`,
        JSON.stringify({ invoiceId, userId, affiliateId: affiliateId.toString() })
      );
      return null;
    }
  }

  const commission = await recordAffiliateCommission({
    affiliateId,
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
  });

  if (commission) {
    console.log(
      `[AffiliateCommission] recurring commission`,
      JSON.stringify({ invoiceId, userId, commissionId: commission._id?.toString() })
    );
  }

  return commission;
}
