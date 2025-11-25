import connectDB from "@/lib/mongodb";
import Affiliate from "@/models/Affiliate";
import User from "@/models/User";
import mongoose from "mongoose";

const COMMISSION_RATE = 0.3; // 30% commission

/**
 * Generate a unique affiliate code
 * Format: AFF + 6 random alphanumeric characters
 */
export async function generateUniqueAffiliateCode(): Promise<string> {
  await connectDB();

  for (let attempts = 0; attempts < 10; attempts++) {
    const randomPart = Math.random().toString(36).substring(2, 8).toUpperCase();
    const code = `AFF${randomPart}`;

    const exists = await Affiliate.findOne({ affiliateCode: code });
    if (!exists) {
      return code;
    }
  }

  throw new Error("Failed to generate unique affiliate code");
}

/**
 * Validate and get affiliate by code
 */
export async function getAffiliateByCode(affiliateCode: string) {
  await connectDB();

  const code = affiliateCode.trim().toUpperCase();
  const affiliate = await Affiliate.findOne({
    affiliateCode: code,
    isActive: true,
  }).lean();

  return affiliate;
}

/**
 * Track user signup via affiliate link
 * This links a user account to an affiliate for commission tracking
 */
export async function trackAffiliateSignup({
  affiliateCode,
  userId,
}: {
  affiliateCode: string;
  userId: string;
  userEmail?: string; // Optional, kept for API compatibility
}) {
  await connectDB();

  const affiliate = await getAffiliateByCode(affiliateCode);
  if (!affiliate) {
    throw new Error("Invalid affiliate code");
  }

  const userObjectId = new mongoose.Types.ObjectId(userId);

  // Check if user already has an affiliate referral
  const user = await User.findById(userObjectId);
  if (!user) {
    throw new Error("User not found");
  }

  if (user.affiliateReferral) {
    // User already has an affiliate referral, don't overwrite
    return {
      affiliateId: user.affiliateReferral.affiliateId.toString(),
      affiliateCode: user.affiliateReferral.affiliateCode,
    };
  }

  // Set affiliate referral on user
  const affiliateObjectId = new mongoose.Types.ObjectId(affiliate._id.toString());
  user.affiliateReferral = {
    affiliateId: affiliateObjectId,
    affiliateCode: affiliate.affiliateCode,
    referredAt: new Date(),
    firstPurchaseCompleted: false,
    membershipTied: false,
  };

  await user.save();

  // Increment affiliate signup count
  await Affiliate.findByIdAndUpdate(affiliateObjectId, {
    $inc: { totalSignups: 1 },
  });

  return {
    affiliateId: affiliate._id.toString(),
    affiliateCode: affiliate.affiliateCode,
  };
}

/**
 * Calculate commission amount
 */
export function calculateCommission(amount: number, rate: number = COMMISSION_RATE): number {
  return Math.round(amount * rate);
}

export { COMMISSION_RATE };
