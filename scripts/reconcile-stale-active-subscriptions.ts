/**
 * Find members whose subscription reads `active` but who are not actually being billed.
 *
 * WHY THIS EXISTS
 * Two distinct failure shapes produce the same symptom — an `active` member who has not paid
 * in months — and they need different handling:
 *
 *   A. STATUS DRIFT (repairable here). Mongo says `active`, Stripe says past_due/unpaid/etc.
 *      Cause: `invoice.payment_failed` fired the dunning notification on `isRenewal || isRebill`
 *      but wrote `past_due` on `isRenewal` alone, so a failed minted re-bill
 *      (billing_reason "subscription_update") emailed the member while leaving Mongo `active`.
 *      Fixed in src/services/stripe-webhook-handlers/index.ts; this repairs prior drift.
 *
 *   B. STUCK COLLECTION PAUSE (report only — NEVER auto-fixed here). Stripe AND Mongo both say
 *      `active`, and both are correct: the subscription carries
 *      `pause_collection: { behavior: "keep_as_draft", resumes_at: null }`. Stripe keeps a
 *      paused subscription `active` and simply stops billing it.
 *      `resumeAfterSuccessfulRenewalPayment` clears the pause on a successful payment — which
 *      never arrived — so the pause persists indefinitely and held drafts pile up.
 *
 *   Measured on production 2026-08-03: shape A = 0 accounts, shape B = the real population.
 *   The original version of this script only looked for A, which is why it reported nothing.
 *
 * Shape B is deliberately NOT auto-remediated. Un-pausing collection charges the card and
 * moves the billing anchor (see docs/PAST_DUE_REANCHOR.md and BUSINESS.md §9e) — that is money
 * movement and a policy decision, not a reconcile. Use the existing admin recovery tooling
 * (Recover Stranded panel / per-user Charge) on the accounts this reports.
 *
 * Usage:
 *   npm run reconcile:stale-active:dry                                  # report only, .env.local
 *   npm run reconcile:stale-active:dry -- --env=../../.env.production   # target production
 *   npm run reconcile:stale-active -- --env=../../.env.production       # apply shape-A repairs
 *
 * Options:
 *   --dry-run        Report without writing. (The `:dry` npm variant passes this.)
 *   --env=PATH       Env file to load, relative to cwd (default: .env.local).
 *   --stale-days=N   Days since last real payment before a member is a candidate (default 45).
 *   --email=X        Restrict to a single member, for spot-checking.
 *   --limit=N        Cap candidates examined after filtering.
 *
 * Safety:
 *   - Read-only unless run WITHOUT --dry-run, and even then it only ever writes
 *     subscription.status / isActive / pastDueAt for shape A.
 *   - Never charges a card, never unpauses, never mutates Stripe. Stripe is read as the
 *     source of truth; status is never inferred from payment history.
 *   - Appends a CSV audit row for every decision, including skips.
 *
 * Env: MONGODB_URI, STRIPE_SECRET_KEY
 */
import { config } from "dotenv";
import path from "path";

// Env file is selectable because a real reconcile targets PRODUCTION, while the repo
// script convention (and every dry run) defaults to `.env.local`. Passing it explicitly
// beats exporting secrets into the shell, where they leak into history and logs.
const ENV_FILE =
  process.argv.find((a) => a.startsWith("--env="))?.slice("--env=".length) ?? ".env.local";
config({ path: path.resolve(process.cwd(), ENV_FILE), override: true });

import fs from "fs";
import mongoose from "mongoose";
import Stripe from "stripe";
import connectDB from "../src/lib/mongodb";

const DRY_RUN = process.argv.includes("--dry-run");
const numArg = (flag: string, fallback: number): number => {
  const a = process.argv.find((x) => x.startsWith(`${flag}=`));
  const n = a ? Number(a.split("=")[1]) : NaN;
  return Number.isFinite(n) ? n : fallback;
};
const STALE_DAYS = numArg("--stale-days", 45);
const LIMIT = numArg("--limit", Number.POSITIVE_INFINITY);
const ONLY_EMAIL = process.argv.find((x) => x.startsWith("--email="))?.split("=")[1] ?? null;

/** Stripe statuses that mean "not currently paid up" — mirrored verbatim into Mongo (shape A). */
const DELINQUENT = new Set(["past_due", "unpaid", "incomplete", "incomplete_expired", "canceled"]);
/** PaymentEvent types that represent money actually landing. */
const PAID_EVENTS = ["BenefitsGranted", "PaymentProcessed", "SubscriptionActivated"];

