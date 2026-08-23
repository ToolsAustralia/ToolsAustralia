#!/usr/bin/env npx tsx

/**
 * Backfill membership renewals that were CHARGED but granted NOTHING.
 *
 * ## The failure mode (RC-1 / RC-2 of the 2026-08-24 renewal-surge incident)
 *
 * `handleInvoicePaymentSucceeded` wraps its whole body in one `try`. When a Stripe
 * call inside it throws (on 2026-08-23 that was HTTP 429 from the anchor-24 renewal
 * burst), the outer catch swallows the error and the handler **returns normally**.
 * The dispatcher then reaches `shouldMarkAsProcessed = true`, `processQueuedEvent`
 * acks `ProcessedStripeEvent` and calls `markSucceeded`. The member's card was
 * charged, `MembershipRenewalCycle` says `succeeded` — and `processPaymentBenefits`
 * never ran, so there is **no `PaymentEvent` at all**.
 *
 * ## Why nothing else can fix it
 *
 * - **Replaying the Stripe webhook fails.** `ProcessedStripeEvent.eventId` is unique
 *   and was already written. That ack IS the bug.
 * - **`scripts/fix-major-draw-renewal-entries.ts` fails.** It starts FROM
 *   `BenefitsGranted` `PaymentEvent` rows and heals ones with empty `drawGrants`.
 *   These renewals have no `PaymentEvent` to start from.
 * - **`reconcile-major-draw-entries` fails** for the same reason (RC-2).
 *
 * ## Detection — TWO passes, because the Mongo join alone has a blind spot
 *
 * **Pass 1 (Mongo, authoritative for what it can see):**
 *
 *   MembershipRenewalCycle { createdAt >= --since, status: "succeeded",
 *                            billingReason: "subscription_cycle" }
 *     LEFT JOIN PaymentEvent on _id === `BenefitsGranted-invoice_${stripeInvoiceId}`
 *     WHERE the PaymentEvent is absent
 *
 * **Pass 2 (Stripe, catches what pass 1 structurally cannot).** The
 * `MembershipRenewalCycle` row is written by the SAME handler that failed
 * (`index.ts:3614`), and only **after** the first Stripe call (`index.ts:3474`). A 429
 * on that first call leaves NO cycle row, NO PaymentEvent and NO trace in Mongo at
 * all — pass 1 cannot see it. `upsertRenewalCycleFromPaidInvoice` also returns early
 * unless `billing_reason === "subscription_cycle"`
 * (`membershipAnalyticsPersistence.ts:43`), so a lost grant on a
 * `subscription_create` / `subscription_update` invoice in the same burst is equally
 * invisible. Pass 2 therefore lists **paid Stripe invoices** in the window and checks
 * each against `PaymentEvent`, which is the only anchor that cannot lie by omission.
 * It is a REPORT ONLY — non-`subscription_cycle` invoices have different entry maths
 * (promo multiplier, resubscribe) and are never granted by this script.
 *
 * ## SAFETY
 *
 * - **DRY-RUN BY DEFAULT**, and `--dry-run` **always beats** `--apply` when both are
 *   present (the `:prod` npm entry already carries `--apply`, so an operator appending
 *   `--dry-run` out of muscle memory must get a dry run, never a live write).
 * - **`--apply` REQUIRES an explicit `--expect=N`** and refuses to write unless the
 *   derived gap set is exactly N rows.
 * - **Lifecycle pre-flight.** `processPaymentBenefits` → `grantBenefits` →
 *   `handleSubscriptionPackage` (`payment-processing.ts:1926-1942`) unconditionally
 *   `$set`s `subscription.isActive: true` / `status: "active"` and `$unset`s
 *   `cancelledAt`. Harmless at charge time; NOT harmless days later — it would erase a
 *   cancellation a member made after being charged and getting nothing, while Stripe
 *   still holds `cancel_at_period_end`. Apply REFUSES (exit 3) if any target is
 *   cancelled / paused / inactive / `autoRenew: false`, unless
 *   `--allow-lifecycle-change` is passed.
 * - **Idempotent.** `PaymentEvent._id` is deterministic
 *   (`BenefitsGranted-invoice_<invoiceId>`); each row is re-checked against a fresh
 *   read immediately before granting.
 * - **The ORIGINAL charge timestamp is passed, never `now`.** `getTargetMajorDraw`
 *   routes on `paymentMetadata.created` (`payment-processing.ts:2226-2229` →
 *   `wasPaymentBeforeFreeze`, which reads it as **milliseconds**). A `now` timestamp
 *   would credit the NEXT month's draw and defeat the whole point of the backfill.
 * - **Tier guard.** A row is skipped unless the resolved package price matches the
 *   amount actually paid, so a mid-cycle tier change cannot grant the wrong tier.
 * - **CSV audit log** written with `appendFileSync` — one row on disk before the next
 *   row is touched, so a crash or a `process.exit` cannot lose the trail.
 *
 * ## What `--apply` does
 *
 * Grants through the normal path (`processPaymentBenefits`) so the `PaymentEvent`,
 * `accumulatedEntries`, `rewardsPoints`, partner-discount queue and major-draw credit
 * are created exactly as the webhook would have, then sets
 * `subscription.lastMonthAccumulatedEntries` the way `handleInvoicePaymentSucceeded`
 * does after a successful grant (`index.ts:4636-4656`) — without it the NEXT renewal
 * accumulates from a stale baseline and under-grants.
 *
 * **Partial-failure warning.** `processPaymentBenefits` creates the `PaymentEvent`
 * BEFORE `grantBenefits` and does not remove it if `grantBenefits` throws. A row that
 * dies inside `addToMajorDraw` therefore ends with entries `$inc`ed, a
 * `BenefitsGranted` row present, possibly NO draw entries, and
 * `lastMonthAccumulatedEntries` not updated — and a re-run of this script would then
 * report it as healthy. **After any apply, grep the CSV for `,error,`**; the summary
 * says so and the exit code is non-zero whenever a row errored.
 *
 * It does **not** write the affiliate *recurring* commission (a separate handler step,
 * skipped by the same abort); use `npm run backfill:affiliate-recurring-commissions:all:dry`.
 *
 * ## Usage
 *
 *   npm run backfill:missing-renewal-grants:dry                   # local/dev DB, report only
 *   npm run backfill:missing-renewal-grants:prod:dry              # PRODUCTION, report only
 *   npm run backfill:missing-renewal-grants:prod -- --expect=11   # PRODUCTION, WRITES
 *
 * Options:
 *   --apply                    Perform writes. Requires --expect=N. Overridden by --dry-run.
 *   --dry-run                  Force a dry run. Always wins over --apply.
 *   --production               Read env from `.env.production` (default: `.env.local`) and
 *                              force the database name to `Production` (`PROD_DB_NAME` to
 *                              override) — the prod Atlas string may carry no `/<db>` path,
 *                              and a bare connect silently lands on an empty `test` DB.
 *   --since=<ISO>              Detection window start (default: 2026-08-23T13:00:00Z).
 *   --expect=N                 Refuse to apply unless exactly N gaps were derived.
 *   --allow-lifecycle-change   Grant even to members who cancelled/paused since the charge.
 *   --no-stripe-check          Skip the Stripe-side pass-2 reconciliation.
 *   --limit=N                  Process at most N gaps (planning aid).
 *   --csv-path=PATH            Override the CSV audit path.
 *   --no-csv                   Disable the CSV audit log (not recommended).
 *
 * Exit codes: 0 = clean · 2 = gaps found in dry-run, or per-row errors/skips/abort in
 * apply · 3 = fatal, or a guard refused to run · 1 = unhandled error.
 *
 * @module scripts/backfill-missing-renewal-grants
 */

