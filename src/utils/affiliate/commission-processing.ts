import connectDB from "@/lib/mongodb";
import Affiliate from "@/models/Affiliate";
import AffiliateCommission, { CommissionType } from "@/models/AffiliateCommission";
import User from "@/models/User";
import { calculateCommission, COMMISSION_RATE } from "@/lib/affiliate";
import mongoose from "mongoose";

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
  if (!user || !user.affiliateReferral) {
    return null; // No affiliate referral, no commission
  }

  // Check if this is the first one-time package purchase
  // We need to check BEFORE this purchase was added, so we check if user has any previous packages
  // The webhook processes after the package is added, so we check if there are more than 0 packages
  // Actually, we should check the purchase history - if user already has one-time packages, this isn't first
  const hasPreviousOneTimePurchase =
    user.oneTimePackages && user.oneTimePackages.length > 0;
  if (hasPreviousOneTimePurchase) {
    // Not first purchase, no commission
    return null;
  }

  const affiliateId = user.affiliateReferral.affiliateId;
  const referredUserId = new mongoose.Types.ObjectId(userId);

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

  // Calculate commission
  const commissionAmount = calculateCommission(purchaseAmount, COMMISSION_RATE);

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
    commissionRate: COMMISSION_RATE,
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
  if (!user || !user.affiliateReferral) {
    return null;
  }

  // Check if this is the first upsell purchase
  // Check if user has any previous upsell purchases
  const hasPreviousUpsell = user.upsellPurchases && user.upsellPurchases.length > 0;
  if (hasPreviousUpsell) {
    return null; // Not first upsell, no commission
  }

  const affiliateId = user.affiliateReferral.affiliateId;
  const referredUserId = new mongoose.Types.ObjectId(userId);

  // Check if commission already exists
  const existingCommission = await AffiliateCommission.findOne({
    affiliateId,
    referredUserId,
    stripePaymentIntentId: paymentIntentId,
    commissionType: "upsell",
  });

  if (existingCommission) {
    return existingCommission;
  }

  const commissionAmount = calculateCommission(purchaseAmount, COMMISSION_RATE);

  const commission = new AffiliateCommission({
    affiliateId,
    referredUserId,
    commissionType: "upsell",
    status: "pending",
    purchaseType: "upsell",
    packageId: offerId,
    packageName: offerName,
    purchaseAmount,
    commissionRate: COMMISSION_RATE,
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
  if (!user || !user.affiliateReferral) {
    return null;
  }

  // Check if user already has an active membership
  // If they do, this is not the first membership
  const hasActiveMembership = user.subscription?.isActive;
  if (hasActiveMembership) {
    return null; // Not first membership, no commission
  }

  const affiliateId = user.affiliateReferral.affiliateId;
  const referredUserId = new mongoose.Types.ObjectId(userId);

  // Check if commission already exists
  const existingCommission = await AffiliateCommission.findOne({
    affiliateId,
    referredUserId,
    stripePaymentIntentId: paymentIntentId,
    commissionType: "membership-first",
  });

  if (existingCommission) {
    return existingCommission;
  }

  const commissionAmount = calculateCommission(purchaseAmount, COMMISSION_RATE);

  const commission = new AffiliateCommission({
    affiliateId,
    referredUserId,
    commissionType: "membership-first",
    status: "pending",
    purchaseType: "membership",
    packageId,
    packageName,
    purchaseAmount,
    commissionRate: COMMISSION_RATE,
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

  // Mark membership as permanently tied to affiliate
  if (user.affiliateReferral) {
    user.affiliateReferral.membershipTied = true;
    user.affiliateReferral.firstPurchaseCompleted = true;
    await user.save();
  }

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
 * Process commission for recurring membership payment
 * Only processes if membership is tied to affiliate
 */
export async function processMembershipRecurringCommission({
  userId,
  invoiceId,
  subscriptionId,
  purchaseAmount,
}: {
  userId: string;
  invoiceId: string;
  subscriptionId: string;
  purchaseAmount: number;
}) {
  await connectDB();

  const user = await User.findById(userId);
  if (!user || !user.affiliateReferral) {
    return null;
  }

  // Only process if membership is tied to affiliate
  if (!user.affiliateReferral.membershipTied) {
    return null;
  }

  const affiliateId = user.affiliateReferral.affiliateId;
  const referredUserId = new mongoose.Types.ObjectId(userId);

  // Check if commission already exists for this invoice
  const existingCommission = await AffiliateCommission.findOne({
    affiliateId,
    referredUserId,
    stripeInvoiceId: invoiceId,
    commissionType: "membership-recurring",
  });

  if (existingCommission) {
    return existingCommission;
  }

  const commissionAmount = calculateCommission(purchaseAmount, COMMISSION_RATE);

  const commission = new AffiliateCommission({
    affiliateId,
    referredUserId,
    commissionType: "membership-recurring",
    status: "pending",
    purchaseType: "membership",
    purchaseAmount,
    commissionRate: COMMISSION_RATE,
    commissionAmount,
    stripeInvoiceId: invoiceId,
    stripeSubscriptionId: subscriptionId,
    isFirstTimePurchase: false,
    isRecurringPayment: true,
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

