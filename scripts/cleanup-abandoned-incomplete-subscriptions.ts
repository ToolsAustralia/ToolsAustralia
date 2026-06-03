#!/usr/bin/env npx tsx

/**
 * Clean up abandoned `incomplete` Stripe subscriptions and repair User pointers.
 *
 * An `incomplete` subscription is created when a checkout starts with
 * `payment_behavior: default_incomplete` but the card payment never completes.
 * Stripe auto-expires these after ~23 hours, but until then they pollute the
 * customer's subscription list and can block resubscribe flows.
 *
 * Important nuance: a *normal* (no-trial) incomplete sub is auto-expired by Stripe
 * to `incomplete_expired` after ~23h, and its open invoice is voided automatically —
 * so it self-cleans and is never both still-`incomplete` AND older than the 24h floor.
 * The persistent cohort this script really targets is *trial + incomplete* subs (e.g.
 * anchor-billing 25th–27th joiners): a future `trial_end` keeps them `incomplete`
 * indefinitely, so they never self-expire and accumulate open invoices that can dun
 * later. Those are swept once older than `--older-than-hours`. To also sweep very
 * recent stuck subs (e.g. a specific user reported today), run with
 * `--older-than-hours=0` (still dry-run by default).
 *
 * This script:
 *   1. Scans Stripe's `incomplete` AND `trialing` list buckets (see note below).
 *   2. Keeps only entries whose object `.status === "incomplete"` — a sub with a
 *      future `trial_end` can leak into the `trialing` bucket while its real
 *      status is `incomplete`. That is the exact cohort we want to clean.
 *   3. Skips any sub created within `--older-than-hours` (default 24h) so we
 *      never interrupt a checkout that is still in-flight.
 *   4. Cancels each stale `incomplete` sub and voids its open invoice.
 *   5. For each affected Stripe customer, finds the matching User document and
 *      repairs `stripeSubscriptionId` — pointing it at a recoverable sub if
 *      one exists, or clearing the dead pointer if the customer has none.
 *
 * Safety:
 * - Dry-run by default: no DB or Stripe writes unless --live is passed.
 * - `--older-than-hours=N` (default 24) guards against touching live checkouts.
 * - `--limit=N` caps how many Stripe customers are processed this run.
 * - Per-customer try/catch; one failure does not abort the script.
 * - Rate-limit handling with retries on 429.
 * - Production countdown before any live writes.
 *
 * Usage:
 *   npx tsx scripts/cleanup-abandoned-incomplete-subscriptions.ts [--dry-run] [--live] \
 *       [--older-than-hours=N] [--limit=N] [--concurrency=N] [--max-retries=N]
 *
 * Options:
 *   --dry-run              Log planned actions; no writes (default).
 *   --live                 Perform Stripe cancellations and DB updates.
 *   --older-than-hours=N   Only touch subs created more than N hours ago (default: 24).
 *   --limit=N              Max Stripe customers to process (omit for no cap).
 *   --concurrency=N        Parallel customer remediations (default: 3 dry-run, 2 live).
 *   --max-retries=N        Stripe 429 retries per call (default: 5).
 *
 * Env: .env.local must have MONGODB_URI and STRIPE_SECRET_KEY.
 */

import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env.local") });

const DRY_RUN = !process.argv.includes("--live");

const LIMIT_ARG = process.argv.find((a) => a.startsWith("--limit="));
/** When set, caps how many Stripe customers are processed; omit to process all. */
const LIMIT = LIMIT_ARG ? Math.max(1, parseInt(LIMIT_ARG.split("=")[1] || "1", 10)) : undefined;

const CONCURRENCY_ARG = process.argv.find((a) => a.startsWith("--concurrency="));
const DEFAULT_CONCURRENCY = DRY_RUN ? 3 : 2;
const CONCURRENCY = CONCURRENCY_ARG
  ? Math.max(1, parseInt(CONCURRENCY_ARG.split("=")[1] || String(DEFAULT_CONCURRENCY), 10))
  : DEFAULT_CONCURRENCY;

const MAX_RETRIES_ARG = process.argv.find((a) => a.startsWith("--max-retries="));
const MAX_RETRIES = MAX_RETRIES_ARG ? Math.max(0, parseInt(MAX_RETRIES_ARG.split("=")[1] || "5", 10)) : 5;

