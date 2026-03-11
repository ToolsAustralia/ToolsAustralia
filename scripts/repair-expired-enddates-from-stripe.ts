#!/usr/bin/env npx tsx

/**
 * Repair subscription.endDate for users who renewed but DB shows expired
 *
 * Scenario: Users renewed on the 24th (per anchor billing) but subscription.endDate
 * was never updated. DB shows endDate = Feb 24 12am, current time is past that,
 * so the app thinks they're expired even though Stripe successfully charged them
 * and they have an active subscription with a future period end.
 *
 * This script finds users where:
 *   - stripeSubscriptionId exists
 *   - subscription.endDate <= now (DB says expired)
 *   - Stripe subscription is active/trialing with current_period_end > now
 *
 * Then updates subscription.endDate (and isActive/status) from Stripe so the
 * app correctly shows they have access until the next renewal.
 *
 * Safety:
 * - Dry-run by default: no DB writes unless --live is passed.
 * - --limit=N caps how many users are processed (default 200).
 * - Only updates when Stripe confirms active/trialing with future period.
 * - Per-user try/catch; one failure does not abort the script.
 * - Rate-limit handling with retries on 429.
 *
 * Usage:
 *   npx tsx scripts/repair-expired-enddates-from-stripe.ts [--dry-run] [--live] [--limit=N] [--offset=N]
 *
 * Options:
 *   --dry-run    Log what would be updated; no DB writes (default).
 *   --live       Perform DB updates.
 *   --limit=N    Max users to process (default 200).
 *   --offset=N   Skip first N matching users (default 0). Use for manual pagination.
 *
 * Env: .env.local must have MONGODB_URI and STRIPE_SECRET_KEY.
 */

import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env.local") });

