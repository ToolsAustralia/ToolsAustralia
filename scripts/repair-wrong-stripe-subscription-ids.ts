#!/usr/bin/env npx tsx

/**
 * Repair stripeSubscriptionId for users whose DB points to a dead subscription
 * while they have an active subscription under the same Stripe customer.
 *
 * Scenario: Race condition during checkout creates two subscriptions. The DB
 * ends up with the ID of the one that went incomplete_expired, while the
 * actually-paid subscription has a different ID.
 *
 * This script:
 *   1. Finds users where stripeSubscriptionId exists and the stored sub is
 *      NOT active/trialing in Stripe (incomplete, incomplete_expired, canceled, or 404).
 *   2. Looks up the Stripe customer for an active/trialing subscription.
 *   3. Updates stripeSubscriptionId (and endDate/isActive/status) from the real sub.
 *
 * Candidate filter (avoids never-paid / abandoned checkout noise):
 *   - processedPayments must have at least one entry (Webhook-recorded purchase).
 *   - subscription.status must not be "incomplete" (abandoned initial checkout in DB).
 *   (Users with wrong sub but empty processedPayments — legacy — are excluded; fix manually or relax filters.)
 *
 * Safety:
 * - Dry-run by default: no DB writes unless --live is passed.
 * - Optional --limit=N caps how many users are fetched (default: all matching candidates).
 * - Per-user try/catch; one failure does not abort the script.
 * - Rate-limit handling with retries on 429.
 *
 * Usage:
 *   npx tsx scripts/repair-wrong-stripe-subscription-ids.ts [--dry-run] [--live] [--limit=N]
 *
 * Options:
 *   --dry-run   Log what would be updated; no DB writes (default).
 *   --live      Perform DB updates.
 *   --limit=N   Max users to process (omit for no cap).
 *
 * Env: .env.local must have MONGODB_URI and STRIPE_SECRET_KEY.
 */

import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env.local") });

const DRY_RUN = !process.argv.includes("--live");
const LIMIT_ARG = process.argv.find((a) => a.startsWith("--limit="));
/** When set, caps MongoDB candidate fetch; omit --limit= on CLI to process all matches. */
const LIMIT = LIMIT_ARG ? Math.max(1, parseInt(LIMIT_ARG.split("=")[1] || "1", 10)) : undefined;

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

function buildCandidateFilter() {
  return {
    stripeSubscriptionId: { $exists: true, $nin: [null, ""] },
    stripeCustomerId: { $exists: true, $nin: [null, ""] },
    "subscription.packageId": { $exists: true, $ne: null },
    "processedPayments.0": { $exists: true },
    "subscription.status": { $ne: "incomplete" },
  };
}

