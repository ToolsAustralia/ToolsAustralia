#!/usr/bin/env npx tsx

/**
 * Sweep Stripe allowlist from `blockedtransactions` collection.
 *
 * For every unique card fingerprint in the BlockedTransaction collection,
 * call `AllowlistService.apply()` with `source: "admin_bulk"`. Eligible cards
 * (paying members, no fraud-signal / no permanent-issue decline codes) get
 * added to Stripe Radar's `card_fingerprint_allowlist` value list. Ineligible
 * cards get a recorded `AllowlistAction` row with `action: "skipped"`.
 *
 * **Why this exists:** the `payment_intent.payment_failed` webhook handler
 * auto-allowlists eligible cards on every block — but only for blocks that
 * occurred AFTER the webhook was wired live. Historical blocks captured by
 * `scripts/backfill-blocked-transactions.ts` have no corresponding
 * `AllowlistAction`, so their fingerprints never made it into Stripe's
 * allowlist. This script closes that gap exactly once.
 *
 * After it runs, "Charge Past Due Customers" should hit far fewer
 * Stripe-blocked failures for legitimate paying members whose cards were
 * auto-blocked before the webhook was wired.
 *
 * Idempotency: this script pre-checks `AllowlistAction` for an existing
 * `added` row per fingerprint and skips both the Stripe call and the
 * `apply()` invocation in that case — re-runs are no-ops on the *added*
 * path. Re-running on previously-*skipped* fingerprints will re-evaluate
 * eligibility (which is actually useful: a user who wasn't a member when
 * first skipped may have since paid, flipping them eligible) and insert a
 * fresh `skipped` row. Acceptable, but worth knowing if you re-run.
 *
 * Usage:
 *   npx tsx scripts/sync-allowlist-from-blocked-transactions.ts [--dry-run] [--limit=N | --no-limit]
 *
 * Options:
 *   --dry-run    Run `AllowlistService.evaluate()` (read-only) for each
 *                fingerprint and log what *would* happen. No Stripe writes,
 *                no `AllowlistAction` inserts. (default: off — live mode)
 *   --limit=N    Cap unique fingerprints processed (default: 1000).
 *   --no-limit   Process every unique fingerprint. Use when a real run
 *                exceeds the default cap. Wins over --limit.
 *
 * Safety:
 *   - Always run --dry-run first, eyeball the eligibility breakdown.
 *   - Idempotent — re-runs are no-ops for already-allowlisted cards.
 *   - Per-card try/catch — one failure does not abort the run.
 *   - Polite throttle (DELAY_BETWEEN_APPLIES_MS) keeps under Stripe's
 *     read+write rate-limit headroom.
 *   - 429 retry-with-Retry-After at the per-card boundary; the Stripe
 *     client itself also has `maxNetworkRetries: 2`.
 *
 * Env: .env.local must have MONGODB_URI and STRIPE_SECRET_KEY.
 *
 * @module scripts/sync-allowlist-from-blocked-transactions
 */

import { config } from "dotenv";
import path from "path";
import type { PipelineStage } from "mongoose";

config({ path: path.resolve(process.cwd(), ".env.local") });

const DRY_RUN = process.argv.includes("--dry-run");
const NO_LIMIT = process.argv.includes("--no-limit");
const LIMIT_ARG = process.argv.find((a) => a.startsWith("--limit="));
// `--no-limit` wins over `--limit=N` if both are passed (be permissive — the
// operator is asking for an unbounded run).
const LIMIT = NO_LIMIT
  ? Number.POSITIVE_INFINITY
  : LIMIT_ARG
    ? Math.max(1, parseInt(LIMIT_ARG.split("=")[1] || "1000", 10))
    : 1000;

const DELAY_BETWEEN_APPLIES_MS = 100;
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

