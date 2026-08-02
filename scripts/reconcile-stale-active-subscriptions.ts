/**
 * Reconcile Mongo `subscription.status` against Stripe for members stuck on a stale `active`.
 *
 * WHY THIS EXISTS
 * A failed stranded-member RE-BILL (`mintCurrentCycleInvoice`, billing_reason
 * "subscription_update") used to fire the dunning notification but NOT write
 * `past_due` back to Mongo — the status write was gated on `isRenewal` alone while the
 * notification fired on `isRenewal || isRebill`. Combined with `unpauseAndAnchorNow`
 * emitting a `customer.subscription.updated` carrying status "active" (which we mirror),
 * that left members reading `active` in Mongo while genuinely delinquent for weeks.
 * The webhook gap is fixed in `src/services/stripe-webhook-handlers/index.ts`; this script
 * repairs accounts that already drifted.
 *
 * Measured on production 2026-07-31: 2 affected accounts out of 864 `active` members who
 * have ever had a real charge failure (the other 862 genuinely recovered). Deliberately a
 * targeted repair, NOT a standing sweep — see docs/tech-debt/past-due-recovery-findings.md F7.
 *
 * STRIPE IS THE SOURCE OF TRUTH. The script never infers a status from payment history; it
 * retrieves the live Stripe subscription and mirrors its status, exactly as the webhook does.
 * A member whose Stripe subscription is genuinely `active` is left alone, whatever the ledger says.
 *
 * Usage:
 *   npm run reconcile:stale-active:dry     # report only (safe, no writes)
 *   npm run reconcile:stale-active         # apply
 *   npm run reconcile:stale-active:dry -- --limit=50
 *
 * Options:
 *   --dry-run      Report without writing. (The `:dry` npm variant passes this.)
 *   --limit=N      Cap how many candidates are examined (default: no cap).
 *   --email=X      Restrict to a single member, for spot-checking.
 *
 * Safety:
 *   - Read-only unless run WITHOUT --dry-run.
 *   - Only ever writes when live Stripe status !== Mongo status, and only for members whose
 *     Mongo status is `active` (it will not touch cancelled/paused/past_due members).
 *   - Never charges a card, never mutates Stripe. Mongo writes are limited to
 *     subscription.status / isActive / pastDueAt.
 *   - Appends a CSV audit row for every decision, including skips.
 *
 * Env: MONGODB_URI, STRIPE_SECRET_KEY (from .env.local)
 */
import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(process.cwd(), ".env.local") });

import fs from "fs";
import mongoose from "mongoose";
import Stripe from "stripe";
import connectDB from "../src/lib/mongodb";

const DRY_RUN = process.argv.includes("--dry-run");
const LIMIT = (() => {
  const a = process.argv.find((x) => x.startsWith("--limit="));
  return a ? Number(a.split("=")[1]) : Number.POSITIVE_INFINITY;
})();
const ONLY_EMAIL = (() => {
  const a = process.argv.find((x) => x.startsWith("--email="));
  return a ? a.split("=")[1] : null;
})();

/** Stripe statuses that mean "not currently paid up" — mirrored verbatim into Mongo. */
const DELINQUENT = new Set(["past_due", "unpaid", "incomplete", "incomplete_expired", "canceled"]);
/** PaymentEvent types that represent money actually landing. */
const PAID_EVENTS = ["BenefitsGranted", "PaymentProcessed", "SubscriptionActivated"];

const AUDIT = path.resolve(process.cwd(), "reconcile-stale-active-audit.csv");

function audit(row: Record<string, unknown>): void {
  if (!fs.existsSync(AUDIT)) {
    fs.appendFileSync(
      AUDIT,
      "ranAt,dryRun,email,userId,subscriptionId,mongoStatus,stripeStatus,lastRealPayment,daysSincePaid,action,reason\n"
    );
  }
  fs.appendFileSync(
    AUDIT,
    [
      new Date().toISOString(),
      DRY_RUN,
      row.email ?? "",
      row.userId ?? "",
      row.subscriptionId ?? "",
      row.mongoStatus ?? "",
      row.stripeStatus ?? "",
      row.lastRealPayment ?? "",
      row.daysSincePaid ?? "",
      row.action ?? "",
      `"${String(row.reason ?? "").replace(/"/g, "'")}"`,
    ].join(",") + "\n"
  );
}

