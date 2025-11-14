/**
 * Script to fix the redemptionHistory.redemptionId unique index issue
 * This script drops the problematic unique index that's causing registration errors
 */

import mongoose from "mongoose";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function fixRedemptionHistoryIndex() {
  try {
    console.log("🔗 Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    const db = mongoose.connection.db;

    // Get the users collection
    const usersCollection = db.collection("users");

    // List all indexes on the users collection
    console.log("📋 Current indexes on users collection:");
    const indexes = await usersCollection.indexes();
    indexes.forEach((index) => {
      console.log(`  - ${index.name}: ${JSON.stringify(index.key)}`);
    });

    // Find and drop the problematic index
    const problematicIndex = indexes.find((index) => index.key && index.key["redemptionHistory.redemptionId"] === 1);

    if (problematicIndex) {
      console.log(`🗑️  Dropping problematic index: ${problematicIndex.name}`);
      await usersCollection.dropIndex(problematicIndex.name);
      console.log("✅ Index dropped successfully");
    } else {
      console.log("ℹ️  No problematic index found");
    }

    // List indexes again to confirm
    console.log("📋 Updated indexes on users collection:");
    const updatedIndexes = await usersCollection.indexes();
    updatedIndexes.forEach((index) => {
      console.log(`  - ${index.name}: ${JSON.stringify(index.key)}`);
    });

    console.log("✅ Script completed successfully");
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Disconnected from MongoDB");
  }
}

// Run the script
fixRedemptionHistoryIndex();
