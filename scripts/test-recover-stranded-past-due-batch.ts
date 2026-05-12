#!/usr/bin/env npx tsx

/**
 * Bulk variant of test-recover-stranded-past-due.ts. Scans Mongo for every
 * past_due user, identifies a stranded open Stripe invoice per user, and
 * (with --live) runs the recovery flow against each one in sequence.
 *
 * Same lock-bypass semantics as the per-user script: passes
 * `bypassRecentRecoveryLock: true` so the 6h recovery lock doesn't block
 * sequential runs. The recovery flow's own 24h-per-original-invoice
 * idempotency is unaffected.
 *
 * Usage:
 *   # Dry-run: scans everyone, prints who would be recovered, no writes
 *   npx tsx scripts/test-recover-stranded-past-due-batch.ts
 *
 *   # Dry-run, but only the first 5 past_due users
 *   npx tsx scripts/test-recover-stranded-past-due-batch.ts --limit=5
 *
 *   # Live execution (requires --admin-email AND --confirm-bulk)
 *   npx tsx scripts/test-recover-stranded-past-due-batch.ts --live --admin-email=admin@example.com --confirm-bulk
 *
 * Exits non-zero if env vars are missing or the bulk-confirm gate is not set.
 * Per-user errors are printed and counted but never abort the run.
 */

import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env.local") });

const args = process.argv.slice(2);
const get = (key: string): string | undefined => {
  const flag = args.find((a) => a.startsWith(`--${key}=`));
  return flag ? flag.split("=").slice(1).join("=") : undefined;
};
const has = (key: string): boolean => args.includes(`--${key}`);

const limit = get("limit");
const live = has("live");
const adminEmail = get("admin-email");
const confirmBulk = has("confirm-bulk");

const limitN = limit ? Number.parseInt(limit, 10) : Number.POSITIVE_INFINITY;
if (limit && (!Number.isFinite(limitN) || limitN < 1)) {
  console.error("--limit must be a positive integer");
  process.exit(1);
}
if (live && !adminEmail) {
  console.error("--live requires --admin-email=<admin's email>");
  process.exit(1);
}
if (live && !confirmBulk) {
  console.error(
    "--live requires --confirm-bulk (this script touches many real cards in one run; pass --confirm-bulk to acknowledge)"
  );
  process.exit(1);
}

const PACING_MS = 500;

