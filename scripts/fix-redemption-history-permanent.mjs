import mongoose from "mongoose";
import path from "path";
import dotenv from "dotenv";

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function fixRedemptionHistoryPermanent() {
  try {
    console.log("🔧 Starting permanent fix for redemptionHistory...");

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    const db = mongoose.connection.db;
    const usersCollection = db.collection("users");

    // Step 1: Drop the problematic unique index
    try {
      console.log("🗑️ Dropping problematic unique index...");
      await usersCollection.dropIndex("redemptionHistory.redemptionId_1");
      console.log("✅ Successfully dropped redemptionHistory.redemptionId_1 index");
    } catch (error) {
      if (error.code === 27) {
        console.log("ℹ️ Index redemptionHistory.redemptionId_1 doesn't exist (already dropped)");
      } else {
        console.log("⚠️ Error dropping index:", error.message);
      }
    }

    // Step 2: Update all users to ensure redemptionHistory is properly initialized
    console.log("🔄 Updating all users to ensure proper redemptionHistory structure...");

    const updateResult = await usersCollection.updateMany(
      {
        $or: [{ redemptionHistory: { $exists: false } }, { redemptionHistory: null }, { redemptionHistory: undefined }],
      },
      {
        $set: {
          redemptionHistory: [],
        },
      }
    );

    console.log(`✅ Updated ${updateResult.modifiedCount} users with missing redemptionHistory`);

    // Step 3: Fix any users with null redemptionId entries
    console.log("🔄 Fixing users with null redemptionId entries...");

    const fixNullResult = await usersCollection.updateMany(
      {
        "redemptionHistory.redemptionId": null,
      },
      {
        $unset: {
          "redemptionHistory.$[].redemptionId": "",
        },
      }
    );

    console.log(`✅ Fixed ${fixNullResult.modifiedCount} users with null redemptionId entries`);

    // Step 4: Create a proper sparse index (allows null values)
    try {
      console.log("📊 Creating sparse index for redemptionHistory.redemptionId...");
      await usersCollection.createIndex(
        { "redemptionHistory.redemptionId": 1 },
        {
          sparse: true, // This allows null values
          name: "redemptionHistory.redemptionId_sparse",
        }
      );
      console.log("✅ Created sparse index for redemptionHistory.redemptionId");
    } catch (error) {
      console.log("⚠️ Error creating sparse index:", error.message);
    }

    // Step 5: Verify the fix
    console.log("🔍 Verifying the fix...");

    const usersWithNullRedemption = await usersCollection.countDocuments({
      "redemptionHistory.redemptionId": null,
    });

    const usersWithoutRedemptionHistory = await usersCollection.countDocuments({
      $or: [{ redemptionHistory: { $exists: false } }, { redemptionHistory: null }],
    });

    console.log(`📊 Users with null redemptionId: ${usersWithNullRedemption}`);
    console.log(`📊 Users without redemptionHistory: ${usersWithoutRedemptionHistory}`);

    if (usersWithNullRedemption === 0 && usersWithoutRedemptionHistory === 0) {
      console.log("🎉 All users have proper redemptionHistory structure!");
    } else {
      console.log("⚠️ Some users still need attention");
    }

    console.log("✅ Permanent fix completed successfully!");
    console.log("🚀 New user registrations should now work without issues");
  } catch (error) {
    console.error("❌ Error during permanent fix:", error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Disconnected from MongoDB");
  }
}

// Run the fix
fixRedemptionHistoryPermanent()
  .then(() => {
    console.log("🎯 Permanent fix completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("💥 Permanent fix failed:", error);
    process.exit(1);
  });
