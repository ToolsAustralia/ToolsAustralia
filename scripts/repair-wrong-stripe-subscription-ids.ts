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
 *   2. Looks up the Stripe customer for a recoverable subscription (active, trialing, past_due, unpaid).
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
 * - Rate-limit handling with retries on 429 (shared cooldown across concurrent workers).
 *
 * Usage:
 *   npx tsx scripts/repair-wrong-stripe-subscription-ids.ts [--dry-run] [--live] [--limit=N] [--concurrency=N] [--max-retries=N]
 *
 * Options:
 *   --dry-run       Log what would be updated; no DB writes (default).
 *   --live          Perform DB updates.
 *   --limit=N       Max users to process (omit for no cap).
 *   --concurrency=N Parallel Stripe scans (default: 3 dry-run, 2 live).
 *   --max-retries=N Stripe 429 retries per call (default: 5).
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

const CONCURRENCY_ARG = process.argv.find((a) => a.startsWith("--concurrency="));
const DEFAULT_CONCURRENCY = DRY_RUN ? 3 : 2;
const CONCURRENCY = CONCURRENCY_ARG
  ? Math.max(1, parseInt(CONCURRENCY_ARG.split("=")[1] || String(DEFAULT_CONCURRENCY), 10))
  : DEFAULT_CONCURRENCY;

const MAX_RETRIES_ARG = process.argv.find((a) => a.startsWith("--max-retries="));
const MAX_RETRIES = MAX_RETRIES_ARG ? Math.max(0, parseInt(MAX_RETRIES_ARG.split("=")[1] || "5", 10)) : 5;

/** Log progress every N completed Stripe scans (stderr). */
const PROGRESS_EVERY = 25;

let rateLimitCooldownUntil = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r > 0 ? `${m}m ${r}s` : `${m}m`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getStripeErrorCode(error: unknown): string {
  return isRecord(error) && typeof error.code === "string" ? error.code : "";
}

function getStripeErrorStatus(error: unknown): number | undefined {
  return isRecord(error) && typeof error.statusCode === "number" ? error.statusCode : undefined;
}

function getStripeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRateLimitError(error: unknown): boolean {
  const message = getStripeErrorMessage(error).toLowerCase();
  return getStripeErrorStatus(error) === 429 || getStripeErrorCode(error) === "rate_limit" || message.includes("rate limit");
}

function getRetryAfterMsFromError(error: unknown): number | null {
  if (!isRecord(error) || !isRecord(error.raw) || !isRecord(error.raw.headers)) return null;
  const retryAfter = error.raw.headers["retry-after"];
  if (typeof retryAfter !== "string") return null;
  const seconds = Number.parseInt(retryAfter, 10);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
}

async function waitForRateLimitCooldown(): Promise<void> {
  const waitMs = rateLimitCooldownUntil - Date.now();
  if (waitMs > 0) {
    await sleep(waitMs);
  }
}

async function withStripeRateLimitRetry<T>(label: string, operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    await waitForRateLimitCooldown();
    try {
      return await operation();
    } catch (error) {
      if (!isRateLimitError(error) || attempt >= MAX_RETRIES) {
        throw error;
      }

      const retryAfterMs = getRetryAfterMsFromError(error);
      const backoffMs = retryAfterMs ?? Math.min(30_000, 1_500 * 2 ** attempt);
      const jitterMs = Math.floor(Math.random() * 500);
      const waitMs = backoffMs + jitterMs;
      rateLimitCooldownUntil = Math.max(rateLimitCooldownUntil, Date.now() + waitMs);
      console.error(
        `   RATE LIMIT ${label}; retry ${attempt + 1}/${MAX_RETRIES} after ${formatDurationMs(waitMs)}`
      );
      await sleep(waitMs);
    }
  }
}

// Use base Stripe.Subscription so we can assign from both retrieve() and list().data
type StripeSubscription = import("stripe").Stripe.Subscription;

const RECOVERABLE_STATUSES = ["active", "trialing", "past_due", "unpaid"] as const;
type RecoverableStatus = (typeof RECOVERABLE_STATUSES)[number];

const STATUS_PRIORITY: Record<RecoverableStatus, number> = {
  active: 0,
  trialing: 1,
  past_due: 2,
  unpaid: 3,
};

