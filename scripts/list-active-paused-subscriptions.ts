#!/usr/bin/env npx tsx

/**
 * List MongoDB users who look "active" locally but whose Stripe subscription still has
 * `pause_collection` set (e.g. stale state after recovery). Use for manual Dashboard fix
 * or optional `--live --resume` to clear via API.
 *
 * Usage:
 *   npx tsx scripts/list-active-paused-subscriptions.ts [--limit=N]
 *   npx tsx scripts/list-active-paused-subscriptions.ts --live --resume [--limit=N]
 *
 * Env: .env.local — MONGODB_URI, STRIPE_SECRET_KEY
 */

import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env.local") });

const LIMIT_ARG = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = LIMIT_ARG ? Math.max(1, parseInt(LIMIT_ARG.split("=")[1] || "200", 10)) : 200;
const LIVE_RESUME = process.argv.includes("--live") && process.argv.includes("--resume");
const DELAY_MS = 150;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set (.env.local).");
    process.exit(1);
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error("STRIPE_SECRET_KEY is not set (.env.local).");
    process.exit(1);
  }

  const mongoose = await import("mongoose");
  const User = (await import("../src/models/User")).default;
  const { stripe } = await import("../src/lib/stripe");
  const {
    resumeAfterSuccessfulRenewalPayment,
    describePauseCollection,
  } = await import("../src/services/subscription/SubscriptionCollectionPauseService");

  console.log("\nActive local subscription + Stripe pause_collection audit");
  console.log(`   Mode: ${LIVE_RESUME ? "LIVE resume (clears pause_collection in Stripe)" : "dry-run (list only)"}`);
  console.log(`   Limit: ${LIMIT}\n`);

  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB\n");

  const users = await User.find({
    stripeSubscriptionId: { $exists: true, $nin: [null, ""] },
    "subscription.isActive": true,
    "subscription.status": { $in: ["active", "trialing"] },
  })
    .select("_id email stripeCustomerId stripeSubscriptionId subscription.status subscription.isActive")
    .limit(LIMIT)
    .lean();

  const csvEscape = (s: string) => (s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s);

  console.log("email,userId,stripeCustomerId,stripeSubscriptionId,dbStatus,stripeStatus,pauseBehavior,action");

  let matched = 0;
  let resumed = 0;
  let errors = 0;

  for (const u of users) {
    await sleep(DELAY_MS);
    const email = (u.email as string) || "";
    const userId = String(u._id);
    const customerId = (u.stripeCustomerId as string) || "";
    const subId = (u.stripeSubscriptionId as string) || "";
    const dbStatus = (u.subscription as { status?: string } | undefined)?.status ?? "";

    if (!subId) continue;

    try {
      const sub = await stripe.subscriptions.retrieve(subId);
      const pause = sub.pause_collection;
      if (pause == null) continue;

      matched++;
      const pauseBehavior = describePauseCollection(sub);
      const action = LIVE_RESUME ? "resume_attempted" : "list_only";

      console.log(
        [csvEscape(email), userId, customerId, subId, dbStatus, sub.status, pauseBehavior, action].join(",")
      );

      if (LIVE_RESUME) {
        try {
          await resumeAfterSuccessfulRenewalPayment(subId);
          resumed++;
          console.error(`   OK cleared pause_collection for ${email} sub=${subId}`);
        } catch (e) {
          errors++;
          console.error(
            `   FAIL could not resume ${email} sub=${subId}:`,
            e instanceof Error ? e.message : e
          );
        }
      }
    } catch (e) {
      const code = e && typeof e === "object" && "code" in e ? (e as { code?: string }).code : "";
      if (code === "resource_missing" || (e as { statusCode?: number }).statusCode === 404) {
        continue;
      }
      errors++;
      console.error(`   ERROR ${email} sub=${subId}:`, e instanceof Error ? e.message : e);
    }
  }

  console.error(`\nDone. Scanned up to ${users.length} user(s). pause_collection set: ${matched}. Resumed: ${resumed}. Errors: ${errors}.`);
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
