#!/usr/bin/env npx tsx

/**
 * Repair stripeSubscriptionId for users whose DB points to a dead subscription
 * while they have an active subscription under the same Stripe customer.
 *
 * Scenario: Race condition during checkout creates two subscriptions. The DB
 * ends up with the ID of the one that went incomplete_expired, while the
 * actually-paid subscription has a different ID. This causes the app to think
 * the user is expired because the repair-expired-enddates script (correctly)
 * skips dead subscriptions.
 *
 * This script:
 *   1. Finds users where stripeSubscriptionId exists and the stored sub is
 *      NOT active/trialing in Stripe (incomplete, incomplete_expired, canceled, or 404).
 *   2. Looks up the Stripe customer for an active/trialing subscription.
 *   3. Updates stripeSubscriptionId (and endDate/isActive/status) from the real sub.
 *
 * Safety:
 * - Dry-run by default: no DB writes unless --live is passed.
 * - --limit=N caps how many users are processed (default 100).
 * - Per-user try/catch; one failure does not abort the script.
 * - Rate-limit handling with retries on 429.
 *
 * Usage:
 *   npx tsx scripts/repair-wrong-stripe-subscription-ids.ts [--dry-run] [--live] [--limit=N]
 *
 * Options:
 *   --dry-run   Log what would be updated; no DB writes (default).
 *   --live      Perform DB updates.
 *   --limit=N   Max users to process (default 100).
 *
 * Env: .env.local must have MONGODB_URI and STRIPE_SECRET_KEY.
 */

import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env.local") });

const DRY_RUN = !process.argv.includes("--live");
const LIMIT_ARG = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = LIMIT_ARG ? Math.max(1, parseInt(LIMIT_ARG.split("=")[1] || "100", 10)) : 100;

const DELAY_BETWEEN_STRIPE_MS = 200;
const MAX_RETRIES_429 = 3;
const RETRY_AFTER_DEFAULT_MS = 5000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRetryAfterMs(err: unknown, attempt: number): number {
  const raw =
    err && typeof err === "object" && "raw" in err
      ? (err as { raw?: { headers?: Record<string, string> } }).raw
      : undefined;
  const retryAfter = raw?.headers?.["retry-after"];
  if (retryAfter != null) {
    const sec = parseInt(retryAfter, 10);
    if (!Number.isNaN(sec)) return Math.min(sec * 1000, 60_000);
  }
  return RETRY_AFTER_DEFAULT_MS * Math.pow(2, attempt);
}

// Use base Stripe.Subscription so we can assign from both retrieve() and list().data
type StripeSubscription = import("stripe").Stripe.Subscription;