const AUDIT = path.resolve(process.cwd(), "reconcile-stale-active-audit.csv");

function audit(row: Record<string, unknown>): void {
  if (!fs.existsSync(AUDIT)) {
    fs.appendFileSync(
      AUDIT,
      "ranAt,dryRun,shape,email,userId,subscriptionId,mongoStatus,stripeStatus,pauseBehavior,resumesAt,lastRealPayment,daysSincePaid,heldDrafts,uncollectedCents,action,reason\n"
    );
  }
  const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, "'")}"`;
  fs.appendFileSync(
    AUDIT,
    [
      new Date().toISOString(), DRY_RUN, row.shape ?? "", cell(row.email), row.userId ?? "",
      row.subscriptionId ?? "", row.mongoStatus ?? "", row.stripeStatus ?? "",
      row.pauseBehavior ?? "", row.resumesAt ?? "", row.lastRealPayment ?? "",
      row.daysSincePaid ?? "", row.heldDrafts ?? "", row.uncollectedCents ?? "",
      row.action ?? "", cell(row.reason),
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
  console.log(`\n=== reconcile-stale-active-subscriptions ${DRY_RUN ? "(DRY RUN — no writes)" : "(LIVE)"} ===`);
  console.log(`env=${ENV_FILE}  staleDays=${STALE_DAYS}\n`);
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is not set");

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: "2025-08-27.basil" as Stripe.LatestApiVersion,
  });
  await connectDB();
  const db = mongoose.connection.db;
  if (!db) throw new Error("No mongoose connection");
  const users = db.collection("users");
  const events = db.collection("paymentevents");

  // Candidate set is driven by "active but not paying", NOT by charge-job history — a member
  // stuck on a paused subscription may never have produced an InvoiceChargeLog row at all.
  const query: Record<string, unknown> = {
    "subscription.status": "active",
    stripeSubscriptionId: { $exists: true, $ne: null },
  };
  if (ONLY_EMAIL) query.email = ONLY_EMAIL;
  const actives = await users
    .find(query)
    .project({ _id: 1, email: 1, subscription: 1, stripeSubscriptionId: 1 })
    .toArray();
  console.log(`active members with a Stripe subscription: ${actives.length}`);

  // One aggregation for last real payment per user, rather than a query per member.
  const lastPaidByUser = new Map<string, Date>();
  for (const row of await events
    .aggregate([
      { $match: { userId: { $in: actives.map((u) => u._id) }, eventType: { $in: PAID_EVENTS } } },
      { $group: { _id: "$userId", last: { $max: "$timestamp" } } },
    ])
    .toArray()) {
    lastPaidByUser.set(String(row._id), row.last as Date);
  }

  const cutoff = Date.now() - STALE_DAYS * 86400000;
  const candidates = actives.filter((u) => {
    const last = lastPaidByUser.get(String(u._id));
    return !last || new Date(last).getTime() < cutoff;
  });
  const total = Math.min(candidates.length, LIMIT);
  console.log(`of those, no real payment in ${STALE_DAYS}d: ${candidates.length}  → examining ${total}\n`);
  if (total === 0) {
    console.log("Nothing to examine.");
    await mongoose.disconnect();
    return;
  }

  const started = Date.now();
  const progressEvery = Math.max(1, Math.floor(total / 20));
  let processed = 0, repaired = 0, stuckPaused = 0, genuinelyActive = 0, errors = 0;
  let stuckUncollectedCents = 0;
  const stuckRows: Array<Record<string, unknown>> = [];

  for (const u of candidates.slice(0, total)) {
    processed++;
    const email = String(u.email ?? "");
    const sub = (u as { subscription?: Record<string, unknown> }).subscription ?? {};
    const mongoStatus = String(sub.status ?? "");
    const subId = String((u as { stripeSubscriptionId?: string }).stripeSubscriptionId ?? "");
    const lastPaid = lastPaidByUser.get(String(u._id));
    const lastRealPayment = lastPaid ? new Date(lastPaid).toISOString().slice(0, 10) : "never";
    const daysSincePaid = lastPaid
      ? Math.floor((Date.now() - new Date(lastPaid).getTime()) / 86400000)
      : "";

    try {
      const s = await stripe.subscriptions.retrieve(subId);
      const pause = s.pause_collection ?? null;
      const base = {
        email, userId: u._id, subscriptionId: subId, mongoStatus, stripeStatus: s.status,
        pauseBehavior: pause?.behavior ?? "", resumesAt: pause?.resumes_at ?? "",
        lastRealPayment, daysSincePaid,
      };

      if (DELINQUENT.has(s.status) && s.status !== mongoStatus) {
        // Shape A — genuine Mongo/Stripe drift. Repairable.
        repaired++;
        console.log(`  ${DRY_RUN ? "WOULD FIX " : "FIXING   "} [drift] ${email.padEnd(32)} mongo=${mongoStatus} → stripe=${s.status}`);
        if (!DRY_RUN) {
          const set: Record<string, unknown> = {
            "subscription.status": s.status,
            "subscription.isActive": false,
          };
          if (sub.pastDueAt == null && (s.status === "past_due" || s.status === "unpaid")) {
            set["subscription.pastDueAt"] = new Date();
          }
          await users.updateOne({ _id: u._id, "subscription.status": "active" }, { $set: set });
        }
        audit({ ...base, shape: "A-drift", action: DRY_RUN ? "would-fix" : "fixed", reason: `Mongo active; Stripe ${s.status}` });
      } else if (pause && pause.resumes_at == null) {
        // Shape B — indefinite collection pause. REPORT ONLY.
        stuckPaused++;
        const drafts = await stripe.invoices.list({ subscription: subId, status: "draft", limit: 100 });
        const open = await stripe.invoices.list({ subscription: subId, status: "open", limit: 100 });
        const uncollected =
          drafts.data.reduce((n, i) => n + (i.amount_due ?? 0), 0) +
          open.data.reduce((n, i) => n + (i.amount_remaining ?? 0), 0);
        stuckUncollectedCents += uncollected;
        const row = {
          ...base, shape: "B-stuck-pause", heldDrafts: drafts.data.length,
          uncollectedCents: uncollected, action: "report-only",
          reason: `pause_collection ${pause.behavior} with resumes_at null — never lifted`,
        };
        stuckRows.push(row);
        audit(row);
        console.log(
          `  STUCK PAUSE  ${email.padEnd(32)} lastPaid=${lastRealPayment} (${daysSincePaid}d)  drafts=${drafts.data.length}  uncollected=$${(uncollected / 100).toFixed(2)}`
        );
      } else {
        genuinelyActive++;
        audit({ ...base, shape: "-", action: "skip", reason: `Stripe ${s.status}, no indefinite pause — leaving alone` });
      }
    } catch (err) {
      errors++;
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ERROR ${email}: ${msg}`);
      audit({ email, userId: u._id, subscriptionId: subId, mongoStatus, shape: "-", action: "error", reason: msg });
    }

    if (processed % progressEvery === 0 || processed === total) {
      const elapsed = Date.now() - started;
      console.log(
        `  … ${processed}/${total} (${Math.round((processed / total) * 100)}%) · ${(processed / (elapsed / 1000)).toFixed(1)}/s · ETA ${fmtEta(elapsed / processed, total - processed)}`
      );
    }
  }

  console.log(`\n=== Summary ${DRY_RUN ? "(DRY RUN)" : "(LIVE)"} ===`);
  console.log(`  examined                     : ${processed}`);
  console.log(`  [A] status drift ${DRY_RUN ? "would repair" : "repaired    "}: ${repaired}`);
  console.log(`  [B] stuck collection pause   : ${stuckPaused}   (REPORT ONLY — never auto-fixed)`);
  console.log(`  genuinely active             : ${genuinelyActive}`);
  console.log(`  errors                       : ${errors}`);
  console.log(`  audit log                    : ${AUDIT}`);

  if (stuckRows.length > 0) {
    console.log(`\n  Uncollected across stuck-paused members: $${(stuckUncollectedCents / 100).toFixed(2)}`);
    console.log(`  These are NOT auto-fixed: unpausing charges the card and moves the billing anchor.`);
    console.log(`  Act on them via the admin Recover Stranded panel / per-user Charge.`);
  }

  await mongoose.disconnect();
  if (errors > 0) process.exit(2);
}

main().catch((err) => {
  console.error("\nFATAL:", err);
  process.exit(1);
});
