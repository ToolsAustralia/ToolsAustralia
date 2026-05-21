#!/usr/bin/env npx tsx

/**
 * Find Users with Multiple Active or Overdue Stripe Subscriptions
 *
 * Identifies Stripe customers who have 2+ subscriptions in problematic states:
 * - active & active
 * - overdue & active (past_due/unpaid + active)
 * - overdue & overdue
 *
 * These users may have duplicate subscriptions due to payment/billing edge cases
 * and need manual account cleanup.
 *
 * Usage: npx tsx scripts/find-duplicate-stripe-subscriptions.ts
 *    or: npm run find:duplicate-subscriptions
 */

import { config } from "dotenv";
import path from "path";

// Load env first (before Stripe init which reads STRIPE_SECRET_KEY)
config({ path: path.resolve(process.cwd(), ".env.local") });

import mongoose from "mongoose";
import Stripe from "stripe";
import User from "@/models/User";
import { getSubscriptionPeriodEnd } from "@/utils/payment/stripe/subscription-period";

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("STRIPE_SECRET_KEY is not set. Ensure .env.local is loaded.");
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-08-27.basil",
});

const RELEVANT_STATUSES = ["active", "past_due", "unpaid"] as const;

type RelevantStatus = (typeof RELEVANT_STATUSES)[number];

interface SubscriptionSummary {
  id: string;
  status: string;
  currentPeriodEnd: number;
  created: number;
}

function isRelevantStatus(status: string): status is RelevantStatus {
  return RELEVANT_STATUSES.includes(status as RelevantStatus);
}

function formatPeriodEnd(ts: number): string {
  if (!ts || !Number.isFinite(ts)) return "(n/a)";
  const d = new Date(ts * 1000);
  return isNaN(d.getTime()) ? "(n/a)" : d.toISOString().split("T")[0];
}

async function findDuplicateSubscribers() {
  try {
    console.log("🔍 Finding users with multiple active/overdue Stripe subscriptions...\n");

    // Validate env
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("STRIPE_SECRET_KEY environment variable is not set");
    }
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI environment variable is not set");
    }

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Connected to MongoDB\n");

    // 1. Fetch subscriptions from Stripe (paginated)
    // Default (no status) = non-canceled only (active, past_due, unpaid, trialing, etc.)
    // Avoid status: "all" - it includes every canceled sub ever and is very slow
    const customerSubscriptions = new Map<string, SubscriptionSummary[]>();

    console.log("📋 Fetching subscriptions from Stripe...");
    let hasMore = true;
    let startingAfter: string | undefined;

    while (hasMore) {
      const subscriptions = await stripe.subscriptions.list({
        limit: 100,
        ...(startingAfter && { starting_after: startingAfter }),
      });

      for (const sub of subscriptions.data) {
        if (!sub.customer || typeof sub.customer !== "string") continue;
        if (!isRelevantStatus(sub.status)) continue;

        const periodEnd = getSubscriptionPeriodEnd(sub);
        const summary: SubscriptionSummary = {
          id: sub.id,
          status: sub.status,
          currentPeriodEnd: periodEnd ?? 0,
          created: sub.created,
        };

        const existing = customerSubscriptions.get(sub.customer) ?? [];
        existing.push(summary);
        customerSubscriptions.set(sub.customer, existing);
      }

      hasMore = subscriptions.has_more;
      if (hasMore && subscriptions.data.length > 0) {
        startingAfter = subscriptions.data[subscriptions.data.length - 1].id;
      }
    }

    console.log(`   Fetched subscriptions for ${customerSubscriptions.size} unique Stripe customers\n`);

    // 2. Filter to customers with 2+ relevant subscriptions
    const customersWithDuplicates: Array<{
      stripeCustomerId: string;
      subscriptions: SubscriptionSummary[];
    }> = [];

    for (const [customerId, subs] of customerSubscriptions.entries()) {
      if (subs.length >= 2) {
        customersWithDuplicates.push({
          stripeCustomerId: customerId,
          subscriptions: subs.sort((a, b) => a.created - b.created),
        });
      }
    }

    console.log(`⚠️  Found ${customersWithDuplicates.length} Stripe customers with 2+ active/overdue subscriptions\n`);

    if (customersWithDuplicates.length === 0) {
      console.log("✅ No duplicate subscriptions found. Exiting.");
      await mongoose.disconnect();
      return;
    }

    // 3. Resolve to our User records
    const results: Array<{
      user: { _id: string; email: string; firstName: string; lastName: string; stripeCustomerId: string };
      subscriptions: SubscriptionSummary[];
      combo: string;
    }> = [];

    for (const { stripeCustomerId, subscriptions } of customersWithDuplicates) {
      const user = await User.findOne({ stripeCustomerId }).select(
        "_id email firstName lastName stripeCustomerId stripeSubscriptionId"
      );

      const statusCombo = subscriptions.map((s) => s.status).join(" + ");
      results.push({
        user: user
          ? {
              _id: user._id.toString(),
              email: user.email,
              firstName: user.firstName ?? "",
              lastName: user.lastName ?? "",
              stripeCustomerId,
            }
          : {
              _id: "(no user in DB)",
              email: "(unknown)",
              firstName: "",
              lastName: "",
              stripeCustomerId,
            },
        subscriptions,
        combo: statusCombo,
      });
    }

    // 4. Output report
    console.log("=".repeat(80));
    console.log("📊 USERS WITH DUPLICATE ACTIVE/OVERDUE SUBSCRIPTIONS");
    console.log("=".repeat(80));

    const withUser = results.filter((r) => r.user._id !== "(no user in DB)");
    const noUserInDb = results.filter((r) => r.user._id === "(no user in DB)");

    if (withUser.length > 0) {
      console.log("\n👤 Users in your database (can be fixed):\n");
      withUser.forEach((r, i) => {
        console.log(`${i + 1}. ${r.user.email} (${r.user.firstName} ${r.user.lastName})`);
        console.log(`   User ID: ${r.user._id}`);
        console.log(`   Stripe Customer: ${r.user.stripeCustomerId}`);
        console.log(`   Subscription combo: ${r.combo}`);
        r.subscriptions.forEach((s) => {
          const endDate = formatPeriodEnd(s.currentPeriodEnd);
          console.log(`      - ${s.id} | ${s.status} | period ends ${endDate}`);
        });
        console.log();
      });
    }

    if (noUserInDb.length > 0) {
      console.log("\n⚠️  Stripe customers NOT found in your DB (Stripe-only, may be test/deleted users):\n");
      noUserInDb.forEach((r, i) => {
        console.log(`${i + 1}. Stripe Customer: ${r.user.stripeCustomerId}`);
        console.log(`   Subscription combo: ${r.combo}`);
        r.subscriptions.forEach((s) => {
          const endDate = formatPeriodEnd(s.currentPeriodEnd);
          console.log(`      - ${s.id} | ${s.status} | period ends ${endDate}`);
        });
        console.log();
      });
    }

    console.log("=".repeat(80));
    console.log("📈 Summary:");
    console.log(`   Total Stripe customers with duplicates: ${customersWithDuplicates.length}`);
    console.log(`   Matched to your DB: ${withUser.length}`);
    console.log(`   Not in DB (Stripe-only): ${noUserInDb.length}`);
    console.log("=".repeat(80));
    console.log("\n💡 Next steps: For each user above, review in Stripe Dashboard and cancel");
    console.log("   the duplicate subscription, then sync your DB if needed.\n");
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Disconnected from MongoDB");
  }
}

if (require.main === module) {
  findDuplicateSubscribers();
}

export default findDuplicateSubscribers;
