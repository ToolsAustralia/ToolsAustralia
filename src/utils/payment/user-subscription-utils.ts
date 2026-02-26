/**
 * User Subscription Utilities
 *
 * This module provides utilities for creating and updating user subscription data.
 * Handles both create and update paths with single database save operation.
 */

import User, { type IUser } from "@/models/User";
import bcrypt from "bcryptjs";
import type mongoose from "mongoose";

interface UserData {
  email: string;
  firstName: string;
  lastName: string;
  mobile?: string;
  password?: string;
}

interface SubscriptionData {
  subscriptionId: string;
  customerId: string;
  packageId: string;
  status: string;
}

/**
 * Creates or updates a user with subscription data
 * Handles both create and update paths with single database save operation
 *
 * @param existingUser - Existing user (optional, for update path)
 * @param userData - User data (email, firstName, lastName, mobile, password)
 * @param subscriptionData - Subscription data (subscriptionId, customerId, packageId, status)
 * @returns User object (created or updated)
 */
export async function createOrUpdateSubscriptionUser(
  existingUser: (mongoose.Document & IUser) | null,
  userData: UserData,
  subscriptionData: SubscriptionData
): Promise<mongoose.Document & IUser> {
  // Clean mobile number before saving (remove spaces)
  const cleanedMobile = userData.mobile?.replace(/\s+/g, "") || "";

  if (existingUser) {
    // Update existing user
    existingUser.stripeCustomerId = subscriptionData.customerId;
    existingUser.stripeSubscriptionId = subscriptionData.subscriptionId;
    existingUser.subscription = {
      packageId: subscriptionData.packageId,
      startDate: new Date(),
      endDate: undefined, // Subscriptions don't have end dates
      isActive: subscriptionData.status === "active" || subscriptionData.status === "trialing",
      autoRenew: true,
      status: subscriptionData.status,
    };

    await existingUser.save();
    console.log(`✅ Updated existing user: ${existingUser._id}`);
    return existingUser;
  }

  // Create new user
  const hashedPassword = userData.password ? await bcrypt.hash(userData.password, 12) : undefined;

  const newUser = new User({
    firstName: userData.firstName,
    lastName: userData.lastName,
    email: userData.email,
    password: hashedPassword, // Will be undefined for passwordless users
    mobile: cleanedMobile,
    role: "user",
    stripeCustomerId: subscriptionData.customerId,
    stripeSubscriptionId: subscriptionData.subscriptionId,
    subscription: {
      packageId: subscriptionData.packageId,
      startDate: new Date(),
      endDate: undefined, // Subscriptions don't have end dates
      isActive: subscriptionData.status === "active" || subscriptionData.status === "trialing",
      autoRenew: true,
      status: subscriptionData.status,
      pendingChange: undefined, // Initialize pendingChange field for subscription management
      lastDowngradeDate: undefined, // Initialize lastDowngradeDate field for security
    },
    oneTimePackages: [], // Initialize empty array
    accumulatedEntries: 0, // Will be added via webhook only
    entryWallet: 0, // Deprecated
    rewardsPoints: 0, // Will be added via webhook only
    isEmailVerified: false,
    isActive: true,
    savedPaymentMethods: [], // Payment method will be saved by webhook after payment succeeds
  });

  await newUser.save();
  console.log(`✅ Created user account: ${newUser._id}`);
  return newUser;
}