import { config } from "dotenv";
import * as fs from "fs";
import path from "path";
import { injectDbName } from "./connect-ops-db";

const IS_PRODUCTION = process.argv.includes("--production");
const ENV_FILE = IS_PRODUCTION ? ".env.production" : ".env.local";
config({ path: path.resolve(process.cwd(), ENV_FILE), override: true });

function parseArg(name: string): string | undefined {
  const raw = process.argv.find((a) => a.startsWith(`--${name}=`));
  return raw ? raw.split("=").slice(1).join("=") : undefined;
}

const APPLY_FLAG = process.argv.includes("--apply");
const DRY_RUN_FLAG = process.argv.includes("--dry-run");
/**
 * `--dry-run` ALWAYS beats `--apply`. The `…:prod` npm entry already carries
 * `--apply`, so `npm run …:prod -- --dry-run` — the exact thing muscle memory types —
 * must NOT write. The reference ops script makes `--dry-run` THE safety flag; honouring
 * it only when `--apply` is absent would make it a decoration on the one command where
 * it matters most.
 */
const APPLY = APPLY_FLAG && !DRY_RUN_FLAG;
const APPLY_OVERRIDDEN_BY_DRY_RUN = APPLY_FLAG && DRY_RUN_FLAG;
const ALLOW_LIFECYCLE_CHANGE = process.argv.includes("--allow-lifecycle-change");
const SKIP_STRIPE_CHECK = process.argv.includes("--no-stripe-check");
const NO_CSV = process.argv.includes("--no-csv");

const SINCE_RAW = parseArg("since") ?? "2026-08-23T13:00:00Z";
const SINCE = new Date(SINCE_RAW);
const EXPECT_RAW = parseArg("expect");
const EXPECT = EXPECT_RAW !== undefined ? Number(EXPECT_RAW) : null;
const LIMIT_RAW = parseArg("limit");
const LIMIT = LIMIT_RAW === undefined ? Infinity : Number(LIMIT_RAW);
const CSV_PATH =
  parseArg("csv-path") ??
  path.resolve(
    process.cwd(),
    "temp",
    `backfill-missing-renewal-grants-${APPLY ? "apply" : "dry"}-${new Date()
      .toISOString()
      .replace(/[:.]/g, "-")}.csv`,
  );

const SYDNEY_TZ = "Australia/Sydney";

/** Lifecycle states it is safe to re-grant into days after the charge. */
const SAFE_STATUSES = new Set(["active", "trialing"]);

/** Escape one CSV cell: quote when it contains a delimiter, quote or newline. */
function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s: string;
  if (value instanceof Error) s = value.message;
  else if (typeof value === "object") {
    try {
      s = JSON.stringify(value);
    } catch {
      s = String(value);
    }
  } else {
    s = String(value);
  }
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

// ── CSV audit log ─────────────────────────────────────────────────────────────
// appendFileSync, not a WriteStream: the row is on disk before the next row is
// touched, so neither a crash nor a `process.exit` in an error path can lose it.
let csvEnabled = !NO_CSV;

