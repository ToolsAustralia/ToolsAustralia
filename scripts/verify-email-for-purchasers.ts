#!/usr/bin/env npx tsx

/**
 * Temporary Script: Verify Email for Users with Purchases
 * 
 * This script sets isEmailVerified to true for all users who have made
 * any actual purchase on the website (orders, subscriptions, one-time packages,
 * mini-draw packages, upsells, or have saved payment methods). Note: Stripe customer ID
 * alone is NOT considered a purchase indicator, as it can be created without completing a purchase.
 * 
 * Usage: npx tsx scripts/verify-email-for-purchasers.ts
 */

import mongoose from "mongoose";
import { config } from "dotenv";
import path from "path";

// Load environment variables
config({ path: path.resolve(process.cwd(), ".env.local") });

// Import models
import User from "@/models/User";
import Order from "@/models/Order";

async function verifyEmailForPurchasers() {
  try {
    console.log("🚀 Starting email verification for purchasers...\n");

    // Connect to MongoDB
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI environment variable is not set");
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Connected to MongoDB\n");

    // Find all unique user IDs who have made actual purchases
    // Only checking for confirmed purchases, not just Stripe customer IDs
    // (Stripe customer ID can be created without completing a purchase)
    
    // Method 1: Users with orders (products, tickets/mini-draws, or memberships)
    console.log("📦 Finding users with orders...");
    const usersWithOrders = await Order.distinct("user");
    console.log(`   Found ${usersWithOrders.length} unique users with orders`);

    // Method 2: Users with active subscriptions
    console.log("📋 Finding users with active subscriptions...");
    const usersWithSubscriptions = await User.distinct("_id", {
      "subscription.isActive": true,
    });
    console.log(`   Found ${usersWithSubscriptions.length} unique users with active subscriptions`);

    // Method 3: Users with one-time packages
    console.log("🎁 Finding users with one-time packages...");
    const usersWithOneTimePackages = await User.distinct("_id", {
      oneTimePackages: { $exists: true, $ne: [] },
    });
    console.log(`   Found ${usersWithOneTimePackages.length} unique users with one-time packages`);

    // Method 4: Users with mini-draw packages
    console.log("🎫 Finding users with mini-draw packages...");
    const usersWithMiniDrawPackages = await User.distinct("_id", {
      miniDrawPackages: { $exists: true, $ne: [] },
    });
    console.log(`   Found ${usersWithMiniDrawPackages.length} unique users with mini-draw packages`);

    // Method 5: Users with upsell purchases
    console.log("🛒 Finding users with upsell purchases...");
    const usersWithUpsells = await User.distinct("_id", {
      upsellPurchases: { $exists: true, $ne: [] },
    });
    console.log(`   Found ${usersWithUpsells.length} unique users with upsell purchases`);

    // Method 6: Users with saved payment methods
    console.log("💳 Finding users with saved payment methods...");
    const usersWithSavedPaymentMethods = await User.distinct("_id", {
      savedPaymentMethods: { $exists: true, $ne: [] },
    });
    console.log(`   Found ${usersWithSavedPaymentMethods.length} unique users with saved payment methods\n`);

    // Combine all user IDs and get unique set
    const allPurchaserIds = new Set<string>();
    
    // Convert ObjectIds to strings
    usersWithOrders.forEach((id) => allPurchaserIds.add(id.toString()));
    usersWithSubscriptions.forEach((id) => allPurchaserIds.add(id.toString()));
    usersWithOneTimePackages.forEach((id) => allPurchaserIds.add(id.toString()));
    usersWithMiniDrawPackages.forEach((id) => allPurchaserIds.add(id.toString()));
    usersWithUpsells.forEach((id) => allPurchaserIds.add(id.toString()));
    usersWithSavedPaymentMethods.forEach((id) => allPurchaserIds.add(id.toString()));

    const uniquePurchaserIds = Array.from(allPurchaserIds);
    console.log(`📊 Total unique users with purchases: ${uniquePurchaserIds.length}\n`);

    if (uniquePurchaserIds.length === 0) {
      console.log("⚠️  No users with purchases found. Exiting...");
      await mongoose.disconnect();
      return;
    }

    // Find users who need email verification
    console.log("🔍 Finding users who need email verification...");
    const usersToUpdate = await User.find({
      _id: { $in: uniquePurchaserIds },
      isEmailVerified: { $ne: true },
    }).select("_id email firstName lastName isEmailVerified");

    console.log(`   Found ${usersToUpdate.length} users with purchases who need email verification\n`);

    if (usersToUpdate.length > 0) {
      // Show preview of users to be updated
      console.log("👥 Users to be updated:");
      usersToUpdate.slice(0, 10).forEach((user) => {
        console.log(`   - ${user.email} (${user.firstName} ${user.lastName})`);
      });
      if (usersToUpdate.length > 10) {
        console.log(`   ... and ${usersToUpdate.length - 10} more\n`);
      } else {
        console.log();
      }

      // Update all users
      console.log("🔄 Updating email verification status...");
      const updateResult = await User.updateMany(
        {
          _id: { $in: usersToUpdate.map((u) => u._id) },
          isEmailVerified: { $ne: true },
        },
        {
          $set: {
            isEmailVerified: true,
          },
        }
      );

      console.log(`✅ Successfully updated ${updateResult.modifiedCount} users\n`);
    } else {
      console.log("✅ All purchasers already have verified emails!\n");
    }

    // Verify the update
    const verifiedCount = await User.countDocuments({
      _id: { $in: uniquePurchaserIds },
      isEmailVerified: true,
    });

    console.log("📈 Summary:");
    console.log(`   Total purchasers: ${uniquePurchaserIds.length}`);
    console.log(`   Users with verified emails: ${verifiedCount}`);
    console.log(`   Users still unverified: ${uniquePurchaserIds.length - verifiedCount}`);

    // Part 2: Revert users with only Stripe customer ID (no actual purchases) back to false
    console.log("\n" + "=".repeat(60));
    console.log("🔄 Part 2: Reverting users with only Stripe customer ID...\n");

    // Find users with Stripe customer ID but no actual purchases
    console.log("🔍 Finding users with Stripe customer ID but no purchases...");
    const purchaserObjectIds = uniquePurchaserIds.map((id) => new mongoose.Types.ObjectId(id));
    const usersWithOnlyStripe = await User.find({
      $and: [
        { stripeCustomerId: { $exists: true } },
        { stripeCustomerId: { $ne: null } },
        { stripeCustomerId: { $ne: "" } },
      ],
      _id: { $nin: purchaserObjectIds },
      isEmailVerified: true, // Only revert those who are currently verified
    }).select("_id email firstName lastName isEmailVerified stripeCustomerId");

    console.log(`   Found ${usersWithOnlyStripe.length} users with only Stripe customer ID (no purchases) who are verified\n`);

    if (usersWithOnlyStripe.length > 0) {
      // Show preview of users to be reverted
      console.log("👥 Users to be reverted (set to false):");
      usersWithOnlyStripe.slice(0, 10).forEach((user) => {
        console.log(`   - ${user.email} (${user.firstName} ${user.lastName})`);
      });
      if (usersWithOnlyStripe.length > 10) {
        console.log(`   ... and ${usersWithOnlyStripe.length - 10} more\n`);
      } else {
        console.log();
      }

      // Revert email verification status to false
      console.log("🔄 Reverting email verification status to false...");
      const revertResult = await User.updateMany(
        {
          _id: { $in: usersWithOnlyStripe.map((u) => u._id) },
          isEmailVerified: true,
        },
        {
          $set: {
            isEmailVerified: false,
          },
        }
      );

      console.log(`✅ Successfully reverted ${revertResult.modifiedCount} users back to unverified\n`);
    } else {
      console.log("✅ No users with only Stripe customer ID found to revert\n");
    }

    console.log("🎉 Email verification update completed successfully!");
  } catch (error) {
    console.error("❌ Error updating email verification:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("\n🔌 Disconnected from MongoDB");
  }
}

// Run the script
if (require.main === module) {
  verifyEmailForPurchasers();
}

export default verifyEmailForPurchasers;