const OLDER_THAN_HOURS_ARG = process.argv.find((a) => a.startsWith("--older-than-hours="));
const OLDER_THAN_HOURS = OLDER_THAN_HOURS_ARG
  ? Math.max(0, parseInt(OLDER_THAN_HOURS_ARG.split("=")[1] || "24", 10))
  : 24;
const cutoffEpoch = Math.floor((Date.now() - OLDER_THAN_HOURS * 3_600_000) / 1000);

// ---------------------------------------------------------------------------
// Shared rate-limit state
// ---------------------------------------------------------------------------

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
  return (
    getStripeErrorStatus(error) === 429 ||
    getStripeErrorCode(error) === "rate_limit" ||
    message.includes("rate limit")
  );
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
      console.error(`   RATE LIMIT ${label}; retry ${attempt + 1}/${MAX_RETRIES} after ${formatDurationMs(waitMs)}`);
      await sleep(waitMs);
    }
  }
}

// ---------------------------------------------------------------------------
// Observability helpers — long scans must never look frozen
// ---------------------------------------------------------------------------

const startedAt = Date.now();

function ts(): string {
  return new Date().toISOString();
}

function phase(n: number, total: number, msg: string): void {
  console.error(`[${n}/${total}] ${ts()} ${msg}`);
}

let lastHeartbeat = Date.now();
function heartbeat(done: number, label: string): void {
  const now = Date.now();
  if (now - lastHeartbeat >= 10_000) {
    console.error(`   … still ${label} (${done} processed, ${formatDurationMs(now - startedAt)} elapsed)`);
    lastHeartbeat = now;
  }
}

// ---------------------------------------------------------------------------
// Candidate scan — hardened against Stripe's list-bucket quirk
// ---------------------------------------------------------------------------

/**
 * Scan both the `incomplete` and `trialing` Stripe list buckets, but retain only
 * entries whose object `.status === "incomplete"`. A sub with a future trial_end
 * can leak into the `trialing` bucket while its real status is still `incomplete`
 * (abandoned `payment_behavior: default_incomplete` checkout). Deduped by sub id.
 * Returns a Map of customerId → stale-incomplete sub ids.
 */
async function scanIncompleteSubs(
  stripe: typeof import("../src/lib/stripe").stripe
): Promise<Map<string, string[]>> {
  const byCustomer = new Map<string, string[]>();
  const seen = new Set<string>();
  let scanned = 0;
  phase(
    2,
    4,
    `Scanning Stripe (incomplete + trialing buckets) for real-incomplete subs older than ${OLDER_THAN_HOURS}h…`
  );
  for (const bucket of ["incomplete", "trialing"] as const) {
    let startingAfter: string | undefined;
    for (;;) {
      const page = await withStripeRateLimitRetry(`list ${bucket}`, () =>
        stripe.subscriptions.list({
          status: bucket,
          limit: 100,
          ...(startingAfter !== undefined && { starting_after: startingAfter }),
        })
      );
      for (const sub of page.data) {
        scanned++;
        if (sub.status !== "incomplete") continue; // only the real-incomplete cohort
        if (sub.created > cutoffEpoch) continue; // too new — could be an in-flight checkout
        if (seen.has(sub.id)) continue;
        seen.add(sub.id);
        const customerId =
          typeof sub.customer === "string" ? sub.customer : (sub.customer as { id?: string } | null)?.id;
        if (!customerId) continue;
        const list = byCustomer.get(customerId) ?? [];
        list.push(sub.id);
        byCustomer.set(customerId, list);
        heartbeat(scanned, "scanning");
      }
      console.error(
        `   [${bucket}] scanned ${scanned} so far | ${byCustomer.size} customers with stale real-incompletes`
      );
      if (!page.has_more || page.data.length === 0) break;
      startingAfter = page.data[page.data.length - 1].id;
    }
  }
  return byCustomer;
}

// ---------------------------------------------------------------------------
// Counters + per-customer remediation
// ---------------------------------------------------------------------------

