import connectDB from "@/lib/mongodb";
import Affiliate from "@/models/Affiliate";
import AffiliateCommission from "@/models/AffiliateCommission";
import User from "@/models/User";
import { calculateCommission, COMMISSION_RATE } from "@/lib/affiliate";
import mongoose from "mongoose";

/**
 * Get affiliate's commission rate, with fallback to default
 */
async function getAffiliateCommissionRate(affiliateId: mongoose.Types.ObjectId): Promise<number> {
  const affiliate = await Affiliate.findById(affiliateId).select("commissionRate").lean();
  return affiliate?.commissionRate ?? COMMISSION_RATE; // Fallback to default if not set
}

/**
 * Process commission for one-time package purchase
 * Only grants commission on first-time one-time package purchase
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
  purchaseAmount: number; // Amount in cents
  paymentIntentId: string;
}) {
  await connectDB();

  const user = await User.findById(userId);
  if (!user || !user.affiliateReferral || !user.affiliateReferral.affiliateId) {
    return null; // No affiliate referral, no commission
  }

  const affiliateId = user.affiliateReferral.affiliateId;
  const referredUserId = new mongoose.Types.ObjectId(userId);

  // Check if this is the first one-time package purchase
  // Since the webhook processes AFTER the package is added, we check if there's already
  // a commission record for a different payment intent (indicating a previous purchase)
  const existingPreviousCommission = await AffiliateCommission.findOne({
    affiliateId,
    referredUserId,
    commissionType: "one-time-package",
    stripePaymentIntentId: { $ne: paymentIntentId }, // Different payment intent
  });

  if (existingPreviousCommission) {
    // Not first purchase, no commission
    return null;
  }

  // Check if commission already exists for this payment
  const existingCommission = await AffiliateCommission.findOne({
    affiliateId,
    referredUserId,
    stripePaymentIntentId: paymentIntentId,
    commissionType: "one-time-package",
  });

  if (existingCommission) {
    return existingCommission; // Already processed
  }

  // Get affiliate's commission rate
  const commissionRate = await getAffiliateCommissionRate(affiliateId);

  // Calculate commission
  const commissionAmount = calculateCommission(purchaseAmount, commissionRate);

  // Create commission record
  const commission = new AffiliateCommission({
    affiliateId,
    referredUserId,
    commissionType: "one-time-package",
    status: "pending",
    purchaseType: "one-time",
    packageId,
    packageName,
    purchaseAmount,
    commissionRate: commissionRate,
    commissionAmount,
    stripePaymentIntentId: paymentIntentId,
    isFirstTimePurchase: true,
    isRecurringPayment: false,
    earnedAt: new Date(),
  });

  await commission.save();

  // Update affiliate totals
  await Affiliate.findByIdAndUpdate(affiliateId, {
    $inc: {
      totalSales: purchaseAmount,
      totalCommissions: commissionAmount,
    },
  });

  // Mark first purchase as completed
  if (user.affiliateReferral) {
    user.affiliateReferral.firstPurchaseCompleted = true;
    await user.save();
  }

  return commission;
}

/**
 * Process commission for upsell purchase
 * Only grants commission on first-time upsell purchase
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
  if (!user || !user.affiliateReferral || !user.affiliateReferral.affiliateId) {
    return null;
  }

  const affiliateId = user.affiliateReferral.affiliateId;
  const referredUserId = new mongoose.Types.ObjectId(userId);

  // Check if this is the first upsell purchase
  // Since the webhook processes AFTER the upsell is added, we check if there's already
  // a commission record for a different payment intent (indicating a previous purchase)
  const existingPreviousCommission = await AffiliateCommission.findOne({
    affiliateId,
    referredUserId,
    commissionType: "upsell",
    stripePaymentIntentId: { $ne: paymentIntentId }, // Different payment intent
  });

  if (existingPreviousCommission) {
    return null; // Not first upsell, no commission
  }

  // Check if commission already exists for this payment
  const existingCommission = await AffiliateCommission.findOne({
    affiliateId,
    referredUserId,
    stripePaymentIntentId: paymentIntentId,
    commissionType: "upsell",
  });

  if (existingCommission) {
    return existingCommission;
  }

  // Get affiliate's commission rate
  const commissionRate = await getAffiliateCommissionRate(affiliateId);

  const commissionAmount = calculateCommission(purchaseAmount, commissionRate);

  const commission = new AffiliateCommission({
    affiliateId,
    referredUserId,
    commissionType: "upsell",
    status: "pending",
    purchaseType: "upsell",
    packageId: offerId,
    packageName: offerName,
    purchaseAmount,
    commissionRate: commissionRate,
    commissionAmount,
    stripePaymentIntentId: paymentIntentId,
    isFirstTimePurchase: true,
    isRecurringPayment: false,
    earnedAt: new Date(),
  });

  await commission.save();

  await Affiliate.findByIdAndUpdate(affiliateId, {
    $inc: {
      totalSales: purchaseAmount,
      totalCommissions: commissionAmount,
    },
  });

  return commission;
}

/**
 * Process commission for first-time membership subscription
 * Also ties the membership permanently to the affiliate for recurring commissions
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
  if (!user || !user.affiliateReferral || !user.affiliateReferral.affiliateId) {
    return null;
  }

  const affiliateId = user.affiliateReferral.affiliateId;
  const referredUserId = new mongoose.Types.ObjectId(userId);

  // Check if this is the first membership purchase
  // Check if there's already a commission record for membership-first (indicating previous membership)
  const existingPreviousCommission = await AffiliateCommission.findOne({
    affiliateId,
    referredUserId,
    commissionType: "membership-first",
    stripePaymentIntentId: { $ne: paymentIntentId }, // Different payment intent
  });

  if (existingPreviousCommission) {
    return null; // Not first membership, no commission
  }

  // Check if commission already exists for this payment
  const existingCommission = await AffiliateCommission.findOne({
    affiliateId,
    referredUserId,
    stripePaymentIntentId: paymentIntentId,
    commissionType: "membership-first",
  });

  if (existingCommission) {
    return existingCommission;
  }

  // Get affiliate's commission rate
  const commissionRate = await getAffiliateCommissionRate(affiliateId);

  const commissionAmount = calculateCommission(purchaseAmount, commissionRate);

  const commission = new AffiliateCommission({
    affiliateId,
    referredUserId,
    commissionType: "membership-first",
    status: "pending",
    purchaseType: "membership",
    packageId,
    packageName,
    purchaseAmount,
    commissionRate: commissionRate,
    commissionAmount,
    stripePaymentIntentId: paymentIntentId,
    stripeSubscriptionId: subscriptionId,
    isFirstTimePurchase: true,
    isRecurringPayment: false,
    earnedAt: new Date(),
  });

  await commission.save();

  await Affiliate.findByIdAndUpdate(affiliateId, {
    $inc: {
      totalSales: purchaseAmount,
      totalCommissions: commissionAmount,
    },
  });

  // Mark membership as permanently tied to affiliate (atomic to avoid __v conflicts)
  await User.findByIdAndUpdate(userId, {
    $set: {
      "affiliateReferral.membershipTied": true,
      "affiliateReferral.firstPurchaseCompleted": true,
    },
  });

  return commission;
}

/**
 * Process commission for membership upsell (first-time only)
 * This is the upsell that comes after a membership purchase
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
  // Same logic as regular upsell, but tied to membership
  // Only first-time upsell counts
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
      // Atomic update avoids __v version conflicts from the pre-save hook
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

  const existingCommission = await AffiliateCommission.findOne({
    affiliateId,
    referredUserId,
    stripeInvoiceId: invoiceId,
    commissionType: "membership-recurring",
  });

  if (existingCommission) {
    console.log(
      `[AffiliateCommission] recurring already exists (idempotent)`,
      JSON.stringify({ invoiceId, userId, commissionId: existingCommission._id?.toString() })
    );
    return existingCommission;
  }

  const commissionRate = await getAffiliateCommissionRate(affiliateId);
  const commissionAmount = calculateCommission(purchaseAmount, commissionRate);

  console.log(
    `[AffiliateCommission] creating recurring commission`,
    JSON.stringify({ invoiceId, userId, purchaseAmount, commissionRate, commissionAmount, packageId, packageName })
  );

  const commission = new AffiliateCommission({
    affiliateId,
    referredUserId,
    commissionType: "membership-recurring",
    status: "pending",
    purchaseType: "membership",
    packageId,
    packageName,
    purchaseAmount,
    commissionRate: commissionRate,
    commissionAmount,
    stripeInvoiceId: invoiceId,
    stripeSubscriptionId: subscriptionId,
    isFirstTimePurchase: false,
    isRecurringPayment: true,
    earnedAt: new Date(),
  });

  try {
    await commission.save();
  } catch (err: unknown) {
    const code = err && typeof err === "object" && "code" in err ? (err as { code?: number }).code : undefined;
    if (code === 11000) {
      const existing = await AffiliateCommission.findOne({
        affiliateId,
        referredUserId,
        stripeInvoiceId: invoiceId,
        commissionType: "membership-recurring",
      });
      console.log(
        `[AffiliateCommission] recurring duplicate key (idempotent)`,
        JSON.stringify({ invoiceId, userId })
      );
      return existing;
    }
    throw err;
  }

  await Affiliate.findByIdAndUpdate(affiliateId, {
    $inc: {
      totalSales: purchaseAmount,
      totalCommissions: commissionAmount,
    },
  });

  console.log(
    `[AffiliateCommission] ✅ recurring commission saved`,
    JSON.stringify({ invoiceId, userId, commissionId: commission._id?.toString(), commissionAmount })
  );

  return commission;
}