type RowOutcome =
  | { kind: "no_stranded_invoice" }
  | { kind: "not_eligible"; reason: string; message: string }
  | { kind: "would_recover"; invoiceId: string; expectedAmountCents: number }
  | {
      kind: "recovered";
      originalInvoiceId: string;
      newInvoiceId: string;
      paymentStatus: "success" | "failed" | "skipped";
      amount: number;
      error?: string;
    }
  | { kind: "recovery_failed"; originalInvoiceId: string; reason: string; message: string }
  | { kind: "error"; error: string };

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
  const { checkRecoveryEligibility, recoverStrandedPastDueInvoice } = await import(
    "../src/server/admin/recoverStrandedPastDue"
  );
  const { isOriginalInvoiceEligibleForRecovery } = await import(
    "../src/server/admin/recoverStrandedPastDuePolicy"
  );

  await mongoose.connect(process.env.MONGODB_URI);

  type LeanUser = {
    _id: unknown;
    email?: string | null;
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
    subscription?: { status?: string | null } | null;
  };

  console.log(
    `Mode: ${live ? "LIVE" : "DRY-RUN"}${Number.isFinite(limitN) ? `  Limit: ${limitN}` : ""}`
  );
  if (live) console.log(`Admin: ${adminEmail}`);
  console.log("");

  // Resolve admin once (live only) so we fail fast if the email is wrong
  let adminId: string | null = null;
  if (live) {
    const admin = await User.findOne({ email: adminEmail, role: "admin" })
      .select("_id email")
      .lean<{ _id: unknown; email?: string | null } | null>();
    if (!admin) {
      console.error(`No admin user found with email=${adminEmail ?? ""}`);
      await mongoose.disconnect();
      process.exit(6);
    }
    adminId = String(admin._id);
  }

  // Find all past_due users with a Stripe customer set
  const cursor = User.find({
    "subscription.status": "past_due",
    stripeCustomerId: { $exists: true, $ne: null },
  })
    .select("_id email stripeCustomerId stripeSubscriptionId subscription")
    .lean<LeanUser[]>();

  const users = await cursor;
  const scanCount = Math.min(users.length, limitN);

  console.log(
    `Found ${users.length} past_due user(s) with a Stripe customer.${
      Number.isFinite(limitN) ? ` Processing first ${scanCount}.` : ""
    }\n`
  );

  let processed = 0;
  let noStrandedInvoice = 0;
  let notEligible = 0;
  let wouldRecover = 0;
  let recoveredSuccess = 0;
  let recoveredFailed = 0;
  let recoveredSkipped = 0;
  let recoveryFailedBeforeStripe = 0;
  let errors = 0;

  for (const user of users) {
    if (processed >= scanCount) break;
    processed++;

    const userId = String(user._id);
    const label = `${user.email ?? userId}`;
    const prefix = `[${processed}/${scanCount}] ${label}`;

    let outcome: RowOutcome;

    try {
      // 1. Scan open invoices for a stranded candidate
      const list = await stripe.invoices.list({
        customer: user.stripeCustomerId!,
        status: "open",
        limit: 100,
      });
      const stranded = list.data.find((inv) =>
        isOriginalInvoiceEligibleForRecovery(inv).eligible
      );
      if (!stranded?.id) {
        outcome = { kind: "no_stranded_invoice" };
        noStrandedInvoice++;
      } else {
        // 2. Check eligibility (bypasses 6h lock)
        const eligibility = await checkRecoveryEligibility({
          userId,
          originalInvoiceId: stranded.id,
          bypassRecentRecoveryLock: true,
        });

        if (!eligibility.eligible) {
          outcome = {
            kind: "not_eligible",
            reason: eligibility.reason,
            message: eligibility.message,
          };
          notEligible++;
        } else if (!live) {
          // 3a. Dry-run: just report
          outcome = {
            kind: "would_recover",
            invoiceId: stranded.id,
            expectedAmountCents: eligibility.expectedAmountCents,
          };
          wouldRecover++;
        } else {
          // 3b. Live: execute the recovery
          const result = await recoverStrandedPastDueInvoice({
            userId,
            originalInvoiceId: stranded.id,
            adminId: adminId!,
            bypassRecentRecoveryLock: true,
          });
          if (result.ok) {
            outcome = {
              kind: "recovered",
              originalInvoiceId: stranded.id,
              newInvoiceId: result.newInvoiceId,
              paymentStatus: result.row.status,
              amount: result.row.amount ?? 0,
              error: result.row.error,
            };
            if (result.row.status === "success") recoveredSuccess++;
            else if (result.row.status === "failed") recoveredFailed++;
            else recoveredSkipped++;
          } else {
            outcome = {
              kind: "recovery_failed",
              originalInvoiceId: stranded.id,
              reason: result.reason,
              message: result.message,
            };
            recoveryFailedBeforeStripe++;
          }
        }
      }
    } catch (err) {
      outcome = {
        kind: "error",
        error: err instanceof Error ? err.message : String(err),
      };
      errors++;
    }

    // Per-row report
    switch (outcome.kind) {
      case "no_stranded_invoice":
        console.log(`${prefix} → no stranded invoice`);
        break;
      case "not_eligible":
        console.log(`${prefix} → not eligible (${outcome.reason}: ${outcome.message})`);
        break;
      case "would_recover":
        console.log(
          `${prefix} → WOULD RECOVER invoice=${outcome.invoiceId} amount=${(
            outcome.expectedAmountCents / 100
          ).toFixed(2)}`
        );
        break;
      case "recovered":
        console.log(
          `${prefix} → RECOVERED original=${outcome.originalInvoiceId} new=${
            outcome.newInvoiceId
          } payment=${outcome.paymentStatus} amount=${(outcome.amount / 100).toFixed(2)}${
            outcome.error ? ` error=${outcome.error}` : ""
          }`
        );
        break;
      case "recovery_failed":
        console.log(
          `${prefix} → RECOVERY FAILED original=${outcome.originalInvoiceId} reason=${outcome.reason} (${outcome.message})`
        );
        break;
      case "error":
        console.log(`${prefix} → ERROR ${outcome.error}`);
        break;
    }

    // Pace between users (skip the final wait)
    if (processed < scanCount) {
      await new Promise((r) => setTimeout(r, PACING_MS));
    }
  }

  console.log("\n=== Summary ===");
  console.log(`Mode:                       ${live ? "LIVE" : "DRY-RUN"}`);
  console.log(`Past-due users scanned:     ${processed}`);
  console.log(`No stranded invoice:        ${noStrandedInvoice}`);
  console.log(`Not eligible:               ${notEligible}`);
  if (live) {
    console.log(`Recovered → success:        ${recoveredSuccess}`);
    console.log(`Recovered → payment failed: ${recoveredFailed}`);
    console.log(`Recovered → payment skipped:${recoveredSkipped}`);
    console.log(`Recovery refused/failed:    ${recoveryFailedBeforeStripe}`);
  } else {
    console.log(`Would recover:              ${wouldRecover}`);
  }
  console.log(`Errors:                     ${errors}`);

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(99);
});
