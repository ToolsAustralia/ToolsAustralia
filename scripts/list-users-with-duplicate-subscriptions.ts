#!/usr/bin/env npx tsx

/**
 * List users who have exactly 2 active subscriptions in Stripe (active + trialing)
 *
 * Returns name and email for each such user. Uses Stripe customer data,
 * and optionally enriches with MongoDB User (firstName, lastName) when
 * stripeCustomerId matches.
 *
 * Usage:
 *   npx tsx scripts/list-users-with-duplicate-subscriptions.ts [--use-mongo] [--json]
 *
 * Options:
 *   --use-mongo   Enrich names from MongoDB User (firstName + lastName) when available
 *   --json        Output as JSON array instead of table
 *
 * Env: .env.local must have STRIPE_SECRET_KEY. MONGODB_URI required only if --use-mongo.
 */

import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env.local") });

const USE_MONGO = process.argv.includes("--use-mongo");
const OUTPUT_JSON = process.argv.includes("--json");

const DELAY_BETWEEN_STRIPE_MS = 150;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface UserWithDuplicateSubs {
  stripeCustomerId: string;
  email: string;
  name: string;
  subscriptionIds: string[];
}

async function main() {
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error("❌ STRIPE_SECRET_KEY is not set. Set it in .env.local and try again.");
    process.exit(1);
  }
  if (USE_MONGO && !process.env.MONGODB_URI) {
    console.error("❌ MONGODB_URI is not set. Required when using --use-mongo.");
    process.exit(1);
  }

  const { stripe } = await import("../src/lib/stripe");

  console.log("\n📋 Finding Stripe customers with exactly 2 active subscriptions\n");

  // Map: customerId -> subscription ids (includes both active and trialing)
  const customerToSubscriptions = new Map<string, string[]>();

  for (const status of ["active", "trialing"] as const) {
    let hasMore = true;
    let startingAfter: string | undefined;

    while (hasMore) {
      const subs = await stripe.subscriptions.list({
        status,
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      });

      for (const sub of subs.data) {
        const customerId =
          typeof sub.customer === "string" ? sub.customer : (sub.customer as { id?: string })?.id;
        if (!customerId) continue;

        const existing = customerToSubscriptions.get(customerId) ?? [];
        existing.push(sub.id);
        customerToSubscriptions.set(customerId, existing);
      }

      hasMore = subs.has_more;
      if (hasMore && subs.data.length > 0) {
        startingAfter = subs.data[subs.data.length - 1]!.id;
      }

      await sleep(DELAY_BETWEEN_STRIPE_MS);
    }
  }

  // Filter to customers with exactly 2 subscriptions
  const duplicateCustomerIds = Array.from(customerToSubscriptions.entries())
    .filter(([, ids]) => ids.length === 2)
    .map(([cid]) => cid);

  if (duplicateCustomerIds.length === 0) {
    console.log("✅ No customers found with exactly 2 active subscriptions.");
    process.exit(0);
  }

  console.log(`Found ${duplicateCustomerIds.length} customer(s) with 2 active subscriptions.\n`);

  // Optional: Load MongoDB users for name enrichment
  const mongoUsersByStripeId: Map<string, { firstName: string; lastName: string }> = new Map();
  if (USE_MONGO) {
    const mongoose = await import("mongoose");
    const User = (await import("../src/models/User")).default;
    await mongoose.connect(process.env.MONGODB_URI!);
    const users = await User.find({
      stripeCustomerId: { $in: duplicateCustomerIds },
    })
      .select("stripeCustomerId firstName lastName")
      .lean();
    for (const u of users) {
      if (u.stripeCustomerId) {
        mongoUsersByStripeId.set(u.stripeCustomerId, {
          firstName: u.firstName ?? "",
          lastName: u.lastName ?? "",
        });
      }
    }
  }

  const results: UserWithDuplicateSubs[] = [];

  for (const customerId of duplicateCustomerIds) {
    await sleep(DELAY_BETWEEN_STRIPE_MS);

    let customer;
    try {
      customer = await stripe.customers.retrieve(customerId);
    } catch (err) {
      console.error(`   ⚠ Could not retrieve customer ${customerId}:`, err);
      continue;
    }

    if (customer.deleted) continue;

    const email = customer.email ?? "";
    let name = customer.name ?? "";

    if (USE_MONGO) {
      const mongoUser = mongoUsersByStripeId.get(customerId);
      if (mongoUser && (mongoUser.firstName || mongoUser.lastName)) {
        name = [mongoUser.firstName, mongoUser.lastName].filter(Boolean).join(" ").trim();
      }
      if (!name && customer.name) name = customer.name;
    }

    const subscriptionIds = customerToSubscriptions.get(customerId) ?? [];
    results.push({
      stripeCustomerId: customerId,
      email,
      name,
      subscriptionIds,
    });
  }

  if (OUTPUT_JSON) {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  // Table output
  console.log("┌──────────────────────────────────────────────────────────────────────────────────┐");
  console.log("│ Name                          │ Email                                           │");
  console.log("├──────────────────────────────────────────────────────────────────────────────────┤");

  const nameWidth = 30;
  const emailWidth = 48;

  for (const r of results) {
    const nameStr = (r.name || "(no name)").padEnd(nameWidth).slice(0, nameWidth);
    const emailStr = (r.email || "(no email)").padEnd(emailWidth).slice(0, emailWidth);
    console.log(`│ ${nameStr} │ ${emailStr} │`);
    console.log(`│   Subscriptions: ${r.subscriptionIds.join(", ")}`);
  }

  console.log("└──────────────────────────────────────────────────────────────────────────────────┘");
  console.log(`\nTotal: ${results.length} user(s) with 2 active subscriptions.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