const CSV_HEADER =
  "timestamp,mode,invoice_id,user_id,email,package_id,package_name,amount_paid,charged_at_utc," +
  "entries_to_grant,new_last_month_accumulated,before_freeze,sub_status,cancelled_at,auto_renew,outcome,detail\n";

type RowOutcome = "granted" | "already-granted" | "planned" | "skipped" | "error" | "lifecycle-blocked";

type CsvRow = {
  invoice_id: string;
  user_id: string;
  email?: string;
  package_id?: string;
  package_name?: string;
  amount_paid?: string;
  charged_at_utc?: string;
  entries_to_grant?: number | string;
  new_last_month_accumulated?: number | string;
  before_freeze?: boolean | string;
  sub_status?: string;
  cancelled_at?: string;
  auto_renew?: boolean | string;
  outcome: RowOutcome;
  detail?: unknown;
};

function csvInit(): void {
  if (!csvEnabled) return;
  try {
    fs.mkdirSync(path.dirname(CSV_PATH), { recursive: true });
    if (!fs.existsSync(CSV_PATH) || fs.statSync(CSV_PATH).size === 0) {
      fs.appendFileSync(CSV_PATH, CSV_HEADER);
    }
  } catch (err) {
    console.error(
      `⚠️ Failed to open CSV at ${CSV_PATH}: ${err instanceof Error ? err.message : String(err)}\n   Continuing with terminal log only.`,
    );
    csvEnabled = false;
  }
}

/** Write one audit row. Never throws — an audit failure must not break the run. */
function csvWrite(row: CsvRow): void {
  if (!csvEnabled) return;
  try {
    const line =
      [
        new Date().toISOString(),
        APPLY ? "apply" : "dry-run",
        row.invoice_id,
        row.user_id,
        row.email ?? "",
        row.package_id ?? "",
        row.package_name ?? "",
        row.amount_paid ?? "",
        row.charged_at_utc ?? "",
        row.entries_to_grant ?? "",
        row.new_last_month_accumulated ?? "",
        row.before_freeze ?? "",
        row.sub_status ?? "",
        row.cancelled_at ?? "",
        row.auto_renew ?? "",
        row.outcome,
        row.detail ?? "",
      ]
        .map(csvEscape)
        .join(",") + "\n";
    fs.appendFileSync(CSV_PATH, line);
  } catch {
    // never let an audit-log failure break the run
  }
}

type GapRow = {
  stripeInvoiceId: string;
  userId: string;
  amountPaidCents: number;
  chargedAt: Date;
};

type LeanUser = {
  _id: unknown;
  email?: string;
  accumulatedEntries?: number;
  subscription?: {
    packageId?: string;
    lastMonthAccumulatedEntries?: number;
    isActive?: boolean;
    autoRenew?: boolean;
    status?: string;
    cancelledAt?: Date;
    pausedFrom?: Date;
    pausedUntil?: Date;
  };
};

/** Why a member is unsafe to grant to now, or null when they are safe. */
function lifecycleBlockReason(u: LeanUser | undefined): string | null {
  if (!u) return "user not found";
  const s = u.subscription;
  if (!s) return "no subscription object";
  if (s.cancelledAt) return `cancelledAt=${new Date(s.cancelledAt).toISOString()}`;
  if (s.isActive !== true) return `isActive=${String(s.isActive)}`;
  if (s.autoRenew === false) return "autoRenew=false (cancel at period end)";
  if (s.pausedFrom || s.pausedUntil) return "retention pause window set";
  if (!SAFE_STATUSES.has(String(s.status))) return `status="${String(s.status)}"`;
  return null;
}

