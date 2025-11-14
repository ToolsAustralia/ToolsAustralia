import mongoose from "mongoose";
import path from "path";
import dotenv from "dotenv";

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

async function fixDatabaseOnce() {
  try {
    console.log("🔧 Fixing database redemptionHistory issue...");

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    const db = mongoose.connection.db;
    const usersCollection = db.collection("users");

    // Drop the problematic unique index
    try {
      console.log("🗑️ Dropping problematic unique index...");
      await usersCollection.dropIndex("redemptionHistory.redemptionId_1");
      console.log("✅ Index dropped successfully");
    } catch (error) {
      if (error.code === 27) {
        console.log("ℹ️ Index doesn't exist (already dropped)");
      } else {
        console.log("⚠️ Error:", error.message);
      }
    }

    // Update all users to have proper redemptionHistory
    console.log("🔄 Updating all users...");
    const result = await usersCollection.updateMany(
      {
        $or: [{ redemptionHistory: { $exists: false } }, { redemptionHistory: null }],
      },
      {
        $set: { redemptionHistory: [] },
      }
    );
    console.log(`✅ Updated ${result.modifiedCount} users`);

    console.log("🎉 Database fix completed! New user registrations should work now.");
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Disconnected");
  }
}

fixDatabaseOnce();
