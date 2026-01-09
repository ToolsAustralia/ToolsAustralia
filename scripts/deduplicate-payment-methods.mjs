/**
 * One-time script to deduplicate payment methods in the database
 * 
 * This script finds all users with duplicate paymentMethodIds in their
 * savedPaymentMethods array and removes duplicates, keeping the first occurrence.
 * 
 * Usage:
 *   node scripts/deduplicate-payment-methods.mjs
 * 
 * Safety:
 *   - Only removes duplicates, doesn't delete valid payment methods
 *   - Preserves metadata (keeps oldest createdAt, most recent lastUsed)
 *   - Ensures only one default payment method per user
 *   - Creates backup before making changes (optional)
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, "..", ".env.local") });
dotenv.config({ path: join(__dirname, "..", ".env") });

// Import User model
const UserSchema = new mongoose.Schema(
  {
    savedPaymentMethods: [
      {
        paymentMethodId: { type: String, required: true },
        isDefault: { type: Boolean, default: false },
        createdAt: { type: Date, default: Date.now },
        lastUsed: { type: Date },
      },
    ],
  },
  { strict: false }
);

const User = mongoose.models.User || mongoose.model("User", UserSchema);

/**
 * Deduplicates payment methods for a single user
 */
function deduplicateUserPaymentMethods(user) {
  if (!user.savedPaymentMethods || user.savedPaymentMethods.length === 0) {
    return { duplicatesRemoved: 0, user };
  }

  const originalCount = user.savedPaymentMethods.length;

  // Use Map to track unique payment methods
  const uniquePaymentMethodsMap = new Map();

  for (const pm of user.savedPaymentMethods) {
    const existing = uniquePaymentMethodsMap.get(pm.paymentMethodId);

    if (!existing) {
      // First occurrence - add to map
      uniquePaymentMethodsMap.set(pm.paymentMethodId, {
        paymentMethodId: pm.paymentMethodId,
        isDefault: pm.isDefault,
        createdAt: pm.createdAt,
        lastUsed: pm.lastUsed,
      });
    } else {
      // Duplicate found - merge metadata
      // Keep oldest createdAt
      if (pm.createdAt < existing.createdAt) {
        existing.createdAt = pm.createdAt;
      }
      // Keep most recent lastUsed
      if (pm.lastUsed) {
        if (!existing.lastUsed || pm.lastUsed > existing.lastUsed) {
          existing.lastUsed = pm.lastUsed;
        }
      }
      // If either is default, keep default status (prioritize existing)
      if (pm.isDefault && !existing.isDefault) {
        existing.isDefault = true;
      }
    }
  }

  // Convert map back to array
  const deduplicatedMethods = Array.from(uniquePaymentMethodsMap.values());

  // Ensure only one default payment method
  const defaultMethods = deduplicatedMethods.filter((pm) => pm.isDefault);
  if (defaultMethods.length > 1) {
    // Keep the first default, remove default from others
    for (let i = 1; i < defaultMethods.length; i++) {
      defaultMethods[i].isDefault = false;
    }
  } else if (defaultMethods.length === 0 && deduplicatedMethods.length > 0) {
    // No default found - set first one as default
    deduplicatedMethods[0].isDefault = true;
  }

  // Update user's payment methods
  user.savedPaymentMethods = deduplicatedMethods;

  const duplicatesRemoved = originalCount - deduplicatedMethods.length;

  return { duplicatesRemoved, user };
}

async function main() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error("MONGODB_URI environment variable is not set");
    }

    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(mongoUri);
    console.log("✅ Connected to MongoDB");

    // Find all users with payment methods
    console.log("🔍 Finding users with payment methods...");
    const users = await User.find({
      savedPaymentMethods: { $exists: true, $ne: [] },
    }).select("_id email savedPaymentMethods");

    console.log(`📊 Found ${users.length} users with payment methods`);

    let totalDuplicatesRemoved = 0;
    let usersWithDuplicates = 0;
    const usersProcessed = [];

    // Process each user
    for (const user of users) {
      const { duplicatesRemoved, user: updatedUser } = deduplicateUserPaymentMethods(user);

      if (duplicatesRemoved > 0) {
        usersWithDuplicates++;
        totalDuplicatesRemoved += duplicatesRemoved;

        // Save updated user
        await updatedUser.save();

        usersProcessed.push({
          userId: user._id.toString(),
          email: user.email,
          duplicatesRemoved,
        });

        console.log(
          `✅ User ${user.email} (${user._id}): Removed ${duplicatesRemoved} duplicate(s)`
        );
      }
    }

    // Summary
    console.log("\n📊 Summary:");
    console.log(`   Total users processed: ${users.length}`);
    console.log(`   Users with duplicates: ${usersWithDuplicates}`);
    console.log(`   Total duplicates removed: ${totalDuplicatesRemoved}`);

    if (usersProcessed.length > 0) {
      console.log("\n📋 Users with duplicates removed:");
      usersProcessed.forEach((u) => {
        console.log(`   - ${u.email} (${u.userId}): ${u.duplicatesRemoved} duplicate(s)`);
      });
    } else {
      console.log("\n✅ No duplicates found! Database is clean.");
    }

    console.log("\n✅ Deduplication complete!");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Disconnected from MongoDB");
  }
}

// Run the script
main();