type EligibilityBucket =
  | "filter_fraud_signal"
  | "filter_permanent_issue"
  | "filter_not_member";

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set. Set it in .env.local and try again.");
    process.exit(1);
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    console.error("STRIPE_SECRET_KEY is not set. Set it in .env.local and try again.");
    process.exit(1);
  }

  const connectDB = (await import("../src/lib/mongodb")).default;
  const BlockedTransaction = (await import("../src/models/BlockedTransaction")).default;
  const AllowlistAction = (await import("../src/models/AllowlistAction")).default;
  const { getAllowlistService } = await import("../src/services/allowlist");

  await connectDB();
  const service = getAllowlistService();

  console.log("\nSweep allowlist from BlockedTransaction");
  console.log(`  Mode: ${DRY_RUN ? "DRY RUN (no Stripe / DB writes)" : "LIVE"}`);
  console.log(`  Limit: ${NO_LIMIT ? "none (--no-limit)" : `${LIMIT} unique fingerprints`}`);
  console.log("");

  // One row per unique card fingerprint — most-recent block wins. The latest
  // block carries the freshest customer/decline context, which is what
  // AllowlistService.evaluate / apply will key off.
  // The `$limit` stage is only added when a finite cap is set — Mongo's
  // $limit cannot represent Infinity (rejects with code 5107201).
  const pipeline: PipelineStage[] = [
    { $sort: { createdAt: -1 } },
    {
      $group: {
        _id: "$cardFingerprint",
        latest: { $first: "$$ROOT" },
      },
    },
  ];
  if (!NO_LIMIT) pipeline.push({ $limit: LIMIT });

  const groups: Array<{
    _id: string;
    latest: {
      paymentIntentId: string;
      chargeId: string;
      cardFingerprint: string;
      cardLast4: string;
      cardBrand: string;
      stripeCustomerId: string | null;
      customerEmail: string | null;
      declineCode: string | null;
      failureCode: string | null;
    };
  }> = await BlockedTransaction.aggregate(pipeline);

  console.log(`  Found ${groups.length} unique fingerprints to process.\n`);

  const startMs = Date.now();
  let processed = 0;
  let added = 0;
  let alreadyAllowlisted = 0;
  let errored = 0;
  const skipBucket: Record<EligibilityBucket, number> = {
    filter_fraud_signal: 0,
    filter_permanent_issue: 0,
    filter_not_member: 0,
  };

  for (const group of groups) {
    const r = group.latest;
    processed += 1;

    const evalInput = {
      cardFingerprint: r.cardFingerprint,
      cardLast4: r.cardLast4,
      cardBrand: r.cardBrand,
      stripeCustomerId: r.stripeCustomerId,
      customerEmail: r.customerEmail,
      declineCode: r.declineCode,
      failureCode: r.failureCode,
      triggeringPaymentIntentId: r.paymentIntentId,
      triggeringChargeId: r.chargeId,
    };

    // Pre-check for an existing active "added" AllowlistAction. If present,
    // this fingerprint is already in Stripe's allowlist (or was previously
    // committed to be) — skip both the Stripe API call and the DB insert.
    // Gives us an exact "added vs already-allowlisted" counter without
    // depending on createdAt heuristics.
    const existingAdded = await AllowlistAction.findOne({
      cardFingerprint: r.cardFingerprint,
      action: "added",
    })
      .sort({ createdAt: -1 })
      .lean();
    if (existingAdded) {
      alreadyAllowlisted += 1;
      // No throttle needed — we didn't call Stripe.
      continue;
    }

    if (DRY_RUN) {
      try {
        const result = await service.evaluate(evalInput);
        if (result.eligible) {
          added += 1;
          console.log(
            `[dry] would ADD     ${r.cardFingerprint} ${r.cardBrand} ••${r.cardLast4} ${r.customerEmail ?? "—"}`
          );
        } else {
          skipBucket[result.reason] += 1;
          console.log(
            `[dry] would SKIP    ${r.cardFingerprint} ${r.cardBrand} ••${r.cardLast4} reason=${result.reason}`
          );
        }
      } catch (err) {
        errored += 1;
        console.error(
          `[dry] eval failed for ${r.cardFingerprint}:`,
          err instanceof Error ? err.message : err
        );
      }
    } else {
      // Live: call apply() with retry on 429.
      let attempt = 0;
      let succeeded = false;
      while (!succeeded && attempt <= MAX_RETRIES_429) {
        try {
          const action = await service.apply(evalInput, "admin_bulk", null, false);
          // We pre-checked for "added" rows above, so any "added" return
          // here is a fresh insert — no heuristic needed.
          if (action.action === "added") {
            added += 1;
            console.log(
              `  ADDED   ${r.cardFingerprint} ${r.cardBrand} ••${r.cardLast4} ${r.customerEmail ?? "—"}`
            );
          } else if (action.action === "skipped") {
            const reason = action.reason as EligibilityBucket;
            if (reason in skipBucket) skipBucket[reason] += 1;
          }
          succeeded = true;
        } catch (err) {
          const status = (err as { statusCode?: number; status?: number } | null)?.statusCode
            ?? (err as { statusCode?: number; status?: number } | null)?.status;
          if (status === 429 && attempt < MAX_RETRIES_429) {
            const wait = getRetryAfterMs(err, attempt);
            console.warn(`  Stripe 429; retrying in ${wait}ms (attempt ${attempt + 1}/${MAX_RETRIES_429})...`);
            await sleep(wait);
            attempt += 1;
            continue;
          }
          errored += 1;
          console.error(
            `  ERROR for ${r.cardFingerprint}:`,
            err instanceof Error ? err.message : err
          );
          succeeded = true; // give up on this card; move on
        }
      }

      // Polite throttle to keep below Stripe rate-limit headroom.
      await sleep(DELAY_BETWEEN_APPLIES_MS);
    }

    if (processed % 25 === 0 || processed === groups.length) {
      const fraction = processed / Math.max(1, groups.length);
      const elapsedMs = Math.max(1, Date.now() - startMs);
      const etaMs = fraction > 0.005 ? Math.max(0, elapsedMs / fraction - elapsedMs) : 0;
      const etaText = fraction > 0.005 ? formatDuration(etaMs) : "—";
      console.log(
        `  [${(fraction * 100).toFixed(1)}%] processed=${processed}/${groups.length} added=${added} elapsed=${formatDuration(elapsedMs)} eta=${etaText}`
      );
    }
  }

  const totalSkipped =
    skipBucket.filter_fraud_signal +
    skipBucket.filter_permanent_issue +
    skipBucket.filter_not_member;

  console.log("\nSummary:");
  console.log(`  Elapsed:                ${formatDuration(Date.now() - startMs)}`);
  console.log(`  Unique fingerprints:    ${groups.length}`);
  console.log(`  Added to allowlist:     ${added}${DRY_RUN ? " (would-add, dry-run)" : ""}`);
  console.log(`  Already allowlisted:    ${alreadyAllowlisted}`);
  console.log(`  Skipped (filter):       ${totalSkipped}`);
  console.log(`    fraud signal:         ${skipBucket.filter_fraud_signal}`);
  console.log(`    permanent issue:      ${skipBucket.filter_permanent_issue}`);
  console.log(`    not member:           ${skipBucket.filter_not_member}`);
  console.log(`  Errored:                ${errored}`);

  await (await import("mongoose")).default.disconnect();
  process.exit(errored > 0 ? 2 : 0);
}

main().catch((err) => {
  console.error("Sweep aborted:", err);
  process.exit(1);
});
