#!/usr/bin/env npx tsx

/**
 * Daily Metrics Seeding Script
 *
 * This script seeds the database with daily metrics data by:
 * 1. Fetching real Facebook ads insights from Marketing API (if credentials are configured)
 * 2. Using existing PaymentEvent and FacebookAdsInsight records
 * 3. Creating sample payment events for development (if none exist)
 * 4. Aggregating all data into DailyMetrics collection
 *
 * The script prioritizes real data from the Facebook Marketing API over sample data.
 * Sample data is only created for PaymentEvents when none exist (for development).
 *
 * Required environment variables (optional, for Facebook API):
 * - FACEBOOK_AD_ACCOUNT_ID
 * - FACEBOOK_MARKETING_ACCESS_TOKEN
 *
 * Usage: npx tsx scripts/seed-daily-metrics.ts
 */

import mongoose from "mongoose";
import { config } from "dotenv";
import path from "path";
import { subDays, startOfMonth, endOfMonth, addDays, eachDayOfInterval } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

// Load environment variables
config({ path: path.resolve(process.cwd(), ".env.local") });

// Import models and services
import connectDB from "@/lib/mongodb";
import { DailyMetricsService } from "@/services/metrics/DailyMetricsService";
import PaymentEvent from "@/models/PaymentEvent";
import FacebookAdsInsight from "@/models/FacebookAdsInsight";
import { fetchFacebookInsights } from "@/lib/facebook-marketing";

const AEST_TIMEZONE = "Australia/Sydney";

const dailyMetricsService = new DailyMetricsService();

