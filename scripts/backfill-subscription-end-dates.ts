#!/usr/bin/env npx tsx

/**
 * Backfill subscription.endDate for legacy users
 *
 * Users with stripeSubscriptionId but missing or null subscription.endDate get
 * endDate set from Stripe's current_period_end so they behave like new members
 * (upcoming renewals, membership-by-package, etc. see them correctly).
 *
 * Safety:
 * - Dry-run by default: no DB writes unless --live is passed.
 * - --limit=N caps how many users are processed (default 200).
 * - Only updates when endDate is missing or null (idempotent).
 * - Only considers users with subscription.lastMonthAccumulatedEntries ≠ 0 (subscribed users only).
 * - Per-user try/catch; one failure does not abort the script.
 * - When Stripe status is canceled/past_due, syncs status/isActive so DB matches Stripe.
 *
 * Usage:
 *   npx tsx scripts/backfill-subscription-end-dates.ts [--dry-run] [--live] [--limit=N]
 *
 * Options:
 *   --dry-run   Log what would be updated; no DB writes (default).
 *   --live      Perform DB updates.
 *   --limit=N   Max users to process (default 200).
 *
 * Env: .env.local must have MONGODB_URI and STRIPE_SECRET_KEY.
 * To run against production DB from dev: set MONGODB_URI to prod in .env.local,
 * then run with --live after testing with --dry-run and --limit=5.
 */

import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env.local") });

const DRY_RUN = !process.argv.includes("--live");
const LIMIT_ARG = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = LIMIT_ARG ? Math.max(1, parseInt(LIMIT_ARG.split("=")[1] || "200", 10)) : 200;

const DELAY_BETWEEN_STRIPE_MS = 150;
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

  console.log("\n📅 Backfill subscription.endDate for legacy users");
  console.log(`   Mode: ${DRY_RUN ? "DRY RUN (no DB writes)" : "LIVE"}`);
  console.log(`   Limit: ${LIMIT}`);
  console.log("");

  let totalFound = 0;
  let updated = 0;
  let skippedNoPeriodEnd = 0;
  let skippedInvalidDate = 0;
  let skippedStripeError = 0;
  let errors = 0;

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Connected to MongoDB\n");

    const legacyUsers = await User.find({
      stripeSubscriptionId: { $exists: true, $nin: [null, ""] },
      $or: [
        { "subscription.endDate": { $exists: false } },
        { "subscription.endDate": null },
      ],
      "subscription.lastMonthAccumulatedEntries": { $ne: 0 },
    })
      .select("_id email stripeSubscriptionId subscription")
      .limit(LIMIT)
      .lean();

    totalFound = legacyUsers.length;
    console.log(
      `📊 Found ${totalFound} legacy user(s) (stripeSubscriptionId set, endDate missing/null, lastMonthAccumulatedEntries ≠ 0)\n`
    );

    if (totalFound === 0) {
      console.log("✅ No legacy users to process.");
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

    for (let i = 0; i < legacyUsers.length; i++) {
      const u = legacyUsers[i];
      const userId = (u._id as { toString: () => string }).toString();
      const email = (u.email as string) || "(no email)";
      const subId = (u.stripeSubscriptionId as string) || "";

      if (!subId) {
        skippedStripeError++;
        console.log(`   [SKIP] ${email} (${userId}) – no stripeSubscriptionId`);
        continue;
      }

      await sleep(DELAY_BETWEEN_STRIPE_MS);

      let sub: Awaited<ReturnType<typeof stripe.subscriptions.retrieve>> | null = null;
      let skipUser = false;
      try {
        for (let attempt = 0; attempt <= MAX_RETRIES_429; attempt++) {
          try {
            sub = await stripe.subscriptions.retrieve(subId);
            break;
          } catch (e) {
            const code = e && typeof e === "object" && "code" in e ? (e as { code: string }).code : "";
            const statusCode = e && typeof e === "object" && "statusCode" in e ? (e as { statusCode?: number }).statusCode : undefined;
            if (code === "resource_missing_deleted" || statusCode === 404) {
              console.log(`   [SKIP] ${email} (${userId}) – Stripe subscription not found (404/deleted)`);
              skippedStripeError++;
              skipUser = true;
              break;
            }
            if (code === "rate_limit" || statusCode === 429) {
              if (attempt < MAX_RETRIES_429) {
                const wait = getRetryAfterMs(e, attempt);
                console.log(`   [RETRY] ${email} – 429, waiting ${Math.round(wait / 1000)}s`);
                await sleep(wait);
              } else {
                console.error(`   [ERROR] ${email} – 429 after ${MAX_RETRIES_429} retries`);
                errors++;
                skipUser = true;
              }
              break;
            }
            throw e;
          }
        }
      } catch (e) {
        console.error(`   [ERROR] ${email} (${userId}) – Stripe retrieve failed:`, e instanceof Error ? e.message : e);
        errors++;
        continue;
      }
      if (skipUser || !sub) continue;

      const periodEndSec = getSubscriptionPeriodEnd(sub);
      if (periodEndSec == null || !Number.isFinite(periodEndSec)) {
        skippedNoPeriodEnd++;
        console.log(`   [SKIP] ${email} (${userId}) – no period end from Stripe`);
        continue;
      }

      const endDate = new Date(periodEndSec * 1000);
      if (!Number.isFinite(endDate.getTime())) {
        skippedInvalidDate++;
        console.log(`   [SKIP] ${email} (${userId}) – invalid date from period end`);
        continue;
      }

      const stripeStatus = (sub as { status?: string }).status ?? "unknown";

      if (DRY_RUN) {
        console.log(
          `   [WOULD UPDATE] ${email} (${userId}) – endDate=${endDate.toISOString()}, Stripe status=${stripeStatus}`
        );
        updated++;
        continue;
      }

      try {
        const user = await User.findById(userId);
        if (!user || !user.subscription) {
          console.log(`   [SKIP] ${email} (${userId}) – user or subscription not found`);
          continue;
        }

        user.subscription.endDate = endDate;

        if (stripeStatus === "canceled" || stripeStatus === "past_due") {
          const preservedAccumulatedEntries = user.subscription.lastMonthAccumulatedEntries;
          user.subscription.isActive = false;
          user.subscription.status = stripeStatus;
          user.subscription.autoRenew = !(sub as { cancel_at_period_end?: boolean }).cancel_at_period_end;
          if (!user.subscription.cancelledAt) {
            user.subscription.cancelledAt = new Date();
          }
          if (preservedAccumulatedEntries !== undefined) {
            user.subscription.lastMonthAccumulatedEntries = preservedAccumulatedEntries;
          }
        }

        user.markModified("subscription");
        await user.save();
        console.log(`   [UPDATED] ${email} (${userId}) – endDate=${endDate.toISOString()}, status=${stripeStatus}`);
        updated++;
      } catch (saveErr) {
        console.error(`   [ERROR] ${email} (${userId}) – save failed:`, saveErr instanceof Error ? saveErr.message : saveErr);
        errors++;
      }
    }

    console.log("\n📊 Summary:");
    console.log(`   Total found: ${totalFound}`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Skipped (no period end): ${skippedNoPeriodEnd}`);
    console.log(`   Skipped (invalid date): ${skippedInvalidDate}`);
    console.log(`   Skipped (Stripe error/404): ${skippedStripeError}`);
    console.log(`   Errors: ${errors}`);
    if (DRY_RUN && updated > 0) {
      console.log("\n   Run with --live to apply updates.");
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
