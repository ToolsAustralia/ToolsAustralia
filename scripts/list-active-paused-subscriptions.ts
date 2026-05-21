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
const CONCURRENCY_ARG = process.argv.find((a) => a.startsWith("--concurrency="));
const DEFAULT_CONCURRENCY = LIVE_RESUME ? 2 : 3;
const CONCURRENCY = CONCURRENCY_ARG
  ? Math.max(1, parseInt(CONCURRENCY_ARG.split("=")[1] || String(DEFAULT_CONCURRENCY), 10))
  : DEFAULT_CONCURRENCY;
const MAX_RETRIES_ARG = process.argv.find((a) => a.startsWith("--max-retries="));
const MAX_RETRIES = MAX_RETRIES_ARG ? Math.max(0, parseInt(MAX_RETRIES_ARG.split("=")[1] || "5", 10)) : 5;
/** Log progress to stderr every N users (keeps stdout as clean CSV). */
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

function getRetryAfterMs(error: unknown): number | null {
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

      const retryAfterMs = getRetryAfterMs(error);
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
  console.log(`   Limit: ${LIMIT}`);
  console.log(`   Concurrency: ${CONCURRENCY}`);
  console.log(`   Max rate-limit retries: ${MAX_RETRIES}\n`);

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

  const total = users.length;
  console.error(`Found ${total} active subscriber(s) in DB to check against Stripe.\n`);

  const csvEscape = (s: string) => (s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s);

  console.log("email,userId,stripeCustomerId,stripeSubscriptionId,dbStatus,stripeStatus,pauseBehavior,action");

  let matched = 0;
  let resumed = 0;
  let errors = 0;
  let checked = 0;
  const loopStart = Date.now();

  const logProgress = () => {
    if (checked % PROGRESS_EVERY !== 0 && checked !== total) return;

    const pct = total > 0 ? Math.round((checked / total) * 100) : 0;
    const elapsedMs = Date.now() - loopStart;
    const remaining = total - checked;
    const avgMsPerUser = checked > 0 ? elapsedMs / checked : 0;
    const etaMs = remaining * avgMsPerUser;
    const etaStr = remaining === 0 ? "done" : `~${formatDurationMs(etaMs)} left (avg ${formatDurationMs(avgMsPerUser)}/user)`;

    console.error(
      `Progress: ${checked} out of ${total} (${pct}%) | elapsed ${formatDurationMs(elapsedMs)} | ${etaStr} | pause_collection: ${matched} | errors: ${errors}`
    );
  };

  const processUser = async (u: (typeof users)[number]) => {
    const email = (u.email as string) || "";
    const userId = String(u._id);
    const customerId = (u.stripeCustomerId as string) || "";
    const subId = (u.stripeSubscriptionId as string) || "";
    const dbStatus = (u.subscription as { status?: string } | undefined)?.status ?? "";

    if (!subId) {
      checked++;
      logProgress();
      return;
    }

    try {
      const sub = await withStripeRateLimitRetry(`retrieve sub=${subId}`, () => stripe.subscriptions.retrieve(subId));
      const pause = sub.pause_collection;
      if (pause == null) return;

      matched++;
      const pauseBehavior = describePauseCollection(sub);
      const action = LIVE_RESUME ? "resume_attempted" : "list_only";

      console.log(
        [csvEscape(email), userId, customerId, subId, dbStatus, sub.status, pauseBehavior, action].join(",")
      );

      if (LIVE_RESUME) {
        try {
          await withStripeRateLimitRetry(`resume sub=${subId}`, () => resumeAfterSuccessfulRenewalPayment(subId));
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
      const code = getStripeErrorCode(e);
      if (code === "resource_missing" || getStripeErrorStatus(e) === 404) {
        return;
      }
      errors++;
      console.error(`   ERROR ${email} sub=${subId}:`, getStripeErrorMessage(e));
    } finally {
      checked++;
      logProgress();
    }
  };

  let nextIndex = 0;
  const workerCount = Math.min(CONCURRENCY, total);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const index = nextIndex++;
        if (index >= total) return;
        await processUser(users[index]);
      }
    })
  );

  if (total === 0) {
    logProgress();
  }

  const totalMs = Date.now() - loopStart;
  console.error(
    `\nDone in ${formatDurationMs(totalMs)}. Scanned ${checked} out of ${total} user(s). pause_collection set: ${matched}. Resumed: ${resumed}. Errors: ${errors}.`
  );
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