type FixPlanRow = {
  email: string;
  userId: string;
  oldSubId: string;
  oldStatus: string;
  newSubId: string;
  newStatus: string;
  newEndDateStr: string;
  newEndDate: Date | undefined;
  activeSub: StripeSubscription;
};

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
  const candidateFilter = buildCandidateFilter();

  console.log("\n🔧 Repair stripeSubscriptionId for users pointing to dead subscriptions");
  console.log(`   Mode: ${DRY_RUN ? "DRY RUN (no DB writes)" : "LIVE"}`);
  console.log(`   Limit: ${LIMIT === undefined ? "none (all candidates)" : LIMIT}`);
  console.log(`   Now (UTC): ${now.toISOString()}`);
  console.log("   Filters: processedPayments length ≥ 1, subscription.status ≠ incomplete");
  console.log("");

  let totalChecked = 0;
  let skippedStoredActive = 0;
  let skippedNoActiveSub = 0;
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
    console.log("✅ Connected to MongoDB");

    const totalInDatabase = await User.countDocuments(candidateFilter);

    let candidateQuery = User.find(candidateFilter)
      .select("_id email stripeSubscriptionId stripeCustomerId subscription")
      .sort({ _id: 1 });

    if (LIMIT !== undefined) {
      candidateQuery = candidateQuery.limit(LIMIT);
    }

    const candidates = await candidateQuery.lean();

    console.log("\n📊 --- Run scope (before Stripe) ---");
    console.log(`   Total users matching DB filters (full database): ${totalInDatabase}`);
    console.log(
      `   Users loaded & to be Stripe-scanned this run: ${candidates.length}` +
        (LIMIT !== undefined ? ` (--limit=${LIMIT}; remaining in DB not loaded: ${Math.max(0, totalInDatabase - candidates.length)})` : "")
    );
    console.log("");

    if (candidates.length === 0) {
      console.log("✅ No candidates to process.");
      await mongoose.disconnect();
      process.exit(0);
    }

    const fixPlan: FixPlanRow[] = [];

    console.log("🔍 Scanning Stripe for each candidate...\n");

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

      fixPlan.push({
        email,
        userId,
        oldSubId: storedSubId,
        oldStatus: storedStatus,
        newSubId: activeSub.id,
        newStatus: activeSub.status,
        newEndDateStr,
        newEndDate,
        activeSub,
      });
    }

    const eligibleCount = fixPlan.length;
    console.log("\n📊 --- After Stripe scan ---");
    console.log(`   Stripe-checked users: ${totalChecked} (of ${candidates.length} loaded)`);
    console.log(
      `   Eligible for DB update (dead stored sub + active/trialing found): ${eligibleCount}` +
        (eligibleCount > 0 ? ` — ${DRY_RUN ? "dry-run will list them below; " : ""}--live will write ${eligibleCount} user(s) if saves succeed` : "")
    );
    console.log("");

    if (eligibleCount === 0) {
      console.log("📊 Summary:");
      console.log(`   Total checked: ${totalChecked}`);
      console.log(`   Corrected: 0`);
      console.log(`   Skipped (stored sub still alive): ${skippedStoredActive}`);
      console.log(`   Skipped (no active sub found for customer): ${skippedNoActiveSub}`);
      console.log(`   Errors: ${errors}`);
      return;
    }

    if (!DRY_RUN) {
      const isProd =
        /production|mongodb\.net|\.mlab\.com/i.test(process.env.MONGODB_URI ?? "") &&
        process.env.CONFIRM_BACKFILL_PRODUCTION !== "1";
      if (isProd) {
        console.log("⚠️  MONGODB_URI looks like production. Set CONFIRM_BACKFILL_PRODUCTION=1 to skip countdown.");
        console.log(`   About to update ${eligibleCount} user(s). Waiting 10s — Press Ctrl+C to cancel...\n`);
        await sleep(10_000);
      } else {
        console.log(`⚠️  LIVE mode: about to update ${eligibleCount} user(s). Press Ctrl+C within 5s to cancel...\n`);
        await sleep(5000);
      }
    }

    let corrected = 0;

    for (const row of fixPlan) {
      if (DRY_RUN) {
        correctedUsers.push({
          email: row.email,
          userId: row.userId,
          oldSubId: row.oldSubId,
          oldStatus: row.oldStatus,
          newSubId: row.newSubId,
          newStatus: row.newStatus,
          newEndDate: row.newEndDateStr,
        });
        console.log(
          `   [WOULD FIX] ${row.email} (${row.userId}) – ${row.oldSubId} (${row.oldStatus}) → ${row.newSubId} (${row.newStatus}), endDate → ${row.newEndDateStr}`
        );
        corrected++;
        continue;
      }

      try {
        const user = await User.findById(row.userId);
        if (!user || !user.subscription) {
          console.log(`   [SKIP] ${row.email} – user or subscription not found in DB`);
          continue;
        }

        user.stripeSubscriptionId = row.activeSub.id;
        user.subscription.isActive = true;
        user.subscription.status = row.activeSub.status;
        user.subscription.autoRenew = !row.activeSub.cancel_at_period_end;
        if (row.newEndDate) {
          user.subscription.endDate = row.newEndDate;
        }
        if (user.subscription.cancelledAt) {
          user.subscription.cancelledAt = undefined;
        }

        user.markModified("subscription");
        await user.save();

        correctedUsers.push({
          email: row.email,
          userId: row.userId,
          oldSubId: row.oldSubId,
          oldStatus: row.oldStatus,
          newSubId: row.newSubId,
          newStatus: row.newStatus,
          newEndDate: row.newEndDateStr,
        });
        console.log(
          `   [FIXED] ${row.email} (${row.userId}) – ${row.oldSubId} (${row.oldStatus}) → ${row.newSubId} (${row.newStatus}), endDate → ${row.newEndDateStr}`
        );
        corrected++;
      } catch (saveErr) {
        console.error(
          `   [ERROR] ${row.email} (${row.userId}) – save failed:`,
          saveErr instanceof Error ? saveErr.message : saveErr
        );
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
      const emailsHeader = DRY_RUN
        ? "Emails that WOULD be updated (dry run) — run with --live to apply"
        : "Emails UPDATED in database (--live)";
      console.log(`\n--- ${emailsHeader} (${correctedUsers.length}) ---`);
      correctedUsers.forEach((u, i) => {
        console.log(`   ${i + 1}. ${u.email}`);
      });

      const uniqueEmails = [...new Set(correctedUsers.map((u) => u.email).filter((e) => e && e !== "(no email)"))];
      if (uniqueEmails.length > 0) {
        console.log(`\n   All updated emails (comma-separated, ${uniqueEmails.length}):`);
        console.log(`   ${uniqueEmails.join(", ")}`);
      }

      console.log(`\n--- Detail: subscription id changes ---`);
      for (const u of correctedUsers) {
        console.log(
          `   ${u.email} | userId=${u.userId} | ${u.oldSubId} (${u.oldStatus}) → ${u.newSubId} (${u.newStatus}) | endDate=${u.newEndDate}`
        );
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