type Counters = {
  /** Customers attempted this run (includes ones that errored). */
  customers: number;
  cancelled: number;
  voided: number;
  pointersRepaired: number;
  pointersCleared: number;
  skipped: number;
  errors: number;
};

async function remediateCustomer(
  customerId: string,
  staleSubIds: string[],
  deps: {
    User: typeof import("../src/models/User").default;
    cancelHelper: typeof import("../src/services/subscription/cancelIncompleteSubscription").cancelIncompleteSubscriptionAndVoidInvoice;
    findRecoverable: typeof import("../src/services/subscription/SubscriptionReferenceService").findRecoverableSubscriptionForCustomer;
    getPeriodEnd: typeof import("../src/utils/payment/stripe/subscription-period").getSubscriptionPeriodEnd;
  },
  counters: Counters
): Promise<void> {
  // 1. Retire each stale incomplete sub (cancel + void open invoice).
  for (const subId of staleSubIds) {
    if (DRY_RUN) {
      counters.cancelled++; // planned retirement (voided is only known on a live run)
      console.log(`   [WOULD RETIRE] sub=${subId} (customer ${customerId})`);
    } else {
      const r = await deps.cancelHelper(subId);
      if (r.cancelled) counters.cancelled++;
      if (r.invoiceVoided) counters.voided++;
      if (r.action === "skipped") counters.skipped++;
      console.log(
        `   [RETIRED] sub=${subId} cancelled=${r.cancelled} voided=${r.invoiceVoided}${r.reason ? ` (${r.reason})` : ""}`
      );
    }
  }

  // 2. Repair-or-clear the user's canonical pointer if it now points at a dead sub.
  const user = await deps.User.findOne({ stripeCustomerId: customerId }).select(
    "_id email stripeSubscriptionId subscription"
  );
  if (!user) return;

  const recoverable = await withStripeRateLimitRetry(
    `findRecoverable customer=${customerId}`,
    () => deps.findRecoverable(customerId)
  );
  if (recoverable) {
    if (user.stripeSubscriptionId !== recoverable.id) {
      const periodEnd = deps.getPeriodEnd(recoverable);
      if (DRY_RUN) {
        counters.pointersRepaired++; // planned
        console.log(
          `   [WOULD REPAIR POINTER] ${user.email}: ${user.stripeSubscriptionId ?? "(none)"} → ${recoverable.id}`
        );
      } else {
        user.stripeSubscriptionId = recoverable.id;
        if (user.subscription) {
          user.subscription.status = recoverable.status;
          user.subscription.isActive =
            recoverable.status === "active" || recoverable.status === "trialing";
          if (periodEnd != null) user.subscription.endDate = new Date(periodEnd * 1000);
          user.markModified("subscription");
        }
        await user.save();
        counters.pointersRepaired++;
        console.log(
          `   [POINTER REPAIRED] ${user.email}: → ${recoverable.id} (${recoverable.status})`
        );
      }
    }
    return;
  }

  // No recoverable sub → clear the dead pointer + mark inactive (honest state).
  const needsClear = !!user.stripeSubscriptionId || user.subscription?.isActive === true;
  if (needsClear) {
    if (DRY_RUN) {
      counters.pointersCleared++; // planned
      console.log(
        `   [WOULD CLEAR POINTER] ${user.email}: ${user.stripeSubscriptionId ?? "(none)"} → (cleared), isActive → false`
      );
    } else {
      user.stripeSubscriptionId = undefined;
      if (user.subscription) {
        user.subscription.isActive = false;
        user.subscription.pendingStripeSubscriptionId = undefined;
        user.subscription.pendingStripeSubscriptionRequestId = undefined;
        user.subscription.pendingStripeSubscriptionCreatedAt = undefined;
        user.markModified("subscription");
      }
      await user.save();
      counters.pointersCleared++;
      console.log(`   [POINTER CLEARED] ${user.email}`);
    }
  }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

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
  const { cancelIncompleteSubscriptionAndVoidInvoice } = await import(
    "../src/services/subscription/cancelIncompleteSubscription"
  );
  const { findRecoverableSubscriptionForCustomer } = await import(
    "../src/services/subscription/SubscriptionReferenceService"
  );
  const { getSubscriptionPeriodEnd } = await import(
    "../src/utils/payment/stripe/subscription-period"
  );

  phase(
    1,
    4,
    `Mode: ${DRY_RUN ? "DRY RUN (no writes)" : "LIVE"} | older-than: ${OLDER_THAN_HOURS}h | limit: ${LIMIT ?? "none"} | concurrency: ${CONCURRENCY} | max-retries: ${MAX_RETRIES}`
  );

  const counters: Counters = {
    customers: 0,
    cancelled: 0,
    voided: 0,
    pointersRepaired: 0,
    pointersCleared: 0,
    skipped: 0,
    errors: 0,
  };

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.error("✅ Connected to MongoDB");

    const byCustomer = await scanIncompleteSubs(stripe);

    // Apply --limit (cap on how many customers to process).
    let customerEntries = [...byCustomer.entries()];
    if (LIMIT !== undefined) {
      customerEntries = customerEntries.slice(0, LIMIT);
    }
    const totalCustomers = customerEntries.length;

    phase(3, 4, `Planning: ${totalCustomers} customers with stale incomplete subs`);

    if (totalCustomers === 0) {
      console.log("\n✅ No stale incomplete subscriptions found. Nothing to do.");
      return;
    }

    // Production countdown before live writes.
    if (!DRY_RUN) {
      const isProd =
        /production|mongodb\.net|\.mlab\.com/i.test(process.env.MONGODB_URI ?? "") &&
        process.env.CONFIRM_BACKFILL_PRODUCTION !== "1";
      if (isProd) {
        console.log("⚠️  MONGODB_URI looks like production. Set CONFIRM_BACKFILL_PRODUCTION=1 to skip countdown.");
        console.log(
          `   About to retire stale incomplete subs for ${totalCustomers} customer(s). Waiting 10s — Press Ctrl+C to cancel...\n`
        );
        await sleep(10_000);
      } else {
        console.log(
          `⚠️  LIVE mode: about to process ${totalCustomers} customer(s). Press Ctrl+C within 5s to cancel...\n`
        );
        await sleep(5_000);
      }
    }

    phase(4, 4, DRY_RUN ? "Listing planned actions (no writes)…" : "Applying…");

    const deps = {
      User,
      cancelHelper: cancelIncompleteSubscriptionAndVoidInvoice,
      findRecoverable: findRecoverableSubscriptionForCustomer,
      getPeriodEnd: getSubscriptionPeriodEnd,
    };

    let done = 0;

    const logProgress = () => {
      if (done % 10 !== 0 && done !== totalCustomers) return;
      const elapsedMs = Date.now() - startedAt;
      console.error(
        `Progress: ${done}/${totalCustomers} | cancelled: ${counters.cancelled} | voided: ${counters.voided}` +
          ` | repaired: ${counters.pointersRepaired} | cleared: ${counters.pointersCleared}` +
          ` | skipped: ${counters.skipped} | errors: ${counters.errors} | elapsed: ${formatDurationMs(elapsedMs)}`
      );
    };

    // Process in parallel up to CONCURRENCY.
    let nextIndex = 0;
    const workerCount = Math.min(CONCURRENCY, totalCustomers);

    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (true) {
          const index = nextIndex++;
          if (index >= totalCustomers) return;
          const [customerId, staleSubIds] = customerEntries[index];
          counters.customers++;
          try {
            await remediateCustomer(customerId, staleSubIds, deps, counters);
          } catch (err) {
            counters.errors++;
            console.error(
              `   [ERROR] customer=${customerId}: ${err instanceof Error ? err.message : String(err)}`
            );
          } finally {
            done++;
            logProgress();
          }
        }
      })
    );

    // Final progress line (workers already print when done === totalCustomers).
    if (done % 10 !== 0 && done !== totalCustomers) logProgress();

    console.log("\n📊 Summary");
    if (DRY_RUN) {
      console.log("   (dry-run: counts are PLANNED actions; 'voided' is only determined during a live run)");
    }
    console.table(counters);
    console.log("Total duration: " + formatDurationMs(Date.now() - startedAt));
    console.log(DRY_RUN ? "\nDRY RUN — re-run with --live to apply." : "\nDONE (live).");
  } finally {
    await mongoose.disconnect();
    console.error("\n✅ Disconnected from MongoDB");
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
