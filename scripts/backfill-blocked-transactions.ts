#!/usr/bin/env npx tsx

/**
 * Backfill the `blockedtransactions` collection from Stripe history.
 *
 * The webhook handler (Phase A) captures every new blocked PaymentIntent.
 * This script handles everything that happened BEFORE the webhook was wired
 * up — without it, the admin /admin/blocked-transactions page would only
 * show recent activity. Idempotent on PI id, so re-running is safe.
 *
 * Why Stripe Search instead of `paymentIntents.list`:
 * Search lets us filter `status:"failed"` server-side, so we don't paginate
 * tens of thousands of successful PIs to find the small subset that were
 * blocked. Search has a 20 req/sec rate-limit bucket and is eventually
 * consistent (~1 min lag) — both are fine for a one-shot historical pull.
 *
 * Usage:
 *   npx tsx scripts/backfill-blocked-transactions.ts [--dry-run] [--from=ISO] [--to=ISO] [--limit=N | --no-limit]
 *
 * Options:
 *   --dry-run    Log what would be upserted; no DB writes (default: false).
 *   --from=ISO   Start of window, ISO 8601 (default: 90 days ago).
 *   --to=ISO     End of window, ISO 8601 (default: now).
 *   --limit=N    Max charges to scan (default: 5000).
 *   --no-limit   Scan until Stripe returns no more charges. Use for long
 *                historical windows (e.g. 6+ months). Wins over --limit.
 *
 * Safety:
 * - Dry-run available. Always dry-run first against a fresh window.
 * - Idempotent: upsert keyed on PI id, so re-runs only update `capturedAt`.
 * - Rate-limit safety: 429 retry-with-Retry-After at the iterator boundary;
 *   the Stripe client itself is configured with `maxNetworkRetries: 2` for
 *   transient blips during pagination.
 * - Per-row try/catch so one bad row doesn't abort the run.
 *
 * Env: .env.local must have MONGODB_URI and STRIPE_SECRET_KEY.
 *
 * @module scripts/backfill-blocked-transactions
 */

import { config } from "dotenv";
import path from "path";
import type Stripe from "stripe";

config({ path: path.resolve(process.cwd(), ".env.local") });

const DRY_RUN = process.argv.includes("--dry-run");
const NO_LIMIT = process.argv.includes("--no-limit");
const FROM_ARG = process.argv.find((a) => a.startsWith("--from="));
const TO_ARG = process.argv.find((a) => a.startsWith("--to="));
const LIMIT_ARG = process.argv.find((a) => a.startsWith("--limit="));

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;
const FROM = FROM_ARG
  ? new Date(FROM_ARG.split("=")[1] || "")
  : new Date(Date.now() - NINETY_DAYS_MS);
const TO = TO_ARG ? new Date(TO_ARG.split("=")[1] || "") : new Date();
// `--no-limit` wins over `--limit=N` if both are passed (be permissive — the
// user clearly wants the unbounded run).
const LIMIT = NO_LIMIT
  ? Number.POSITIVE_INFINITY
  : LIMIT_ARG
    ? Math.max(1, parseInt(LIMIT_ARG.split("=")[1] || "5000", 10))
    : 5000;