async function retrieveWithRetry(
  stripe: typeof import("../src/lib/stripe").stripe,
  subId: string
): Promise<{ sub: StripeSubscription | null; error?: string; is404?: boolean }> {
  for (let attempt = 0; attempt <= MAX_RETRIES_429; attempt++) {
    try {
      const sub = await stripe.subscriptions.retrieve(subId);
      return { sub };
    } catch (e) {
      const code = e && typeof e === "object" && "code" in e ? (e as { code: string }).code : "";
      const statusCode =
        e && typeof e === "object" && "statusCode" in e ? (e as { statusCode?: number }).statusCode : undefined;
      if (code === "resource_missing_deleted" || statusCode === 404) {
        return { sub: null, is404: true };
      }
      if (code === "rate_limit" || statusCode === 429) {
        if (attempt < MAX_RETRIES_429) {
          const wait = getRetryAfterMs(e, attempt);
          console.log(`   [RETRY] 429, waiting ${Math.round(wait / 1000)}s`);
          await sleep(wait);
          continue;
        }
        return { sub: null, error: "429 after retries" };
      }
      return { sub: null, error: e instanceof Error ? e.message : String(e) };
    }
  }
  return { sub: null, error: "Max retries exceeded" };
}

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error("❌ MONGODB_URI is not set. Set it in .env.local and try again.");
    process.exit(1);
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error("❌ STRIPE_SECRET_KEY is not set. Set it in .env.local and try again.");
    process.exit(1);
  }

  const mongoose = await import("mongoose");
  const User = (await import("../src/models/User")).default;
  const { stripe } = await import("../src/lib/stripe");
  const { getSubscriptionPeriodEnd } = await import("../src/utils/payment/stripe/subscription-period");

  const now = new Date();
  console.log("\n🔧 Repair stripeSubscriptionId for users pointing to dead subscriptions");
  console.log(`   Mode: ${DRY_RUN ? "DRY RUN (no DB writes)" : "LIVE"}`);
  console.log(`   Limit: ${LIMIT}`);
  console.log(`   Now (UTC): ${now.toISOString()}`);
  console.log("");

  let totalChecked = 0;
  let corrected = 0;
  let skippedStoredActive = 0;
  let skippedNoActiveSub = 0;
  let skippedError = 0;
  let errors = 0;

  const correctedUsers: {
    email: string;
    userId: string;
    oldSubId: string;
    oldStatus: string;
    newSubId: string;
    newStatus: string;
    newEndDate: string;
  }[] = [];

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Connected to MongoDB\n");

    // Find users with expired endDate who have a stripeSubscriptionId
    // These are the ones most likely to have the wrong sub ID
    const candidates = await User.find({
      stripeSubscriptionId: { $exists: true, $nin: [null, ""] },
      stripeCustomerId: { $exists: true, $nin: [null, ""] },
      "subscription.endDate": { $lte: now },
      "subscription.packageId": { $exists: true, $ne: null },
    })
      .select("_id email stripeSubscriptionId stripeCustomerId subscription")
      .sort({ "subscription.endDate": 1 })
      .limit(LIMIT)
      .lean();

    console.log(`📊 Found ${candidates.length} candidate(s) with expired endDate to check\n`);

    if (candidates.length === 0) {
      console.log("✅ No candidates to process.");
      await mongoose.disconnect();
      process.exit(0);
    }

    if (!DRY_RUN) {
      const isProd =
        /production|mongodb\.net|\.mlab\.com/i.test(process.env.MONGODB_URI ?? "") &&
        process.env.CONFIRM_BACKFILL_PRODUCTION !== "1";
      if (isProd) {
        console.log("⚠️  MONGODB_URI looks like production. Set CONFIRM_BACKFILL_PRODUCTION=1 to skip countdown.");
        console.log("   Waiting 10s before any write. Press Ctrl+C to cancel...\n");
        await sleep(10_000);
      } else {
        console.log("⚠️  LIVE mode: will update database. Press Ctrl+C within 5s to cancel...\n");
        await sleep(5000);
      }
    }

    for (let i = 0; i < candidates.length; i++) {
      const u = candidates[i];
      const userId = (u._id as { toString: () => string }).toString();
      const email = (u.email as string) || "(no email)";
      const storedSubId = (u.stripeSubscriptionId as string) || "";
      const customerId = (u.stripeCustomerId as string) || "";

      if (!storedSubId || !customerId) continue;

      totalChecked++;
      await sleep(DELAY_BETWEEN_STRIPE_MS);

      // Step 1: Check if stored subscription is dead
      const { sub: storedSub, is404, error: retrieveError } = await retrieveWithRetry(stripe, storedSubId);

      if (retrieveError && !is404) {
        console.log(`   [ERROR] ${email} – could not retrieve stored sub: ${retrieveError}`);
        errors++;
        continue;
      }

      const storedStatus = is404 ? "deleted/404" : (storedSub?.status ?? "unknown");
      const isStoredDead =
        is404 ||
        storedStatus === "incomplete" ||
        storedStatus === "incomplete_expired" ||
        storedStatus === "canceled";

      if (!isStoredDead) {
        // Stored sub is still alive (active, trialing, past_due, etc.) — not our problem
        skippedStoredActive++;
        continue;
      }

      // Step 2: Find active subscription for this customer
      await sleep(DELAY_BETWEEN_STRIPE_MS);

      let activeSub: StripeSubscription | null = null;
      try {
        const activeSubs = await stripe.subscriptions.list({
          customer: customerId,
          status: "active",
          limit: 5,
        });
        if (activeSubs.data.length > 0) {
          activeSub = activeSubs.data[0];
        } else {
          // Try trialing
          const trialingSubs = await stripe.subscriptions.list({
            customer: customerId,
            status: "trialing",
            limit: 5,
          });
          if (trialingSubs.data.length > 0) {
            activeSub = trialingSubs.data[0];
          }
        }
      } catch (listErr) {
        console.log(`   [ERROR] ${email} – could not list customer subscriptions: ${listErr}`);
        errors++;
        continue;
      }

      if (!activeSub) {
        skippedNoActiveSub++;
        console.log(
          `   [SKIP] ${email} (${userId}) – stored sub ${storedSubId} is ${storedStatus}, but no active/trialing sub found for customer`
        );
        continue;
      }

      const periodEnd = getSubscriptionPeriodEnd(activeSub);
      const newEndDate = periodEnd != null ? new Date(periodEnd * 1000) : undefined;
      const newEndDateStr = newEndDate?.toISOString() ?? "(unknown)";

      if (DRY_RUN) {
        correctedUsers.push({
          email,
          userId,
          oldSubId: storedSubId,
          oldStatus: storedStatus,
          newSubId: activeSub.id,
          newStatus: activeSub.status,
          newEndDate: newEndDateStr,
        });
        console.log(
          `   [WOULD FIX] ${email} (${userId}) – ${storedSubId} (${storedStatus}) → ${activeSub.id} (${activeSub.status}), endDate → ${newEndDateStr}`
        );
        corrected++;
        continue;
      }

      // Step 3: Update the user
      try {
        const user = await User.findById(userId);
        if (!user || !user.subscription) {
          console.log(`   [SKIP] ${email} – user or subscription not found in DB`);
          continue;
        }

        user.stripeSubscriptionId = activeSub.id;
        user.subscription.isActive = true;
        user.subscription.status = activeSub.status;
        user.subscription.autoRenew = !activeSub.cancel_at_period_end;
        if (newEndDate) {
          user.subscription.endDate = newEndDate;
        }
        if (user.subscription.cancelledAt) {
          user.subscription.cancelledAt = undefined;
        }

        user.markModified("subscription");
        await user.save();

        correctedUsers.push({
          email,
          userId,
          oldSubId: storedSubId,
          oldStatus: storedStatus,
          newSubId: activeSub.id,
          newStatus: activeSub.status,
          newEndDate: newEndDateStr,
        });
        console.log(
          `   [FIXED] ${email} (${userId}) – ${storedSubId} (${storedStatus}) → ${activeSub.id} (${activeSub.status}), endDate → ${newEndDateStr}`
        );
        corrected++;
      } catch (saveErr) {
        console.error(`   [ERROR] ${email} (${userId}) – save failed:`, saveErr instanceof Error ? saveErr.message : saveErr);
        errors++;
      }
    }

    console.log("\n📊 Summary:");
    console.log(`   Total checked: ${totalChecked}`);
    console.log(`   Corrected: ${corrected}`);
    console.log(`   Skipped (stored sub still alive): ${skippedStoredActive}`);
    console.log(`   Skipped (no active sub found for customer): ${skippedNoActiveSub}`);
    console.log(`   Errors: ${errors}`);

    if (correctedUsers.length > 0) {
      console.log(`\n--- ${DRY_RUN ? "Would-be-corrected" : "Corrected"} Users ---`);
      for (const u of correctedUsers) {
        console.log(`   ${u.email} (${u.userId}): ${u.oldSubId} (${u.oldStatus}) → ${u.newSubId} (${u.newStatus}), endDate → ${u.newEndDate}`);
      }
      console.log("");
    }

    if (DRY_RUN && corrected > 0) {
      console.log("   Run with --live to apply fixes.");
    }
  } catch (err) {
    console.error("❌ Script failed:", err);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("\n✅ Disconnected from MongoDB");
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