async function main(): Promise<void> {
  // ── Argument guards (all before any connection, so a bad invocation writes nothing) ──
  if (APPLY_OVERRIDDEN_BY_DRY_RUN) {
    console.log(
      "\n⚠️  BOTH --apply AND --dry-run were passed. --dry-run WINS: this run will NOT write.\n" +
        "    (The `…:prod` npm entry already carries --apply — append nothing to it when you mean to write.)\n",
    );
  }
  if (!Number.isFinite(SINCE.getTime())) {
    console.error(`❌ --since=${SINCE_RAW} is not a valid date.`);
    process.exit(3);
  }
  if (
    EXPECT_RAW !== undefined &&
    (EXPECT === null || !Number.isInteger(EXPECT) || EXPECT < 0)
  ) {
    console.error(`❌ --expect=${EXPECT_RAW} is not a non-negative integer.`);
    process.exit(3);
  }
  if (LIMIT_RAW !== undefined && (!Number.isInteger(LIMIT) || LIMIT < 1)) {
    console.error(`❌ --limit=${LIMIT_RAW} is not a positive integer.`);
    process.exit(3);
  }
  if (APPLY && EXPECT === null) {
    console.error(
      "❌ --apply requires an explicit --expect=N.\n" +
        "   Run the dry run first, confirm the count, then re-run with that number:\n" +
        "     npm run backfill:missing-renewal-grants:prod -- --expect=<count>",
    );
    process.exit(3);
  }

  // The prod Atlas string may carry no `/<dbName>` path — a bare connect would
  // silently land on an empty `test` DB and report zero gaps. Force it, exactly as
  // scripts/connect-ops-db.ts does for every other prod-targeting ops script.
  if (IS_PRODUCTION) {
    if (!process.env.MONGODB_URI) {
      console.error(`❌ MONGODB_URI is not set in ${ENV_FILE}.`);
      process.exit(3);
    }
    process.env.MONGODB_URI = injectDbName(process.env.MONGODB_URI, process.env.PROD_DB_NAME || "Production");
  }
  if (!process.env.MONGODB_URI) {
    console.error(`❌ MONGODB_URI is not set in ${ENV_FILE}.`);
    process.exit(3);
  }

  // Lazy imports so dotenv has already populated process.env when the app modules
  // (membership packages read Stripe ids at module scope, mongodb reads the URI)
  // are evaluated.
  const mongoose = (await import("mongoose")).default;
  const connectDB = (await import("../src/lib/mongodb")).default;
  const MembershipRenewalCycle = (await import("../src/models/MembershipRenewalCycle")).default;
  const PaymentEvent = (await import("../src/models/PaymentEvent")).default;
  const MajorDraw = (await import("../src/models/MajorDraw")).default;
  const User = (await import("../src/models/User")).default;
  const { getPackageById } = await import("../src/data/membershipPackages");
  const { calculateSubscriptionEntries } = await import("../src/utils/payment/subscription-entries-calculator");
  const { wasPaymentBeforeFreeze } = await import("../src/utils/common/timezone");
  const { formatInTimeZone } = await import("date-fns-tz");

  await connectDB();

  const dbName = mongoose.connection.db?.databaseName ?? "(unknown)";
  const uri = process.env.MONGODB_URI ?? "";
  const at = uri.indexOf("@");
  const host = at >= 0 ? uri.slice(at + 1).split("/")[0].split("?")[0] : "(host?)";

  csvInit();

  console.log("\nBackfill renewals charged without granting entries");
  console.log("==================================================");
  console.log(`  Mode:        ${APPLY ? "🔴 APPLY (LIVE WRITES)" : "🟢 DRY RUN (no writes)"}`);
  console.log(`  Target:      ${IS_PRODUCTION ? "PRODUCTION" : "local/dev"} · db="${dbName}" @ ${host}`);
  console.log(`  Env file:    ${ENV_FILE}`);
  console.log(`  Since:       ${SINCE.toISOString()}`);
  console.log(`  Expect:      ${EXPECT === null ? "<not asserted>" : `${EXPECT} gaps`}`);
  console.log(`  Limit:       ${LIMIT === Infinity ? "no limit" : LIMIT}`);
  console.log(
    `  Lifecycle:   ${ALLOW_LIFECYCLE_CHANGE ? "⚠️ --allow-lifecycle-change (cancelled members WILL be granted)" : "enforced (cancelled/paused members block the apply)"}`,
  );
  console.log(`  CSV log:     ${csvEnabled ? CSV_PATH : "DISABLED"}`);
  if (IS_PRODUCTION && APPLY) {
    console.log("  ⚠️  Targeting PRODUCTION with WRITES. Ctrl-C now if this was not intended.");
  }
  console.log("");

  const startMs = Date.now();
  let granted = 0;
  let alreadyGranted = 0;
  let planned = 0;
  let skipped = 0;
  let errored = 0;
  let entriesTotal = 0;
  let aborted = false;
  let outerError: unknown = null;
  let guardFailed = false;
  let gaps: GapRow[] = [];
  let stripeOnlyGaps: string[] = [];

  const sigintHandler = () => {
    console.log("\n⚠️ SIGINT received — finishing the current row then exiting cleanly...");
    aborted = true;
  };
  process.on("SIGINT", sigintHandler);

  try {
    // ── PASS 1: the Mongo RC-2 join ────────────────────────────────────────────
    const cycleFilter = {
      createdAt: { $gte: SINCE },
      status: "succeeded",
      billingReason: "subscription_cycle",
    } as const;

    const scannedTotal = await MembershipRenewalCycle.countDocuments(cycleFilter);
    console.log(`Scanning succeeded subscription_cycle renewals since ${SINCE.toISOString()}…`);
    console.log(`TOTAL renewals in window: ${scannedTotal}`);

    const cycles = await MembershipRenewalCycle.find(cycleFilter, {
      stripeInvoiceId: 1,
      userId: 1,
      amountPaidCents: 1,
      succeededAt: 1,
      createdAt: 1,
    })
      .sort({ createdAt: 1 })
      .lean();

    const grantedIds = new Set(
      (
        await PaymentEvent.find(
          { _id: { $in: cycles.map((c) => `BenefitsGranted-invoice_${c.stripeInvoiceId}`) } },
          { _id: 1 },
        ).lean()
      ).map((d) => String(d._id)),
    );

    gaps = cycles
      .filter((c) => !grantedIds.has(`BenefitsGranted-invoice_${c.stripeInvoiceId}`))
      .map((c) => ({
        stripeInvoiceId: c.stripeInvoiceId,
        userId: String(c.userId),
        amountPaidCents: c.amountPaidCents ?? 0,
        // The ORIGINAL charge moment. Never `new Date()` — draw routing keys off it.
        chargedAt: c.succeededAt ?? c.createdAt,
      }));

    const gapCentsPass1 = gaps.reduce((sum, g) => sum + g.amountPaidCents, 0);
    console.log(`TOTAL renewals missing a grant: ${gaps.length}`);
    console.log(`Collected without grant: ${money(gapCentsPass1)}\n`);

    // ── PASS 2: Stripe-anchored reconciliation (the join's blind spot) ─────────
    console.log("Blind spot of the Mongo join — why pass 2 exists");
    console.log("------------------------------------------------");
    console.log("  MembershipRenewalCycle is written by the SAME handler that failed, AFTER its first");
    console.log("  Stripe call. A 429 on that call leaves no cycle row at all — invisible to pass 1. The");
    console.log("  cycle row is also only written for billing_reason=subscription_cycle, so a lost grant");
    console.log("  on a subscription_create/update invoice is invisible too.");
    const cycleInvoiceIds = new Set(cycles.map((c) => c.stripeInvoiceId));
    if (SKIP_STRIPE_CHECK) {
      console.log("  ⚠️ --no-stripe-check: pass 2 SKIPPED. The count above may UNDERSTATE the damage.\n");
    } else if (!process.env.STRIPE_SECRET_KEY) {
      console.log(
        `  ⚠️ STRIPE_SECRET_KEY absent from ${ENV_FILE}: pass 2 SKIPPED. The count above may UNDERSTATE the damage.\n`,
      );
    } else {
      const Stripe = (await import("stripe")).default;
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
      const byReason = new Map<string, number>();
      const paidSubInvoices: Array<{ id: string; reason: string; amount: number }> = [];
      let listed = 0;
      process.stdout.write("  Listing paid Stripe invoices in the window… ");
      for await (const inv of stripe.invoices.list({
        status: "paid",
        created: { gte: Math.floor(SINCE.getTime() / 1000) },
        limit: 100,
      })) {
        listed++;
        if (listed % 200 === 0) process.stdout.write(`${listed}… `);
        const reason = inv.billing_reason ?? "unknown";
        if (!reason.startsWith("subscription")) continue;
        // $0 trial invoices legitimately grant nothing (isZeroAmountTrialUpdateInvoice).
        if ((inv.amount_paid ?? 0) <= 0) continue;
        if (!inv.id) continue;
        byReason.set(reason, (byReason.get(reason) ?? 0) + 1);
        paidSubInvoices.push({ id: inv.id, reason, amount: inv.amount_paid ?? 0 });
      }
      console.log(`${listed} listed, ${paidSubInvoices.length} paid subscription invoices.`);

      const stripeGrantedIds = new Set(
        (
          await PaymentEvent.find(
            { _id: { $in: paidSubInvoices.map((i) => `BenefitsGranted-invoice_${i.id}`) } },
            { _id: 1 },
          ).lean()
        ).map((d) => String(d._id)),
      );
      const stripeUngranted = paidSubInvoices.filter(
        (i) => !stripeGrantedIds.has(`BenefitsGranted-invoice_${i.id}`),
      );
      stripeOnlyGaps = stripeUngranted.filter((i) => !cycleInvoiceIds.has(i.id)).map((i) => i.id);

      for (const [reason, count] of [...byReason.entries()].sort()) {
        console.log(`    ${reason.padEnd(24)} ${count}`);
      }
      console.log(`  Stripe paid subscription invoices with NO BenefitsGranted: ${stripeUngranted.length}`);
      console.log(
        `  …of which have NO MembershipRenewalCycle row (invisible to pass 1): ${stripeOnlyGaps.length}`,
      );
      if (stripeOnlyGaps.length > 0) {
        console.log("  🚨 ADDITIONAL AFFECTED INVOICES — this script does NOT grant these:");
        for (const id of stripeOnlyGaps) {
          const inv = stripeUngranted.find((i) => i.id === id)!;
          console.log(`      ${id}  ${money(inv.amount)}  billing_reason=${inv.reason}  — needs manual review`);
        }
      }
      console.log("");
    }

    // ── Guard: the derived set must be exactly what was reviewed ───────────────
    if (EXPECT !== null && gaps.length !== EXPECT) {
      console.error(
        `\n🚨 GUARD: --expect=${EXPECT} but the join derived ${gaps.length}. Refusing to continue.\n` +
          `   The detection query is wrong, or the gap set moved. Granting on a wrong set is unsafe.`,
      );
      guardFailed = true;
      throw new Error("expect-guard-failed");
    }

    // ── Lifecycle pre-flight (see the SAFETY block) ────────────────────────────
    const userDocs = (await User.find(
      { _id: { $in: gaps.map((g) => new mongoose.Types.ObjectId(g.userId)) } },
      {
        email: 1,
        accumulatedEntries: 1,
        "subscription.packageId": 1,
        "subscription.lastMonthAccumulatedEntries": 1,
        "subscription.isActive": 1,
        "subscription.autoRenew": 1,
        "subscription.status": 1,
        "subscription.cancelledAt": 1,
        "subscription.pausedFrom": 1,
        "subscription.pausedUntil": 1,
      },
    ).lean()) as unknown as LeanUser[];
    const usersById = new Map(userDocs.map((u) => [String(u._id), u]));

    console.log("Lifecycle pre-flight — grantBenefits force-reactivates a subscription (see docblock)");
    console.log("-----------------------------------------------------------------------------------");
    const blocked: Array<{ gap: GapRow; reason: string }> = [];
    for (const gap of gaps) {
      const u = usersById.get(gap.userId);
      const reason = lifecycleBlockReason(u);
      const s = u?.subscription;
      console.log(
        `  ${gap.stripeInvoiceId}  ${(u?.email ?? "<user not found>").padEnd(38)} ` +
          `status=${String(s?.status ?? "—").padEnd(10)} isActive=${String(s?.isActive ?? "—").padEnd(5)} ` +
          `autoRenew=${String(s?.autoRenew ?? "—").padEnd(5)} ` +
          `cancelledAt=${s?.cancelledAt ? new Date(s.cancelledAt).toISOString() : "—"}` +
          (reason ? `  ⛔ ${reason}` : "  ✅ safe"),
      );
      if (reason) blocked.push({ gap, reason });
    }
    console.log(
      blocked.length === 0
        ? "  ✅ All targets are active and un-cancelled — granting cannot resurrect a cancellation.\n"
        : `  ⛔ ${blocked.length} of ${gaps.length} would have a cancellation/pause ERASED by the grant.\n`,
    );

    if (blocked.length > 0 && APPLY && !ALLOW_LIFECYCLE_CHANGE) {
      for (const b of blocked) {
        const u = usersById.get(b.gap.userId);
        csvWrite({
          invoice_id: b.gap.stripeInvoiceId,
          user_id: b.gap.userId,
          email: u?.email,
          amount_paid: money(b.gap.amountPaidCents),
          charged_at_utc: b.gap.chargedAt.toISOString(),
          sub_status: u?.subscription?.status,
          cancelled_at: u?.subscription?.cancelledAt ? new Date(u.subscription.cancelledAt).toISOString() : "",
          auto_renew: u?.subscription?.autoRenew,
          outcome: "lifecycle-blocked",
          detail: b.reason,
        });
      }
      console.error(
        `🚨 GUARD: ${blocked.length} target(s) cancelled/paused since the charge. Refusing to apply.\n` +
          `   grantBenefits would $set isActive:true / status:"active" and $unset cancelledAt, erasing that\n` +
          `   decision in Mongo while Stripe still holds cancel_at_period_end.\n` +
          `   Credit those members by hand, or re-run with --allow-lifecycle-change if that is genuinely intended.`,
      );
      guardFailed = true;
      throw new Error("lifecycle-guard-failed");
    }

    // ── Freeze context — will these land in the CURRENT draw? (read-only) ──────
    const currentDraw = await MajorDraw.findOne({ status: { $in: ["active", "frozen"] } })
      .sort({ activationDate: -1 })
      .select("name status activationDate freezeEntriesAt drawDate")
      .lean<{
        name: string;
        status: string;
        activationDate?: Date;
        freezeEntriesAt?: Date;
        drawDate?: Date;
      } | null>();
    if (currentDraw) {
      const fmt = (d: unknown) =>
        d ? formatInTimeZone(new Date(d as Date), SYDNEY_TZ, "yyyy-MM-dd HH:mm zzz") : "—";
      console.log(
        `Current major draw: ${String(currentDraw.name)} (${String(currentDraw.status)}) · freeze=${fmt(
          currentDraw.freezeEntriesAt,
        )} · draw=${fmt(currentDraw.drawDate)}`,
      );
    } else {
      console.log("⚠️ No active/frozen major draw found — grants would route to the next queued draw.");
    }
    console.log("");

    const work = LIMIT === Infinity ? gaps : gaps.slice(0, LIMIT);
    // ~20 progress lines regardless of run size, so even an 11-row run visibly moves.
    const progressEvery = Math.max(1, Math.ceil(work.length / 20));

    for (let i = 0; i < work.length; i++) {
      if (aborted) break;
      const gap = work[i];
      const invoicePaymentId = `invoice_${gap.stripeInvoiceId}`;
      const chargedAtUtc = gap.chargedAt.toISOString();

      try {
        const user = usersById.get(gap.userId);
        if (!user) {
          skipped++;
          csvWrite({
            invoice_id: gap.stripeInvoiceId,
            user_id: gap.userId,
            amount_paid: money(gap.amountPaidCents),
            charged_at_utc: chargedAtUtc,
            outcome: "skipped",
            detail: "user not found",
          });
          console.error(`  ⏭️  ${gap.stripeInvoiceId} — user ${gap.userId} not found`);
          continue;
        }

        const packageId = user.subscription?.packageId;
        const membershipPackage = packageId ? getPackageById(packageId) : undefined;
        if (!packageId || !membershipPackage) {
          skipped++;
          csvWrite({
            invoice_id: gap.stripeInvoiceId,
            user_id: gap.userId,
            email: user.email,
            package_id: packageId ?? "",
            amount_paid: money(gap.amountPaidCents),
            charged_at_utc: chargedAtUtc,
            outcome: "skipped",
            detail: `unresolvable package "${packageId ?? "<none>"}"`,
          });
          console.error(`  ⏭️  ${gap.stripeInvoiceId} — unresolvable package "${packageId ?? "<none>"}"`);
          continue;
        }

        // TIER GUARD: the resolved package must match what was actually paid, so a
        // mid-cycle tier change can never make us grant the wrong tier's entries.
        const expectedCents = Math.round(membershipPackage.price * 100);
        if (gap.amountPaidCents !== expectedCents) {
          skipped++;
          csvWrite({
            invoice_id: gap.stripeInvoiceId,
            user_id: gap.userId,
            email: user.email,
            package_id: packageId,
            package_name: membershipPackage.name,
            amount_paid: money(gap.amountPaidCents),
            charged_at_utc: chargedAtUtc,
            outcome: "skipped",
            detail: `amount ${money(gap.amountPaidCents)} != ${membershipPackage.name} price ${money(expectedCents)}`,
          });
          console.error(
            `  ⏭️  ${gap.stripeInvoiceId} — paid ${money(gap.amountPaidCents)} but ${membershipPackage.name} is ${money(expectedCents)}; needs manual review`,
          );
          continue;
        }

        // Same maths the webhook runs for a subscription_cycle renewal: no promo
        // multiplier, not a resubscribe, not an upgrade.
        const baseEntries = membershipPackage.entriesPerMonth || 0;
        const previousLastMonthAccumulated = user.subscription?.lastMonthAccumulatedEntries ?? 0;
        const entryCalculation = calculateSubscriptionEntries({
          billingReason: "subscription_cycle",
          baseEntries,
          lastMonthAccumulatedEntries: user.subscription?.lastMonthAccumulatedEntries,
          isResubscribe: false,
          promoMultiplier: 1,
          isUpgrade: false,
          currentAccumulatedEntries: user.accumulatedEntries || 0,
        });
        const entriesToGrant = entryCalculation.entriesToGrant;
        const newLastMonthAccumulatedEntries = entryCalculation.newLastMonthAccumulatedEntries;
        const pointsToGrant = Math.floor(membershipPackage.price);

        const beforeFreeze = currentDraw?.freezeEntriesAt
          ? wasPaymentBeforeFreeze(gap.chargedAt.getTime(), new Date(currentDraw.freezeEntriesAt))
          : null;

        const rowBase = {
          invoice_id: gap.stripeInvoiceId,
          user_id: gap.userId,
          email: user.email,
          package_id: packageId,
          package_name: membershipPackage.name,
          amount_paid: money(gap.amountPaidCents),
          charged_at_utc: chargedAtUtc,
          entries_to_grant: entriesToGrant,
          new_last_month_accumulated: newLastMonthAccumulatedEntries,
          before_freeze: beforeFreeze === null ? "" : beforeFreeze,
          sub_status: user.subscription?.status,
          cancelled_at: user.subscription?.cancelledAt
            ? new Date(user.subscription.cancelledAt).toISOString()
            : "",
          auto_renew: user.subscription?.autoRenew,
        };

        if (!APPLY) {
          planned++;
          entriesTotal += entriesToGrant;
          csvWrite({ ...rowBase, outcome: "planned" });
          console.log(
            `  ${gap.stripeInvoiceId}  ${money(gap.amountPaidCents)}  user=${gap.userId}  ${user.email}  ` +
              `${membershipPackage.name}  +${entriesToGrant} entries  charged=${chargedAtUtc}` +
              (beforeFreeze === null ? "" : `  beforeFreeze=${beforeFreeze ? "yes" : "NO"}`),
          );
        } else {
          // Fresh idempotency re-check immediately before writing — another run (or
          // a Stripe redelivery) may have granted this since the join was computed.
          const existing = await PaymentEvent.exists({ _id: `BenefitsGranted-${invoicePaymentId}` });
          if (existing) {
            alreadyGranted++;
            csvWrite({ ...rowBase, outcome: "already-granted", detail: "PaymentEvent already present" });
            console.log(`  ✅ ${gap.stripeInvoiceId} — already granted, skipping`);
            continue;
          }

          const { processPaymentBenefits } = await import("../src/utils/payment/payment-processing");
          const chargedAtMs = gap.chargedAt.getTime();

          const result = await processPaymentBenefits(
            invoicePaymentId,
            gap.userId,
            {
              packageType: "membership",
              packageId,
              packageName: membershipPackage.name,
              entries: entriesToGrant,
              points: pointsToGrant,
              price: membershipPackage.price,
            },
            "webhook",
            {
              // MILLISECONDS, and the ORIGINAL charge moment — getTargetMajorDraw
              // routes on this, so `now` here would credit next month's draw.
              created: chargedAtMs,
              chargedAt: chargedAtMs,
              type: "subscription",
              packageType: "membership",
            },
            undefined, // no request context for a server-side backfill
            "subscription_cycle",
            undefined, // no session attribution — renewals inherit it, and we have none to invent
            // A renewal never records the membership-FIRST affiliate commission; the
            // recurring one is a separate handler step (see the module docblock).
            { skipMembershipFirstCommission: true },
            false, // not a resubscribe
            {
              lastMonthDelta: newLastMonthAccumulatedEntries - previousLastMonthAccumulated,
              calculationType: entryCalculation.calculationType,
            },
            null, // no edge-resolved attribution available for a backfill
          );

          if (!result.success) {
            errored++;
            csvWrite({ ...rowBase, outcome: "error", detail: result.error ?? result.code ?? "unknown failure" });
            console.error(
              `  ✗ ${gap.stripeInvoiceId} — grant failed: ${result.error ?? result.code ?? "unknown failure"}`,
            );
            continue;
          }

          if (result.alreadyProcessed) {
            alreadyGranted++;
            csvWrite({ ...rowBase, outcome: "already-granted", detail: "processPaymentBenefits: alreadyProcessed" });
            console.log(`  ✅ ${gap.stripeInvoiceId} — already processed, skipping`);
            continue;
          }

          // The webhook sets this AFTER a successful grant (index.ts:4636-4656).
          // processPaymentBenefits does not — and without it the NEXT renewal
          // accumulates from a stale baseline and under-grants.
          await User.findByIdAndUpdate(gap.userId, {
            $set: { "subscription.lastMonthAccumulatedEntries": newLastMonthAccumulatedEntries },
          });

          granted++;
          entriesTotal += entriesToGrant;
          csvWrite({ ...rowBase, outcome: "granted" });
          console.log(
            `  ✔ ${gap.stripeInvoiceId}  ${money(gap.amountPaidCents)}  ${user.email}  ` +
              `${membershipPackage.name}  +${entriesToGrant} entries  lastMonthAccumulated→${newLastMonthAccumulatedEntries}`,
          );
        }
      } catch (rowErr) {
        // PER-ROW error: record it and keep going — one bad row must not strand the rest.
        errored++;
        const msg = rowErr instanceof Error ? rowErr.message : String(rowErr);
        csvWrite({
          invoice_id: gap.stripeInvoiceId,
          user_id: gap.userId,
          amount_paid: money(gap.amountPaidCents),
          charged_at_utc: chargedAtUtc,
          outcome: "error",
          detail: msg,
        });
        console.error(`  ✗ ${gap.stripeInvoiceId} — ${msg}`);
      }

      const processed = i + 1;
      if (processed % progressEvery === 0 || processed === work.length) {
        const elapsed = Date.now() - startMs;
        const rate = processed / Math.max(elapsed / 1000, 0.001);
        const remaining = work.length - processed;
        const etaMs = rate > 0 ? (remaining / rate) * 1000 : 0;
        console.log(
          `  … ${processed}/${work.length} (${Math.round((processed / work.length) * 100)}%) · ` +
            `${rate.toFixed(1)}/sec · elapsed ${formatDuration(elapsed)} · ETA ${formatDuration(etaMs)}`,
        );
      }
    }
  } catch (err) {
    outerError = err;
    if (!guardFailed) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`\n🚨 Outer error after ${granted + planned + skipped + errored} rows: ${msg}`);
    }
  } finally {
    process.removeListener("SIGINT", sigintHandler);
  }

  // ── Final summary ────────────────────────────────────────────────────────────
  const elapsedTotal = Date.now() - startMs;
  const gapCents = gaps.reduce((sum, g) => sum + g.amountPaidCents, 0);
  console.log("\nSummary");
  console.log("=======");
  console.log(
    `  Mode:                    ${APPLY ? "APPLY" : "DRY RUN"}${APPLY_OVERRIDDEN_BY_DRY_RUN ? " (--apply OVERRIDDEN by --dry-run)" : ""}`,
  );
  console.log(`  Target:                  ${IS_PRODUCTION ? "PRODUCTION" : "local/dev"} · db="${dbName}"`);
  console.log(`  Elapsed:                 ${formatDuration(elapsedTotal)}`);
  console.log(`  Renewals missing grant:  ${gaps.length}`);
  console.log(`  Collected without grant: ${money(gapCents)}`);
  if (stripeOnlyGaps.length > 0) {
    console.log(`  🚨 Stripe-only gaps:      ${stripeOnlyGaps.length} (NOT granted here — manual review)`);
  }
  if (APPLY) {
    console.log(`  Granted:                 ${granted}`);
    console.log(`  Already granted:         ${alreadyGranted}`);
    console.log(`  Entries credited:        ${entriesTotal}`);
  } else {
    console.log(`  Planned grants:          ${planned}`);
    console.log(`  Entries that would land: ${entriesTotal}`);
  }
  console.log(`  Skipped (needs review):  ${skipped}`);
  console.log(`  Errored:                 ${errored}`);
  if (aborted) console.log("  ⚠️ Aborted via SIGINT — PARTIAL RUN, the remaining rows were not processed");
  if (guardFailed) console.log("  🚨 A guard refused the run — nothing was written");
  else if (outerError) console.log("  🚨 Outer error — partial run");
  if (csvEnabled) {
    console.log(`  CSV audit log:           ${CSV_PATH}`);
    console.log(`     • failures/skips: grep -E ',(error|skipped|lifecycle-blocked),' "${CSV_PATH}"`);
  }

  if (APPLY) {
    console.log(
      "\n⚠️ AFTER AN APPLY, ALWAYS CHECK THE CSV FOR `,error,` — a re-run CANNOT re-detect a partial failure.\n" +
        "   processPaymentBenefits writes the PaymentEvent BEFORE granting and does not remove it if the\n" +
        "   grant throws. A row that died inside addToMajorDraw is left with entries incremented, a\n" +
        "   BenefitsGranted row present, possibly NO draw entries, and lastMonthAccumulatedEntries stale —\n" +
        "   and the next dry run would report it as healthy. Every errored row needs manual inspection\n" +
        "   (check the draw entry and subscription.lastMonthAccumulatedEntries by hand).",
    );
  } else {
    console.log(
      gaps.length > 0
        ? "\nDRY RUN — no writes. Review the rows above, then re-run with --apply --expect=<count> to grant."
        : "\nDRY RUN — no gaps found. Nothing to backfill.",
    );
  }

  try {
    await mongoose.disconnect();
  } catch {
    // ignore disconnect errors during shutdown
  }

  if (outerError) process.exit(3);
  if (APPLY) process.exit(errored > 0 || skipped > 0 || aborted ? 2 : 0);
  process.exit(gaps.length > 0 || aborted ? 2 : 0);
}

main().catch((err) => {
  // CSV rows are already on disk (appendFileSync), so nothing is lost here.
  console.error("\n🚨 Backfill aborted with unhandled error:", err);
  process.exit(1);
});