const DRY_RUN = !process.argv.includes("--live");
const LIMIT_ARG = process.argv.find((a) => a.startsWith("--limit="));
const LIMIT = LIMIT_ARG ? Math.max(1, parseInt(LIMIT_ARG.split("=")[1] || "200", 10)) : 200;
const OFFSET_ARG = process.argv.find((a) => a.startsWith("--offset="));
const OFFSET = OFFSET_ARG ? Math.max(0, parseInt(OFFSET_ARG.split("=")[1] || "0", 10)) : 0;

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

  const now = new Date();
  console.log("\n🔧 Repair subscription.endDate for users who renewed but DB shows expired");
  console.log(`   Mode: ${DRY_RUN ? "DRY RUN (no DB writes)" : "LIVE"}`);
  console.log(`   Limit: ${LIMIT}`);
  console.log(`   Offset: ${OFFSET}`);
  console.log(`   Now (UTC): ${now.toISOString()}`);
  console.log("");

  type SkipReason =
    | "no_stripe_subscription_id"
    | "stripe_404_deleted"
    | "stripe_429_retries_exhausted"
    | "stripe_retrieve_failed"
    | "stripe_not_active_trialing"
    | "no_period_end_from_stripe"
    | "invalid_date_from_period_end"
    | "stripe_period_end_in_past"
    | "user_or_subscription_not_found";
  type SkippedRecord = { email: string; userId: string; subId?: string; reason: SkipReason; detail?: string };

  const skippedUsers: SkippedRecord[] = [];
  const updatedUsers: { email: string; userId: string; oldEndDate: string; newEndDate: string }[] = [];

  let totalFound = 0;
  let updated = 0;
  let skippedStripeInactive = 0;
  let skippedNoPeriodEnd = 0;
  let skippedPeriodEndInPast = 0;
  let skippedStripeError = 0;
  let errors = 0;

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Connected to MongoDB\n");

    // Users where DB says expired (endDate <= now) but they have a Stripe subscription
    const affectedUsers = await User.find({
      stripeSubscriptionId: { $exists: true, $nin: [null, ""] },
      "subscription.endDate": { $lte: now },
      "subscription.packageId": { $exists: true, $ne: null },
    })
      .select("_id email stripeSubscriptionId subscription")
      .sort({ "subscription.endDate": 1 })
      .skip(OFFSET)
      .limit(LIMIT)
      .lean();

    totalFound = affectedUsers.length;
    console.log(
      `📊 Found ${totalFound} user(s) with endDate in the past (DB says expired)\n`
    );

    if (totalFound === 0) {
      console.log("✅ No affected users to process.");
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

    for (let i = 0; i < affectedUsers.length; i++) {
      const u = affectedUsers[i];
      const userId = (u._id as { toString: () => string }).toString();
      const email = (u.email as string) || "(no email)";
      const subId = (u.stripeSubscriptionId as string) || "";
      const oldEndDate = (u.subscription as { endDate?: Date })?.endDate;

      if (!subId) {
        skippedStripeError++;
        skippedUsers.push({ email, userId, reason: "no_stripe_subscription_id", detail: "no stripeSubscriptionId" });
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
              skippedUsers.push({ email, userId, subId, reason: "stripe_404_deleted", detail: "Stripe subscription not found (404/deleted)" });
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
                skippedUsers.push({ email, userId, subId, reason: "stripe_429_retries_exhausted", detail: "Stripe rate limited (429) after retries" });
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
        const msg = e instanceof Error ? e.message : String(e);
        skippedUsers.push({ email, userId, subId, reason: "stripe_retrieve_failed", detail: msg });
        console.error(`   [ERROR] ${email} (${userId}) – Stripe retrieve failed:`, msg);
        errors++;
        continue;
      }
      if (skipUser || !sub) continue;

      const stripeStatus = (sub as { status?: string }).status ?? "unknown";

      // Only fix if Stripe says they're still active
      if (stripeStatus !== "active" && stripeStatus !== "trialing") {
        skippedStripeInactive++;
        skippedUsers.push({
          email,
          userId,
          subId,
          reason: "stripe_not_active_trialing",
          detail: `Stripe status=${stripeStatus} (not active/trialing)`,
        });
        console.log(`   [SKIP] ${email} (${userId}) – Stripe status=${stripeStatus} (not active/trialing)`);
        continue;
      }

      const periodEndSec = getSubscriptionPeriodEnd(sub);
      if (periodEndSec == null || !Number.isFinite(periodEndSec)) {
        skippedNoPeriodEnd++;
        skippedUsers.push({ email, userId, subId, reason: "no_period_end_from_stripe", detail: "No current_period_end on subscription or items" });
        console.log(`   [SKIP] ${email} (${userId}) – no period end from Stripe`);
        continue;
      }

      const newEndDate = new Date(periodEndSec * 1000);
      if (!Number.isFinite(newEndDate.getTime())) {
        skippedNoPeriodEnd++;
        skippedUsers.push({ email, userId, subId, reason: "invalid_date_from_period_end", detail: "Invalid date from period end" });
        console.log(`   [SKIP] ${email} (${userId}) – invalid date from period end`);
        continue;
      }

      // Only update if Stripe says they have a future period (they renewed)
      if (newEndDate <= now) {
        skippedPeriodEndInPast++;
        skippedUsers.push({
          email,
          userId,
          subId,
          reason: "stripe_period_end_in_past",
          detail: `Stripe period_end=${newEndDate.toISOString()} is in the past (Stripe also expired)`,
        });
        console.log(
          `   [SKIP] ${email} (${userId}) – Stripe period_end=${newEndDate.toISOString()} is in the past (Stripe also expired)`
        );
        continue;
      }

      if (DRY_RUN) {
        const oldStr = oldEndDate instanceof Date ? oldEndDate.toISOString() : String(oldEndDate ?? "?");
        updatedUsers.push({ email, userId, oldEndDate: oldStr, newEndDate: newEndDate.toISOString() });
        console.log(
          `   [WOULD UPDATE] ${email} (${userId}) – oldEndDate=${oldStr} → newEndDate=${newEndDate.toISOString()}, Stripe status=${stripeStatus}`
        );
        updated++;
        continue;
      }

      try {
        const user = await User.findById(userId);
        if (!user || !user.subscription) {
          skippedUsers.push({ email, userId, subId, reason: "user_or_subscription_not_found", detail: "User or subscription not found in DB" });
          console.log(`   [SKIP] ${email} (${userId}) – user or subscription not found`);
          continue;
        }

        const oldStr = oldEndDate instanceof Date ? oldEndDate.toISOString() : "?";
        updatedUsers.push({ email, userId, oldEndDate: oldStr, newEndDate: newEndDate.toISOString() });
        user.subscription.endDate = newEndDate;
        user.subscription.isActive = true;
        user.subscription.status = stripeStatus;
        user.subscription.autoRenew = !(sub as { cancel_at_period_end?: boolean }).cancel_at_period_end;

        // Clear cancelledAt if they're active (they renewed, so any previous cancellation was reversed)
        if (user.subscription.cancelledAt) {
          user.subscription.cancelledAt = undefined;
        }

        user.markModified("subscription");
        await user.save();
        console.log(
          `   [UPDATED] ${email} (${userId}) – endDate ${oldEndDate instanceof Date ? oldEndDate.toISOString() : "?"} → ${newEndDate.toISOString()}, status=${stripeStatus}`
        );
        updated++;
      } catch (saveErr) {
        console.error(`   [ERROR] ${email} (${userId}) – save failed:`, saveErr instanceof Error ? saveErr.message : saveErr);
        errors++;
      }
    }

    console.log("\n📊 Summary:");
    console.log(`   Total found (endDate in past): ${totalFound}`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Skipped (Stripe not active/trialing): ${skippedStripeInactive}`);
    console.log(`   Skipped (no period end): ${skippedNoPeriodEnd}`);
    console.log(`   Skipped (Stripe period_end also in past): ${skippedPeriodEndInPast}`);
    console.log(`   Skipped (Stripe error/404): ${skippedStripeError}`);
    console.log(`   Errors: ${errors}`);

    if (skippedUsers.length > 0) {
      console.log("\n--- Skipped Users (by reason) ---");
      const byReason = skippedUsers.reduce(
        (acc, r) => {
          if (!acc[r.reason]) acc[r.reason] = [];
          acc[r.reason].push(r);
          return acc;
        },
        {} as Record<SkipReason, SkippedRecord[]>
      );
      const reasonLabels: Record<SkipReason, string> = {
        no_stripe_subscription_id: "No stripeSubscriptionId",
        stripe_404_deleted: "Stripe subscription not found (404/deleted)",
        stripe_429_retries_exhausted: "Stripe rate limited (429) after retries",
        stripe_retrieve_failed: "Stripe retrieve failed",
        stripe_not_active_trialing: "Stripe status not active/trialing",
        no_period_end_from_stripe: "No period end from Stripe",
        invalid_date_from_period_end: "Invalid date from period end",
        stripe_period_end_in_past: "Stripe period_end in the past",
        user_or_subscription_not_found: "User or subscription not found in DB",
      };
      for (const [reason, records] of Object.entries(byReason) as [SkipReason, SkippedRecord[]][]) {
        console.log(`\n   [${reason}] (${records.length}) – ${reasonLabels[reason]}`);
        for (const r of records) {
          console.log(`      ${r.email} (${r.userId})${r.detail ? ` – ${r.detail}` : ""}`);
        }
      }
      console.log("");
    }

    if (updatedUsers.length > 0) {
      console.log("--- Updated / Would-be-updated Users ---");
      for (const u of updatedUsers) {
        console.log(`   ${u.email} (${u.userId}): ${u.oldEndDate} → ${u.newEndDate}`);
      }
      console.log("");
    }

    if (DRY_RUN && updated > 0) {
      console.log("   Run with --live to apply updates.");
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
