/**
 * Verification Script: Gap Period Purchases
 *
 * Verifies that gap period purchases (Dec 27-29) are correctly attributed to Draw 2.
 * This script helps validate the cutoff date logic and draw-specific property calculations.
 *
 * Usage:
 *   npx tsx scripts/verify-gap-period-purchases.ts
 *
 * @module scripts/verify-gap-period-purchases
 */
import { config } from "dotenv";
import path from "path";

// Load environment variables from .env.local
config({ path: path.resolve(process.cwd(), ".env.local") });

import connectDB from "../src/lib/mongodb";
import User, { IUser } from "../src/models/User";
import MajorDraw from "../src/models/MajorDraw";
import {
  getTargetDrawForCalculation,
  calculateDrawSpecificProperties,
} from "../src/utils/integrations/klaviyo/klaviyo-draw-calculator";

/**
 * Format date for display
 */
function formatDate(date: Date): string {
  return date.toISOString().replace("T", " ").substring(0, 19);
}

/**
 * Main verification function
 */
async function verifyGapPeriodPurchases() {
  try {
    console.log("🔍 Starting gap period purchase verification...\n");
    await connectDB();

    // Step 1: Find Draw 2 first, then find Draw 1 (more reliable - works for all test scenarios)
    console.log("📊 Step 1: Finding draws...");
    const draw2 = await MajorDraw.findOne({
      status: { $in: ["active", "frozen"] },
    }).sort({ activationDate: -1 });

    if (!draw2) {
      console.error("❌ Draw 2 (active/frozen) not found");
      process.exit(1);
    }

    // Find Draw 1 - the draw that ended before Draw 2 activated (works for all test scenarios)
    // This works whether Draw 1 is "active", "frozen", "completed", or "queued"
    const draw1 = await MajorDraw.findOne({
      drawDate: { $lt: draw2.activationDate }, // Draw 1 ended before Draw 2 activated
    })
      .sort({ drawDate: -1 }); // Get the most recent one

    if (!draw1) {
      console.error("❌ Draw 1 not found (no draw found before Draw 2's activation)");
      console.log(`   Draw 2 activation: ${draw2.activationDate.toISOString()}`);
      console.log(`   Looking for draws with drawDate < ${draw2.activationDate.toISOString()}`);
      
      // List all draws for debugging
      const allDraws = await MajorDraw.find({})
        .sort({ drawDate: -1 })
        .select("name status drawDate activationDate freezeEntriesAt");
      console.log("\n📊 All draws in database:");
      allDraws.forEach((draw, index) => {
        console.log(`   ${index + 1}. ${draw.name}`);
        console.log(`      Status: ${draw.status}`);
        console.log(`      Draw Date: ${draw.drawDate?.toISOString() || "N/A"}`);
        console.log(`      Activation: ${draw.activationDate?.toISOString() || "N/A"}`);
        console.log(`      Freeze: ${draw.freezeEntriesAt?.toISOString() || "N/A"}`);
      });
      
      process.exit(1);
    }

    console.log(`✅ Draw 1: ${draw1.name}`);
    console.log(`   Status: ${draw1.status}`);
    console.log(`   Draw Date: ${formatDate(draw1.drawDate)}`);
    console.log(`   Freeze Date: ${formatDate(draw1.freezeEntriesAt)}`);
    console.log(`\n✅ Draw 2: ${draw2.name}`);
    console.log(`   Status: ${draw2.status}`);
    console.log(`   Activation Date: ${formatDate(draw2.activationDate)}`);
    console.log(`   Draw Date: ${formatDate(draw2.drawDate)}`);

    // Step 2: Get cutoff date (Draw 1's freezeEntriesAt)
    console.log("\n📅 Step 2: Calculating cutoff date...");
    const drawInfo = await getTargetDrawForCalculation();
    if (!drawInfo) {
      console.error("❌ Could not get target draw for calculation");
      process.exit(1);
    }

    const { targetDraw, cutoffDate } = drawInfo;
    console.log(`✅ Target Draw: ${targetDraw.name} (ID: ${targetDraw._id})`);
    console.log(`✅ Cutoff Date: ${formatDate(cutoffDate)}`);
    console.log(`   (This is Draw 1's freezeEntriesAt)`);

    // Step 3: Define gap period (Dec 27-29, 2025)
    // Note: Adjust these dates based on your actual gap period
    const gapPeriodStart = new Date("2025-12-27T00:00:00Z");
    const gapPeriodEnd = new Date("2025-12-29T23:59:59Z");

    console.log("\n📅 Step 3: Gap period definition:");
    console.log(`   Start: ${formatDate(gapPeriodStart)}`);
    console.log(`   End: ${formatDate(gapPeriodEnd)}`);
    console.log(`   Cutoff: ${formatDate(cutoffDate)}`);

    // Validate that cutoff is within or before gap period
    if (cutoffDate > gapPeriodEnd) {
      console.warn(`⚠️  WARNING: Cutoff date (${formatDate(cutoffDate)}) is AFTER gap period end`);
      console.warn(`   This means gap period purchases might not be counted for Draw 2`);
    } else if (cutoffDate < gapPeriodStart) {
      console.log(`✅ Cutoff date is BEFORE gap period - purchases in gap period will count for Draw 2`);
    } else {
      console.log(`✅ Cutoff date is WITHIN gap period - purchases after cutoff will count for Draw 2`);
    }

    // Step 4: Find users who renewed/purchased in gap period
    console.log("\n👥 Step 4: Finding users with gap period purchases...");

    // Find users with subscriptions that started in gap period
    const usersWithGapSubscriptions = await User.find({
      "subscription.isActive": true,
      "subscription.startDate": {
        $gte: gapPeriodStart,
        $lte: gapPeriodEnd,
      },
    })
      .select("email firstName lastName subscription.startDate")
      .limit(10)
      .lean();

    // Find users with one-time packages purchased in gap period
    const usersWithGapPackages = await User.find({
      "oneTimePackages.purchaseDate": {
        $gte: gapPeriodStart,
        $lte: gapPeriodEnd,
      },
    })
      .select("email firstName lastName oneTimePackages")
      .limit(10)
      .lean();

    console.log(`   Found ${usersWithGapSubscriptions.length} users with gap period subscriptions (showing first 10)`);
    console.log(`   Found ${usersWithGapPackages.length} users with gap period packages (showing first 10)`);

    // Step 5: Calculate draw-specific properties for sample users
    console.log("\n🧮 Step 5: Calculating draw-specific properties for sample users...\n");

    // Combine unique users
    const sampleUserIds = new Set<string>();
    usersWithGapSubscriptions.forEach((u) => sampleUserIds.add(String(u._id)));
    usersWithGapPackages.forEach((u) => sampleUserIds.add(String(u._id)));

    const sampleUsers = await User.find({
      _id: { $in: Array.from(sampleUserIds) },
    }).limit(10);

    if (sampleUsers.length === 0) {
      console.log("⚠️  No sample users found with gap period purchases");
      console.log("   This might be normal if no purchases occurred in the gap period");
      process.exit(0);
    }

    // Calculate and display properties for each sample user
    for (const user of sampleUsers) {
      const props = calculateDrawSpecificProperties(user, targetDraw, cutoffDate);

      console.log(`📧 User: ${user.email} (${user.firstName} ${user.lastName})`);
      
      // Check subscription
      if (user.subscription?.isActive && user.subscription?.startDate) {
        const subStart = new Date(user.subscription.startDate);
        const isInGap = subStart >= gapPeriodStart && subStart <= gapPeriodEnd;
        const isAfterCutoff = subStart >= cutoffDate;
        
        console.log(`   Subscription:`);
        console.log(`     Start Date: ${formatDate(subStart)}`);
        console.log(`     In Gap Period: ${isInGap ? "✅ YES" : "❌ NO"}`);
        console.log(`     After Cutoff: ${isAfterCutoff ? "✅ YES" : "❌ NO"}`);
        console.log(`     current_draw_subscription_active: ${props.current_draw_subscription_active ? "✅ TRUE" : "❌ FALSE"}`);
        
        // Validation
        if (isInGap && isAfterCutoff && !props.current_draw_subscription_active) {
          console.log(`     ⚠️  VALIDATION ERROR: Subscription should be active but is not!`);
        } else if (isInGap && isAfterCutoff && props.current_draw_subscription_active) {
          console.log(`     ✅ VALIDATION PASS: Subscription correctly attributed to Draw 2`);
        }
      }

      // Check one-time packages
      if (user.oneTimePackages && user.oneTimePackages.length > 0) {
        const gapPackages = user.oneTimePackages.filter((pkg) => {
          const purchaseDate = new Date(pkg.purchaseDate);
          return purchaseDate >= gapPeriodStart && purchaseDate <= gapPeriodEnd;
        });

        const packagesAfterCutoff = user.oneTimePackages.filter((pkg) => {
          const purchaseDate = new Date(pkg.purchaseDate);
          return purchaseDate >= cutoffDate;
        });

        console.log(`   One-Time Packages:`);
        console.log(`     Total Packages: ${user.oneTimePackages.length}`);
        console.log(`     In Gap Period: ${gapPackages.length}`);
        console.log(`     After Cutoff: ${packagesAfterCutoff.length}`);
        console.log(`     current_draw_one_time_packages: ${props.current_draw_one_time_packages}`);

        // Validation
        if (gapPackages.length > 0 && packagesAfterCutoff.length !== props.current_draw_one_time_packages) {
          console.log(`     ⚠️  VALIDATION ERROR: Package count mismatch!`);
          console.log(`        Expected: ${packagesAfterCutoff.length}, Got: ${props.current_draw_one_time_packages}`);
        } else if (gapPackages.length > 0 && packagesAfterCutoff.length === props.current_draw_one_time_packages) {
          console.log(`     ✅ VALIDATION PASS: Packages correctly attributed to Draw 2`);
        }
      }

      console.log(`   Draw Properties:`);
      console.log(`     current_draw_id: ${props.current_draw_id}`);
      console.log(`     current_draw_name: ${props.current_draw_name}`);
      console.log(`     current_draw_start_date: ${props.current_draw_start_date}`);
      console.log(``);
    }

    // Step 6: Summary
    console.log("\n📋 Step 6: Summary");
    console.log(`   ✅ Cutoff date: ${formatDate(cutoffDate)} (Draw 1's freezeEntriesAt)`);
    console.log(`   ✅ Gap period: ${formatDate(gapPeriodStart)} to ${formatDate(gapPeriodEnd)}`);
    console.log(`   ✅ Sample users verified: ${sampleUsers.length}`);
    console.log(`\n✅ Verification complete!`);
    console.log(`\n📋 Next steps:`);
    console.log(`   1. Check Klaviyo dashboard to verify profile properties match calculations`);
    console.log(`   2. Verify segments are working correctly with draw-specific properties`);
    console.log(`   3. Run migration script if properties need to be updated`);

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Verification failed:", error);
    process.exit(1);
  }
}

// Run verification
verifyGapPeriodPurchases();