function fmtEta(msPerItem: number, remaining: number): string {
  const s = Math.round((msPerItem * remaining) / 1000);
  if (!Number.isFinite(s) || s < 0) return "?";
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m${String(s % 60).padStart(2, "0")}s` : `${s}s`;
}

async function main(): Promise<void> {
  console.log(`\n=== reconcile-stale-active-subscriptions ${DRY_RUN ? "(DRY RUN — no writes)" : "(LIVE)"} ===\n`);
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is not set");

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2025-08-27.basil" as Stripe.LatestApiVersion,
  });
  await connectDB();
  const db = mongoose.connection.db;
  if (!db) throw new Error("No mongoose connection");

  const logs = db.collection("invoicechargelogs");
  const users = db.collection("users");
  const events = db.collection("paymentevents");

  // Candidates: `active` in Mongo AND has at least one REAL charge failure (recovery
  // step-audit rows carry status "failed"/"success" but are machinery, not card outcomes).
  const failedUserIds = (await logs.distinct("userId", {
    status: "failed",
    "result.recovery.step": { $exists: false },
  })) as mongoose.Types.ObjectId[];

  const query: Record<string, unknown> = {
    _id: { $in: failedUserIds },
    "subscription.status": "active",
  };
  if (ONLY_EMAIL) query.email = ONLY_EMAIL;

  const candidates = await users
    .find(query)
    .project({ _id: 1, email: 1, stripeSubscriptionId: 1, subscription: 1 })
    .toArray();

  const total = Math.min(candidates.length, LIMIT);
  console.log(`Candidates to examine: ${total} (of ${candidates.length} 'active' members with a real charge failure)\n`);
  if (total === 0) {
    console.log("Nothing to do.");
    await mongoose.disconnect();
    return;
  }

  const started = Date.now();
  const progressEvery = Math.max(1, Math.floor(total / 20)); // ~20 progress lines regardless of size
  let processed = 0;
  let repaired = 0;
  let alreadyCorrect = 0;
  let genuinelyActive = 0;
  let noStripeSub = 0;
  let errors = 0;

  for (const u of candidates.slice(0, total)) {
    processed++;
    const email = String(u.email ?? "");
    const sub = (u as { subscription?: Record<string, unknown> }).subscription ?? {};
    const mongoStatus = String(sub.status ?? "");
    const subId = (u as { stripeSubscriptionId?: string }).stripeSubscriptionId;

    try {
      if (!subId) {
        noStripeSub++;
        audit({ email, userId: u._id, mongoStatus, action: "skip", reason: "no stripeSubscriptionId on user" });
      } else {
        const stripeSub = await stripe.subscriptions.retrieve(subId);
        const stripeStatus = stripeSub.status;

        const lastPayment = await events
          .find({ userId: u._id, eventType: { $in: PAID_EVENTS } })
          .sort({ timestamp: -1 })
          .limit(1)
          .next();
        const lastRealPayment = lastPayment
          ? new Date(lastPayment.timestamp as Date).toISOString().slice(0, 10)
          : "never";
        const daysSincePaid = lastPayment
          ? Math.floor((Date.now() - new Date(lastPayment.timestamp as Date).getTime()) / 86400000)
          : "";

        if (!DELINQUENT.has(stripeStatus)) {
          genuinelyActive++;
          audit({
            email, userId: u._id, subscriptionId: subId, mongoStatus, stripeStatus,
            lastRealPayment, daysSincePaid, action: "skip",
            reason: `Stripe says ${stripeStatus} — member is genuinely current, leaving alone`,
          });
        } else if (mongoStatus === stripeStatus) {
          alreadyCorrect++;
          audit({
            email, userId: u._id, subscriptionId: subId, mongoStatus, stripeStatus,
            lastRealPayment, daysSincePaid, action: "skip", reason: "already in sync",
          });
        } else {
          repaired++;
          console.log(
            `  ${DRY_RUN ? "WOULD FIX" : "FIXING"}  ${email.padEnd(34)} mongo=${mongoStatus} → stripe=${stripeStatus}  (last real payment ${lastRealPayment}, ${daysSincePaid}d ago)`
          );
          if (!DRY_RUN) {
            const set: Record<string, unknown> = {
              "subscription.status": stripeStatus,
              "subscription.isActive": false,
            };
            // Preserve an existing pastDueAt; only stamp it if this is the first time.
            if (sub.pastDueAt == null && (stripeStatus === "past_due" || stripeStatus === "unpaid")) {
              set["subscription.pastDueAt"] = new Date();
            }
            await users.updateOne({ _id: u._id, "subscription.status": "active" }, { $set: set });
          }
          audit({
            email, userId: u._id, subscriptionId: subId, mongoStatus, stripeStatus,
            lastRealPayment, daysSincePaid,
            action: DRY_RUN ? "would-fix" : "fixed",
            reason: `Mongo said active; Stripe says ${stripeStatus}`,
          });
        }
      }
    } catch (err) {
      errors++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ERROR ${email}: ${msg}`);
      audit({ email, userId: u._id, subscriptionId: subId, mongoStatus, action: "error", reason: msg });
    }

    if (processed % progressEvery === 0 || processed === total) {
      const elapsed = Date.now() - started;
      const rate = processed / (elapsed / 1000);
      console.log(
        `  … ${processed}/${total} (${Math.round((processed / total) * 100)}%) · ${rate.toFixed(1)}/s · ETA ${fmtEta(elapsed / processed, total - processed)}`
      );
    }
  }

  console.log(`\n=== Summary ${DRY_RUN ? "(DRY RUN)" : "(LIVE)"} ===`);
  console.log(`  examined            : ${processed}`);
  console.log(`  ${DRY_RUN ? "would repair" : "repaired    "}        : ${repaired}`);
  console.log(`  genuinely active    : ${genuinelyActive}`);
  console.log(`  already in sync     : ${alreadyCorrect}`);
  console.log(`  no Stripe sub id    : ${noStripeSub}`);
  console.log(`  errors              : ${errors}`);
  console.log(`  audit log           : ${AUDIT}`);
  if (DRY_RUN && repaired > 0) console.log(`\n  Re-run without --dry-run to apply.`);

  await mongoose.disconnect();

  // 3-tier exit: 0 = clean, 1 = hard failure, 2 = completed with per-item errors.
  if (errors > 0) process.exit(2);
}

main().catch((err) => {
  console.error("\nFATAL:", err);
  process.exit(1);
});