function pickBestRecoverableSubscription(subs: StripeSubscription[]): StripeSubscription | null {
  const recoverable = subs.filter((s): s is StripeSubscription & { status: RecoverableStatus } =>
    (RECOVERABLE_STATUSES as readonly string[]).includes(s.status)
  );
  if (recoverable.length === 0) return null;
  recoverable.sort((a, b) => STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status]);
  return recoverable[0];
}

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

type ScanCounters = {
  totalChecked: number;
  skippedStoredActive: number;
  skippedNoActiveSub: number;
  errors: number;
};

async function retrieveStoredSub(
  stripe: typeof import("../src/lib/stripe").stripe,
  subId: string
): Promise<{ sub: StripeSubscription | null; error?: string; is404?: boolean }> {
  try {
    const sub = await withStripeRateLimitRetry(`retrieve sub=${subId}`, () => stripe.subscriptions.retrieve(subId));
    return { sub };
  } catch (e) {
    const code = getStripeErrorCode(e);
    const statusCode = getStripeErrorStatus(e);
    if (code === "resource_missing_deleted" || code === "resource_missing" || statusCode === 404) {
      return { sub: null, is404: true };
    }
    return { sub: null, error: getStripeErrorMessage(e) };
  }
}

async function listRecoverableForCustomer(
  stripe: typeof import("../src/lib/stripe").stripe,
  customerId: string
): Promise<{ sub: StripeSubscription | null; error?: string }> {
  try {
    const list = await withStripeRateLimitRetry(`list subs customer=${customerId}`, () =>
      stripe.subscriptions.list({
        customer: customerId,
        status: "all",
        limit: 100,
      })
    );
    return { sub: pickBestRecoverableSubscription(list.data) };
  } catch (e) {
    return { sub: null, error: getStripeErrorMessage(e) };
  }
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
  console.log(`   Concurrency: ${CONCURRENCY}`);
  console.log(`   Max rate-limit retries: ${MAX_RETRIES}`);
  console.log(`   Now (UTC): ${now.toISOString()}`);
  console.log("   Filters: processedPayments length ≥ 1, subscription.status ≠ incomplete");
  console.log("");

  const counters: ScanCounters = {
    totalChecked: 0,
    skippedStoredActive: 0,
    skippedNoActiveSub: 0,
    errors: 0,
  };

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
        (LIMIT !== undefined
          ? ` (--limit=${LIMIT}; remaining in DB not loaded: ${Math.max(0, totalInDatabase - candidates.length)})`
          : "")
    );
    console.log("");

    if (candidates.length === 0) {
      console.log("✅ No candidates to process.");
      await mongoose.disconnect();
      process.exit(0);
    }

    const total = candidates.length;
    const fixPlanByIndex: (FixPlanRow | null)[] = new Array(total).fill(null);
    let scanCompleted = 0;
    let eligibleSoFar = 0;
    const loopStart = Date.now();

    const logProgress = () => {
      if (scanCompleted % PROGRESS_EVERY !== 0 && scanCompleted !== total) return;

      const pct = total > 0 ? Math.round((scanCompleted / total) * 100) : 0;
      const elapsedMs = Date.now() - loopStart;
      const remaining = total - scanCompleted;
      const avgMs = scanCompleted > 0 ? elapsedMs / scanCompleted : 0;
      const etaMs = remaining * avgMs;
      const etaStr =
        remaining === 0 ? "done" : `~${formatDurationMs(etaMs)} left (avg ${formatDurationMs(avgMs)}/user)`;

      console.error(
        `Progress: ${scanCompleted} of ${total} (${pct}%) | elapsed ${formatDurationMs(elapsedMs)} | ${etaStr} | ` +
          `dead+fixable: ${eligibleSoFar} | skipped alive: ${counters.skippedStoredActive} | skipped no sub: ${counters.skippedNoActiveSub} | errors: ${counters.errors}`
      );
    };

    const processCandidate = async (index: number) => {
      const u = candidates[index];
      const userId = (u._id as { toString: () => string }).toString();
      const email = (u.email as string) || "(no email)";
      const storedSubId = (u.stripeSubscriptionId as string) || "";
      const customerId = (u.stripeCustomerId as string) || "";

      if (!storedSubId || !customerId) {
        return;
      }

      counters.totalChecked++;

      const { sub: storedSub, is404, error: retrieveError } = await retrieveStoredSub(stripe, storedSubId);

      if (retrieveError && !is404) {
        console.error(`   [ERROR] ${email} – could not retrieve stored sub: ${retrieveError}`);
        counters.errors++;
        return;
      }

      const storedStatus = is404 ? "deleted/404" : (storedSub?.status ?? "unknown");
      const isStoredDead =
        is404 ||
        storedStatus === "incomplete" ||
        storedStatus === "incomplete_expired" ||
        storedStatus === "canceled";

      if (!isStoredDead) {
        counters.skippedStoredActive++;
        return;
      }

      const { sub: activeSub, error: listError } = await listRecoverableForCustomer(stripe, customerId);

      if (listError) {
        console.error(`   [ERROR] ${email} – could not list customer subscriptions: ${listError}`);
        counters.errors++;
        return;
      }

      if (!activeSub) {
        counters.skippedNoActiveSub++;
        console.error(
          `   [SKIP] ${email} (${userId}) – stored sub ${storedSubId} is ${storedStatus}, but no active/trialing/past_due/unpaid sub found for customer`
        );
        return;
      }

      const periodEnd = getSubscriptionPeriodEnd(activeSub);
      const newEndDate = periodEnd != null ? new Date(periodEnd * 1000) : undefined;
      const newEndDateStr = newEndDate?.toISOString() ?? "(unknown)";

      fixPlanByIndex[index] = {
        email,
        userId,
        oldSubId: storedSubId,
        oldStatus: storedStatus,
        newSubId: activeSub.id,
        newStatus: activeSub.status,
        newEndDateStr,
        newEndDate,
        activeSub,
      };
      eligibleSoFar++;
    };

    console.error("🔍 Scanning Stripe (concurrent)...\n");

    let nextIndex = 0;
    const workerCount = Math.min(CONCURRENCY, total);

    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (true) {
          const index = nextIndex++;
          if (index >= total) return;
          try {
            await processCandidate(index);
          } finally {
            scanCompleted++;
            logProgress();
          }
        }
      })
    );

    if (total === 0) {
      logProgress();
    }

    const fixPlan = fixPlanByIndex.filter((row): row is FixPlanRow => row != null);
    const scanMs = Date.now() - loopStart;
    console.error(`\nStripe scan finished in ${formatDurationMs(scanMs)}.\n`);

    const eligibleCount = fixPlan.length;
    console.log("\n📊 --- After Stripe scan ---");
    console.log(`   Stripe-checked users: ${counters.totalChecked} (of ${candidates.length} loaded)`);
    console.log(
      `   Eligible for DB update (dead stored sub + recoverable sub found): ${eligibleCount}` +
        (eligibleCount > 0
          ? ` — ${DRY_RUN ? "dry-run will list them below; " : ""}--live will write ${eligibleCount} user(s) if saves succeed`
          : "")
    );
    console.log("");

    if (eligibleCount === 0) {
      console.log("📊 Summary:");
      console.log(`   Total checked: ${counters.totalChecked}`);
      console.log(`   Corrected: 0`);
      console.log(`   Skipped (stored sub still alive): ${counters.skippedStoredActive}`);
      console.log(`   Skipped (no recoverable sub on customer): ${counters.skippedNoActiveSub}`);
      console.log(`   Errors: ${counters.errors}`);
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

        const targetStatus = row.activeSub.status;
        user.stripeSubscriptionId = row.activeSub.id;
        user.subscription.status = targetStatus;
        user.subscription.isActive = targetStatus === "active" || targetStatus === "trialing";
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
        counters.errors++;
      }
    }

    console.log("\n📊 Summary:");
    console.log(`   Total checked: ${counters.totalChecked}`);
    console.log(`   Corrected: ${corrected}`);
    console.log(`   Skipped (stored sub still alive): ${counters.skippedStoredActive}`);
    console.log(`   Skipped (no recoverable sub on customer): ${counters.skippedNoActiveSub}`);
    console.log(`   Errors: ${counters.errors}`);

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