const MAX_RETRIES_429 = 3;
const RETRY_AFTER_DEFAULT_MS = 5000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDuration(ms: number): string {
  if (ms < 1000) return "<1s";
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  if (min < 60) return `${min}m${remSec.toString().padStart(2, "0")}s`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return `${hr}h${remMin.toString().padStart(2, "0")}m`;
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
    console.error("MONGODB_URI is not set. Set it in .env.local and try again.");
    process.exit(1);
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error("STRIPE_SECRET_KEY is not set. Set it in .env.local and try again.");
    process.exit(1);
  }
  if (Number.isNaN(FROM.getTime()) || Number.isNaN(TO.getTime())) {
    console.error("Invalid --from or --to date.");
    process.exit(1);
  }
  if (FROM >= TO) {
    console.error("--from must be earlier than --to.");
    process.exit(1);
  }

  const connectDB = (await import("../src/lib/mongodb")).default;
  const { stripe } = await import("../src/lib/stripe");
  const { buildBlockedTransactionRecord, upsertBlockedTransaction } = await import(
    "../src/services/allowlist/blockedTransactionRepo"
  );

  await connectDB();

  console.log("\nBackfill blocked transactions from Stripe");
  console.log(`  Mode: ${DRY_RUN ? "DRY RUN (no DB writes)" : "LIVE"}`);
  console.log(`  Window: ${FROM.toISOString()} → ${TO.toISOString()}`);
  console.log(`  Limit: ${NO_LIMIT ? "none (--no-limit)" : `${LIMIT} charges`}`);
  console.log("");

  const fromUnix = Math.floor(FROM.getTime() / 1000);
  const toUnix = Math.floor(TO.getTime() / 1000);

  let scanned = 0;
  let qualifying = 0;
  let upserted = 0;
  let skipped = 0;
  let errored = 0;
  // Track unique card fingerprints so the summary shows true allowlist
  // cardinality — one user retrying a blocked card inflates `qualifying`
  // but not this count.
  const uniqueFingerprints = new Set<string>();

  // Progress tracking. Stripe Search returns charges in DESCENDING `created`
  // order, so each charge's timestamp ticks DOWN from `TO` toward `FROM` —
  // we use the most-recent charge's `created` to compute fraction of the
  // date window covered. More accurate than count-based progress because
  // charge volume is not uniform across time (weekends, promos, etc.).
  const startMs = Date.now();
  const fromMs = FROM.getTime();
  const toMs = TO.getTime();
  const totalRangeMs = Math.max(1, toMs - fromMs);
  const PROGRESS_EVERY_N = 100;
  let lastProgressAt = 0;

  // Stripe charges.search query: failed charges in the date window. We pull
  // the failed charges (cheaper than every PI) and retrieve the parent PI
  // for each blocked one — for backfill that overhead is acceptable since
  // it's run once.
  const query = `status:"failed" AND created>${fromUnix} AND created<${toUnix}`;

  for (let attempt = 0; attempt <= MAX_RETRIES_429; attempt += 1) {
    try {
       
      for await (const charge of stripe.charges.search({ query, limit: 100, expand: ["data.payment_intent"] })) {
        scanned += 1;
        if (scanned > LIMIT) {
          console.log(`Reached --limit=${LIMIT}; stopping early.`);
          break;
        }

        // Progress: charges arrive descending by `created`, so this measures
        // how far back through the window we've traveled.
        if (scanned - lastProgressAt >= PROGRESS_EVERY_N || scanned === 1) {
          const chargeMs = charge.created * 1000;
          const fraction = Math.min(1, Math.max(0, (toMs - chargeMs) / totalRangeMs));
          const elapsedMs = Math.max(1, Date.now() - startMs);
          const etaMs = fraction > 0.005 ? Math.max(0, elapsedMs / fraction - elapsedMs) : 0;
          const etaText = fraction > 0.005 ? formatDuration(etaMs) : "—";
          console.log(
            `  [${(fraction * 100).toFixed(1)}%] scanned=${scanned} qualifying=${qualifying} unique=${uniqueFingerprints.size} elapsed=${formatDuration(elapsedMs)} eta=${etaText}`
          );
          lastProgressAt = scanned;
        }

        const pi =
          charge.payment_intent && typeof charge.payment_intent !== "string"
            ? (charge.payment_intent as Stripe.PaymentIntent)
            : null;
        if (!pi) {
          skipped += 1;
          continue;
        }

        const record = buildBlockedTransactionRecord(pi, charge);
        if (!record) {
          skipped += 1;
          continue;
        }

        qualifying += 1;
        uniqueFingerprints.add(record.cardFingerprint);
        if (DRY_RUN) {
          console.log(
            `[dry] would upsert ${record.paymentIntentId} fp=${record.cardFingerprint} ${record.cardBrand} ••${record.cardLast4} declineCode=${record.declineCode ?? "—"}`
          );
          continue;
        }

        try {
          await upsertBlockedTransaction(record);
          upserted += 1;
          if (upserted % 50 === 0) console.log(`  upserted ${upserted} so far...`);
        } catch (err) {
          errored += 1;
          console.error(
            `  upsert failed for ${record.paymentIntentId}:`,
            err instanceof Error ? err.message : err
          );
        }
      }
      break; // success
    } catch (err) {
      const status = (err as { statusCode?: number } | null)?.statusCode;
      if (status === 429 && attempt < MAX_RETRIES_429) {
        const wait = getRetryAfterMs(err, attempt);
        console.warn(`Stripe 429; retrying in ${wait}ms (attempt ${attempt + 1}/${MAX_RETRIES_429})...`);
         
        await sleep(wait);
        continue;
      }
      throw err;
    }
  }

  const elapsedTotal = Date.now() - startMs;
  console.log("\nSummary:");
  console.log(`  Elapsed:            ${formatDuration(elapsedTotal)}`);
  console.log(`  Charges scanned:    ${scanned}`);
  console.log(`  Qualifying rows:    ${qualifying}`);
  console.log(`  Unique card fp's:   ${uniqueFingerprints.size}  ← the actual allowlist cardinality`);
  console.log(`  Upserted:           ${upserted}${DRY_RUN ? " (dry-run, no writes)" : ""}`);
  console.log(`  Skipped (filter):   ${skipped}`);
  console.log(`  Errored:            ${errored}`);

  await (await import("mongoose")).default.disconnect();
  process.exit(errored > 0 ? 2 : 0);
}

main().catch((err) => {
  console.error("Backfill aborted:", err);
  process.exit(1);
});
