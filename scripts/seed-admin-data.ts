#!/usr/bin/env npx tsx

/**
 * Admin User Seeding Script for Tools Australia
 *
 * This script seeds the database with ONE admin user only.
 *
 * Usage: npx tsx scripts/seed-admin-data.ts
 */

import mongoose from "mongoose";
import { config } from "dotenv";
import path from "path";
import bcrypt from "bcryptjs";

// Load environment variables
config({ path: path.resolve(process.cwd(), ".env.local") });

// Import User model
import User from "@/models/User";

// Admin user data
const adminUser = {
  firstName: "Admin",
  lastName: "User",
  email: "admin@toolsaustralia.com.au",
  password: "admin123", // Will be hashed
  mobile: "+61412345678",
  role: "admin" as const,
  profileSetupCompleted: true,
  isEmailVerified: true,
  state: "NSW",
};

async function seedAdminUser() {
  try {
    console.log("🌱 Starting Admin User Seeding...\n");

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI!);
    console.log("✅ Connected to MongoDB\n");

    // Seed Admin User
    console.log("👤 Seeding Admin User...");
    const existingAdmin = await User.findOne({ email: adminUser.email });
    if (existingAdmin) {
      console.log(`   ⚠️  Admin user ${adminUser.email} already exists, skipping...`);
    } else {
      const hashedPassword = await bcrypt.hash(adminUser.password!, 12);
      const newAdminUser = new User({
        ...adminUser,
        password: hashedPassword,
        createdAt: new Date(),
        updatedAt: new Date(),
        // Initialize all required fields to avoid schema issues
        subscription: {
          packageId: "",
          startDate: new Date(),
          isActive: false,
          autoRenew: true,
          status: "incomplete",
        },
        oneTimePackages: [],
        accumulatedEntries: 0,
        entryWallet: 0,
        rewardsPoints: 0,
        cart: [],
        isActive: true,
        savedPaymentMethods: [],
        upsellPurchases: [],
        upsellStats: {
          totalShown: 0,
          totalAccepted: 0,
          totalDeclined: 0,
          lastShown: null,
        },
        redemptionHistory: [], // Explicitly set empty array
        profileSetupCompleted: true,
        isEmailVerified: true,
        isMobileVerified: false,
      });

      await newAdminUser.save();
      console.log(`   ✅ Created admin user: ${adminUser.email}`);
    }
    console.log("");

    console.log("🎉 Admin user seeding completed successfully!");
    console.log("\n🔑 Admin Login Credentials:");
    console.log("   • Email: admin@toolsaustralia.com.au");
    console.log("   • Password: Admin123!@#");
  } catch (error) {
    console.error("❌ Error seeding admin user:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("\n🔌 Disconnected from MongoDB");
  }
}

// Run the seeding function
if (require.main === module) {
  seedAdminUser();
}

export default seedAdminUser;
