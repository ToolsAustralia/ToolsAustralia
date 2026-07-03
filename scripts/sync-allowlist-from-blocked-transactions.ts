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

  await connectDB();

  console.log("\nSweep allowlist from BlockedTransaction");
  console.log(`  Mode: ${DRY_RUN ? "DRY RUN (no Stripe / DB writes)" : "LIVE"}`);
  console.log(`  Limit: ${NO_LIMIT ? "none (--no-limit)" : `${LIMIT} unique fingerprints`}`);
  console.log("");

  const { reconcileAllowlistFromBlocked } = await import(
    "../src/services/allowlist/reconcileAllowlistFromBlocked"
  );

  const startMs = Date.now();
  let lastLoggedAt = 0;

  const summary = await reconcileAllowlistFromBlocked(
    { kind: "window", limit: NO_LIMIT ? undefined : LIMIT },
    {
      performedByUserId: null,
      dryRun: DRY_RUN,
      throttleMs: DELAY_BETWEEN_APPLIES_MS,
      maxRetries429: MAX_RETRIES_429,
      onItem: ({ input, outcome, reason }) => {
        if (outcome === "added") {
          console.log(
            `${DRY_RUN ? "[dry] would ADD " : "  ADDED  "} ${input.cardFingerprint} ${input.cardBrand} ••${input.cardLast4} ${input.customerEmail ?? "—"}`
          );
        } else if (outcome === "skipped" && DRY_RUN) {
          console.log(
            `[dry] would SKIP  ${input.cardFingerprint} ${input.cardBrand} ••${input.cardLast4} reason=${reason}`
          );
        } else if (outcome === "errored") {
          console.error(`  ERROR for ${input.cardFingerprint}: ${reason}`);
        }
      },
      onProgress: ({ processed, total, added }) => {
        const now = Date.now();
        if (processed !== total && now - lastLoggedAt < 2000) return; // adaptive cadence
        lastLoggedAt = now;
        const fraction = processed / Math.max(1, total);
        const elapsedMs = Math.max(1, now - startMs);
        const etaMs = fraction > 0.005 ? Math.max(0, elapsedMs / fraction - elapsedMs) : 0;
        console.log(
          `  [${(fraction * 100).toFixed(1)}%] processed=${processed}/${total} added=${added} elapsed=${formatDuration(elapsedMs)} eta=${fraction > 0.005 ? formatDuration(etaMs) : "—"}`
        );
      },
    }
  );

  const totalSkipped = summary.skipped.fraud + summary.skipped.permanent + summary.skipped.notMember;
  console.log("\nSummary:");
  console.log(`  Elapsed:                ${formatDuration(Date.now() - startMs)}`);
  console.log(`  Unique fingerprints:    ${summary.evaluated}`);
  console.log(`  Added to allowlist:     ${summary.added}${DRY_RUN ? " (would-add, dry-run)" : ""}`);
  console.log(`  Already allowlisted:    ${summary.alreadyAllowlisted}`);
  console.log(`  Skipped (filter):       ${totalSkipped}`);
  console.log(`    fraud signal:         ${summary.skipped.fraud}`);
  console.log(`    permanent issue:      ${summary.skipped.permanent}`);
  console.log(`    not member:           ${summary.skipped.notMember}`);
  console.log(`  Errored:                ${summary.errored}`);

  await (await import("mongoose")).default.disconnect();
  process.exit(summary.errored > 0 ? 2 : 0);
}

main().catch((err) => {
  console.error("Sweep aborted:", err);
  process.exit(1);
});