async function seedDailyMetrics() {
  try {
    console.log("🌱 Starting Daily Metrics Seeding...\n");

    // Connect to MongoDB
    await connectDB();
    console.log("✅ Connected to MongoDB\n");

    // Get date range for last 3 months
    const today = new Date();
    const threeMonthsAgo = subDays(today, 90);
    const startDate = startOfMonth(threeMonthsAgo);
    const endDate = endOfMonth(today);

    console.log(`📅 Aggregating metrics from ${startDate.toISOString().split("T")[0]} to ${endDate.toISOString().split("T")[0]}\n`);

    // Check if we have any payment events or Facebook ads data
    console.log(`🔍 Checking for existing data in range: ${startDate.toISOString()} to ${endDate.toISOString()}\n`);
    
    const paymentEventCount = await PaymentEvent.countDocuments({
      eventType: "BenefitsGranted",
      timestamp: { $gte: startDate, $lte: endDate },
    });

    const facebookAdsCount = await FacebookAdsInsight.countDocuments({
      date: { $gte: startDate, $lte: endDate },
    });

    console.log(`📊 Found ${paymentEventCount} payment events`);
    console.log(`📊 Found ${facebookAdsCount} Facebook ads insights\n`);

    // Get sample data to verify structure
    if (paymentEventCount > 0) {
      const samplePayment = await PaymentEvent.findOne({
        eventType: "BenefitsGranted",
        timestamp: { $gte: startDate, $lte: endDate },
      }).lean();
      console.log(`📋 Sample PaymentEvent:`, {
        _id: samplePayment?._id,
        timestamp: samplePayment?.timestamp,
        price: samplePayment?.data?.price,
        packageType: samplePayment?.packageType,
      });
    }

    if (facebookAdsCount > 0) {
      const sampleAds = await FacebookAdsInsight.findOne({
        date: { $gte: startDate, $lte: endDate },
      }).lean();
      console.log(`📋 Sample FacebookAdsInsight:`, {
        date: sampleAds?.date,
        spend: sampleAds?.metrics?.spend,
        revenue: sampleAds?.metrics?.revenue,
        conversions: sampleAds?.metrics?.conversions,
      });
    }
    console.log("");

    // Handle missing Facebook ads data - fetch from Marketing API
    if (facebookAdsCount === 0) {
      console.log("⚠️  No Facebook ads insights found. Attempting to fetch from Marketing API...\n");
      
      const adAccountId = process.env.FACEBOOK_AD_ACCOUNT_ID;
      const accessToken = process.env.FACEBOOK_MARKETING_ACCESS_TOKEN;
      
      if (adAccountId && accessToken) {
        try {
          console.log(`📡 Fetching Facebook ads insights from Marketing API...`);
          console.log(`   Date range: ${startDate.toISOString().split("T")[0]} to ${endDate.toISOString().split("T")[0]}\n`);
          
          // Format dates in AEST timezone for Facebook API
          const startYear = parseInt(formatInTimeZone(startDate, AEST_TIMEZONE, "yyyy"), 10);
          const startMonth = parseInt(formatInTimeZone(startDate, AEST_TIMEZONE, "M"), 10);
          const startDay = parseInt(formatInTimeZone(startDate, AEST_TIMEZONE, "d"), 10);
          const startDateStr = `${startYear}-${String(startMonth).padStart(2, "0")}-${String(startDay).padStart(2, "0")}`;
          
          const endYear = parseInt(formatInTimeZone(endDate, AEST_TIMEZONE, "yyyy"), 10);
          const endMonth = parseInt(formatInTimeZone(endDate, AEST_TIMEZONE, "M"), 10);
          const endDay = parseInt(formatInTimeZone(endDate, AEST_TIMEZONE, "d"), 10);
          const endDateStr = `${endYear}-${String(endMonth).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`;
          
          // Fetch insights from Facebook Marketing API
          const insightsData = await fetchFacebookInsights(
            adAccountId,
            accessToken,
            { since: startDateStr, until: endDateStr },
            "account"
          );
          
          if (insightsData && insightsData.length > 0) {
            // Save insights to database
            const insightsToSave = insightsData.map((insight) => {
              // Use start date as the date field, with full range in dateRange
              const insightDate = new Date(startDate);
              insightDate.setUTCHours(0, 0, 0, 0);
              
              const insightEndDate = new Date(endDate);
              insightEndDate.setUTCHours(23, 59, 59, 999);
              
              return new FacebookAdsInsight({
                adAccountId,
                date: insightDate,
                dateRange: {
                  start: startDate,
                  end: endDate,
                },
                level: "account",
                metrics: insight.metrics,
                calculated: {
                  profit: insight.metrics.profit,
                  roas: insight.metrics.roas,
                  ctr: insight.metrics.ctr,
                  cpc: insight.metrics.cpc,
                },
                syncedAt: new Date(),
              });
            });
            
            await FacebookAdsInsight.insertMany(insightsToSave);
            console.log(`✅ Fetched and saved ${insightsToSave.length} Facebook ads insights from Marketing API`);
            
            // Verify they were created
            const verifyAdsCount = await FacebookAdsInsight.countDocuments({
              date: { $gte: startDate, $lte: endDate },
            });
            console.log(`   ✅ Verified: ${verifyAdsCount} Facebook ads insights in database`);
            
            // Show sample of what was fetched
            const sampleFetched = await FacebookAdsInsight.findOne({
              date: { $gte: startDate, $lte: endDate },
            }).lean();
            if (sampleFetched) {
              console.log(`   📋 Sample fetched insight:`, {
                date: sampleFetched.date,
                spend: sampleFetched.metrics?.spend,
                revenue: sampleFetched.metrics?.revenue,
                conversions: sampleFetched.metrics?.conversions,
              });
            }
            console.log("");
          } else {
            console.log("⚠️  No insights data returned from Facebook Marketing API\n");
          }
        } catch (error) {
          console.error("❌ Error fetching from Facebook Marketing API:", error);
          if (error instanceof Error) {
            console.error(`   Error message: ${error.message}`);
          }
          console.log("   ⚠️  Continuing without Facebook ads data. You can fetch it later via the admin panel.\n");
        }
      } else {
        console.log("⚠️  Facebook Marketing API credentials not configured.");
        console.log("   Please set FACEBOOK_AD_ACCOUNT_ID and FACEBOOK_MARKETING_ACCESS_TOKEN in .env.local");
        console.log("   Skipping Facebook ads data fetch.\n");
      }
    }
    
    // Handle missing payment events - create sample data for development
    if (paymentEventCount === 0) {
      console.log("⚠️  No payment events found. Creating sample data for development...\n");
      
      // Create sample payment events for the last 30 days
      const samplePaymentEvents = [];
      for (let i = 0; i < 30; i++) {
        const date = subDays(today, i);
        // Normalize to start of day UTC
        const dayStart = new Date(date);
        dayStart.setUTCHours(0, 0, 0, 0);
        
        const eventCount = Math.floor(Math.random() * 5) + 1; // 1-5 events per day
        
        for (let j = 0; j < eventCount; j++) {
          const paymentIntentId = `pi_seed_${i}_${j}_${Date.now()}`;
          const eventId = `BenefitsGranted-${paymentIntentId}`;
          const timestamp = new Date(dayStart.getTime() + j * 3600000); // Spread throughout the day
          
          samplePaymentEvents.push({
            _id: eventId,
            paymentIntentId: paymentIntentId,
            eventType: "BenefitsGranted",
            userId: new mongoose.Types.ObjectId(),
            packageType: ["membership", "one-time", "mini-draw"][Math.floor(Math.random() * 3)],
            data: {
              price: Math.floor(Math.random() * 200) + 50, // $50-$250
            },
            processedBy: "api",
            timestamp: timestamp,
          });
        }
      }

      await PaymentEvent.insertMany(samplePaymentEvents);
      console.log(`✅ Created ${samplePaymentEvents.length} sample payment events`);
      
      // Verify they were created
      const verifyPaymentCount = await PaymentEvent.countDocuments({
        eventType: "BenefitsGranted",
        timestamp: { $gte: startDate, $lte: endDate },
      });
      console.log(`   ✅ Verified: ${verifyPaymentCount} payment events in database`);
      
      // Show sample of what was created
      const sampleCreated = await PaymentEvent.findOne({
        eventType: "BenefitsGranted",
        timestamp: { $gte: startDate, $lte: endDate },
      }).lean();
      if (sampleCreated) {
        console.log(`   📋 Sample created event:`, {
          _id: sampleCreated._id,
          timestamp: sampleCreated.timestamp,
          price: sampleCreated.data?.price,
          packageType: sampleCreated.packageType,
        });
      }
      console.log("");
    }

    // Aggregate metrics for the date range
    console.log("🔄 Aggregating daily metrics...\n");
    console.log(`   Date range: ${startDate.toISOString()} to ${endDate.toISOString()}\n`);
    
    // Test aggregation for a single day first
    const testDate = subDays(today, 1);
    testDate.setUTCHours(0, 0, 0, 0);
    console.log(`🧪 Testing aggregation for single day: ${testDate.toISOString()}\n`);
    
    try {
      const testMetric = await dailyMetricsService.aggregateDailyMetrics(testDate);
      console.log(`   ✅ Test aggregation result:`, {
        date: testMetric.date,
        revenue: testMetric.revenue,
        adSpend: testMetric.adSpend,
        salesCount: testMetric.salesCount,
        conversions: testMetric.conversions,
        profit: testMetric.profit,
        roas: testMetric.roas,
      });
      console.log("");
    } catch (error) {
      console.error(`   ❌ Test aggregation failed:`, error);
      console.log("");
    }
    
    // Now aggregate for the full range
    console.log("🔄 Aggregating for full date range...\n");
    await dailyMetricsService.ensureDailyMetricsAggregated(startDate, endDate);

    // Verify the data was created
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error("Database connection not available");
    }
    const metricsCount = await db.collection("dailymetrics").countDocuments({
      date: { $gte: startDate, $lte: endDate },
    });

    console.log(`✅ Successfully aggregated ${metricsCount} days of metrics\n`);
    
    // Show sample of aggregated metrics (prefer days with data)
    if (metricsCount > 0) {
      // Find a day with actual revenue data
      const metricsWithData = await db.collection("dailymetrics").findOne({
        date: { $gte: startDate, $lte: endDate },
        revenue: { $gt: 0 },
      }, { sort: { date: -1 } });
      
      if (metricsWithData) {
        console.log(`📋 Sample aggregated metric (with data):`, {
          date: metricsWithData.date,
          revenue: metricsWithData.revenue,
          adSpend: metricsWithData.adSpend,
          salesCount: metricsWithData.salesCount,
          conversions: metricsWithData.conversions,
          profit: metricsWithData.profit,
          roas: metricsWithData.roas,
        });
      } else {
        // Fallback to any metric
        const sampleMetrics = await db.collection("dailymetrics").findOne({
          date: { $gte: startDate, $lte: endDate },
        }, { sort: { date: -1 } });
        if (sampleMetrics) {
          console.log(`📋 Sample aggregated metric:`, {
            date: sampleMetrics.date,
            revenue: sampleMetrics.revenue,
            adSpend: sampleMetrics.adSpend,
            salesCount: sampleMetrics.salesCount,
            conversions: sampleMetrics.conversions,
            profit: sampleMetrics.profit,
            roas: sampleMetrics.roas,
          });
        }
      }
      
      // Show summary stats
      const stats = await db.collection("dailymetrics").aggregate([
        {
          $match: {
            date: { $gte: startDate, $lte: endDate },
          },
        },
        {
          $group: {
            _id: null,
            daysWithRevenue: { $sum: { $cond: [{ $gt: ["$revenue", 0] }, 1, 0] } },
            daysWithAdSpend: { $sum: { $cond: [{ $gt: ["$adSpend", 0] }, 1, 0] } },
            totalRevenue: { $sum: "$revenue" },
            totalAdSpend: { $sum: "$adSpend" },
            totalSales: { $sum: "$salesCount" },
          },
        },
      ]).toArray();
      
      if (stats[0]) {
        console.log(`📊 Summary statistics:`, {
          totalDays: metricsCount,
          daysWithRevenue: stats[0].daysWithRevenue,
          daysWithAdSpend: stats[0].daysWithAdSpend,
          totalRevenue: `$${stats[0].totalRevenue.toFixed(2)}`,
          totalAdSpend: `$${stats[0].totalAdSpend.toFixed(2)}`,
          totalSales: stats[0].totalSales,
        });
      }
      console.log("");
    }
    
    console.log("🎉 Daily metrics seeding completed successfully!");
    console.log("\n📊 You can now view the metrics in the admin panel under 'Daily Metrics'");
  } catch (error) {
    console.error("❌ Error seeding daily metrics:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("\n🔌 Disconnected from MongoDB");
  }
}

// Run the seeding function
if (require.main === module) {
  seedDailyMetrics();
}

