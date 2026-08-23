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
 * ## Detection (the RC-2 join — derived, never hard-coded)
 *
 *   MembershipRenewalCycle { createdAt >= --since,
 *                            status: "succeeded",
 *                            billingReason: "subscription_cycle" }
 *     LEFT JOIN PaymentEvent on _id === `BenefitsGranted-invoice_${stripeInvoiceId}`
 *     WHERE the PaymentEvent is absent
 *
 * ## SAFETY
 *
 * - **DRY-RUN BY DEFAULT.** Nothing is written without `--apply`.
 * - **Idempotent.** `PaymentEvent._id` is deterministic
 *   (`BenefitsGranted-invoice_<invoiceId>`); `processPaymentBenefits` creates it
 *   atomically and returns `alreadyProcessed` on a second run. Each row is also
 *   re-checked against a fresh read immediately before granting.
 * - **The ORIGINAL charge timestamp is passed, never `now`.** `getTargetMajorDraw`
 *   routes on `paymentMetadata.created` (`payment-processing.ts:2226-2229` →
 *   `wasPaymentBeforeFreeze`, which reads it as **milliseconds**). A `now` timestamp
 *   would credit the NEXT month's draw and defeat the whole point of the backfill.
 * - **Tier guard.** A row is skipped unless the resolved package price matches the
 *   amount actually paid — so a mid-cycle tier change can never grant the wrong tier.
 * - **CSV audit log**, append-mode, written per row before moving on.
 * - `--expect=N` aborts before any write if the derived gap set is not exactly N rows.
 *
 * ## What `--apply` does
 *
 * Grants through the normal path (`processPaymentBenefits`) so the `PaymentEvent`,
 * `accumulatedEntries`, `rewardsPoints`, partner-discount queue and major-draw credit
 * are all created exactly as the webhook would have, then sets
 * `subscription.lastMonthAccumulatedEntries` the way `handleInvoicePaymentSucceeded`
 * does after a successful grant (`index.ts:4636-4656`) — without it the NEXT renewal
 * accumulates from a stale baseline and under-grants.
 *
 * It does **not** write the affiliate *recurring* commission (that is a separate
 * webhook step); use `npm run backfill:affiliate-recurring-commissions:all:dry` for
 * those. Being the normal grant path, it DOES emit the usual live side effects
 * (Klaviyo / Meta CAPI / TikTok purchase events) with the original charge time.
 *
 * ## Usage
 *
 *   npm run backfill:missing-renewal-grants:dry                # local/dev DB, report only
 *   npm run backfill:missing-renewal-grants:prod:dry           # PRODUCTION, report only
 *   npm run backfill:missing-renewal-grants:prod -- --expect=11  # PRODUCTION, WRITES
 *
 * Options:
 *   --apply            Perform writes. Without it nothing is written.
 *   --production       Read env from `.env.production` (default: `.env.local`) and
 *                      force the database name to `Production` (`PROD_DB_NAME` to
 *                      override) — the prod Atlas string may carry no `/<db>` path,
 *                      and a bare connect silently lands on an empty `test` DB.
 *   --since=<ISO>      Detection window start (default: 2026-08-23T13:00:00Z, the
 *                      incident window).
 *   --expect=N         Refuse to apply unless exactly N gaps were derived.
 *   --limit=N          Process at most N gaps (planning aid).
 *   --csv-path=PATH    Override the CSV audit path.
 *   --no-csv           Disable the CSV audit log (not recommended).
 *
 * Exit codes: 0 = clean (no gaps, or all grants succeeded) · 2 = gaps found in
 * dry-run, or per-row errors/skips in apply · 3 = fatal/guard failure before or
 * during the run · 1 = unhandled error.
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

const APPLY = process.argv.includes("--apply");
const NO_CSV = process.argv.includes("--no-csv");

function parseArg(name: string): string | undefined {
  const raw = process.argv.find((a) => a.startsWith(`--${name}=`));
  return raw ? raw.split("=").slice(1).join("=") : undefined;
}

const SINCE_RAW = parseArg("since") ?? "2026-08-23T13:00:00Z";
const SINCE = new Date(SINCE_RAW);
const EXPECT_RAW = parseArg("expect");
const EXPECT = EXPECT_RAW !== undefined ? parseInt(EXPECT_RAW, 10) : null;
const LIMIT_RAW = parseArg("limit");
const LIMIT = LIMIT_RAW ? parseInt(LIMIT_RAW, 10) : Infinity;
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

type GapRow = {
  stripeInvoiceId: string;
  userId: string;
  amountPaidCents: number;
  chargedAt: Date;
};

type RowOutcome = "granted" | "already-granted" | "planned" | "skipped" | "error";

async function main(): Promise<void> {
  if (!Number.isFinite(SINCE.getTime())) {
    console.error(`❌ --since=${SINCE_RAW} is not a valid date.`);
    process.exit(3);
  }
  if (EXPECT !== null && !Number.isFinite(EXPECT)) {
    console.error(`❌ --expect=${EXPECT_RAW} is not a number.`);
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

  console.log("\nBackfill renewals charged without granting entries");
  console.log("==================================================");
  console.log(`  Mode:        ${APPLY ? "🔴 APPLY (LIVE WRITES)" : "🟢 DRY RUN (no writes)"}`);
  console.log(`  Target:      ${IS_PRODUCTION ? "PRODUCTION" : "local/dev"} · db="${dbName}" @ ${host}`);
  console.log(`  Env file:    ${ENV_FILE}`);
  console.log(`  Since:       ${SINCE.toISOString()}`);
  console.log(`  Expect:      ${EXPECT === null ? "<not asserted>" : `${EXPECT} gaps`}`);
  console.log(`  Limit:       ${LIMIT === Infinity ? "no limit" : LIMIT}`);
  console.log(`  CSV log:     ${NO_CSV ? "DISABLED (--no-csv)" : CSV_PATH}`);
  if (IS_PRODUCTION && APPLY) {
    console.log("  ⚠️  Targeting PRODUCTION with WRITES. Ctrl-C now if this was not intended.");
  }
  console.log("");

  // ── CSV audit log (append mode, one row written before moving to the next) ────
  let csvStream: fs.WriteStream | null = null;
  if (!NO_CSV) {
    try {
      fs.mkdirSync(path.dirname(CSV_PATH), { recursive: true });
      const csvIsEmpty = !fs.existsSync(CSV_PATH) || fs.statSync(CSV_PATH).size === 0;
      csvStream = fs.createWriteStream(CSV_PATH, { flags: "a" });
      if (csvIsEmpty) {
        csvStream.write(
          "timestamp,mode,invoice_id,user_id,email,package_id,package_name,amount_paid,charged_at_utc," +
            "entries_to_grant,new_last_month_accumulated,before_freeze,outcome,detail\n",
        );
      }
    } catch (csvErr) {
      console.error(
        `⚠️ Failed to open CSV at ${CSV_PATH}: ${csvErr instanceof Error ? csvErr.message : String(csvErr)}\n   Continuing with terminal log only.`,
      );
      csvStream = null;
    }
  }

  function csvWrite(row: {
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
    outcome: RowOutcome;
    detail?: unknown;
  }): void {
    if (!csvStream) return;
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
          row.outcome,
          row.detail ?? "",
        ]
          .map(csvEscape)
          .join(",") + "\n";
      csvStream.write(line);
    } catch {
      // never let an audit-log failure break the run
    }
  }

  const startMs = Date.now();
  let granted = 0;
  let alreadyGranted = 0;
  let planned = 0;
  let skipped = 0;
  let errored = 0;
  let entriesTotal = 0;
  let aborted = false;
  let outerError: unknown = null;
  let gaps: GapRow[] = [];

  const sigintHandler = () => {
    console.log("\n⚠️ SIGINT received — finishing the current row then exiting cleanly...");
    aborted = true;
  };
  process.on("SIGINT", sigintHandler);

  try {
    // ── 1. The RC-2 join: paid renewals with no BenefitsGranted PaymentEvent ────
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

    const gapCents = gaps.reduce((sum, g) => sum + g.amountPaidCents, 0);
    console.log(`TOTAL renewals missing a grant: ${gaps.length}`);
    console.log(`Collected without grant: ${money(gapCents)}\n`);

    // ── 2. Freeze context — will these land in the CURRENT draw? (read-only) ────
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

    // ── 3. Guard before any write ──────────────────────────────────────────────
    if (EXPECT !== null && gaps.length !== EXPECT) {
      console.error(
        `\n🚨 GUARD: --expect=${EXPECT} but the join derived ${gaps.length}. Refusing to continue.\n` +
          `   The detection query is wrong, or the gap set moved. Granting on a wrong set is unsafe.`,
      );
      throw new GuardFailure();
    }

    const work = LIMIT === Infinity ? gaps : gaps.slice(0, LIMIT);
    // ~20 progress lines regardless of run size, so even an 11-row run visibly moves.
    const progressEvery = Math.max(1, Math.ceil(work.length / 20));

    for (let i = 0; i < work.length; i++) {
      if (aborted) break;
      const gap = work[i];
      const invoicePaymentId = `invoice_${gap.stripeInvoiceId}`;
      const chargedAtUtc = gap.chargedAt.toISOString();

      try {
        const user = await User.findById(gap.userId).select(
          "email accumulatedEntries subscription.packageId subscription.lastMonthAccumulatedEntries",
        );
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
            // recurring one is a separate webhook step (see the module docblock).
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
    if (!(err instanceof GuardFailure)) {
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
  console.log(`  Mode:                    ${APPLY ? "APPLY" : "DRY RUN"}`);
  console.log(`  Target:                  ${IS_PRODUCTION ? "PRODUCTION" : "local/dev"} · db="${dbName}"`);
  console.log(`  Elapsed:                 ${formatDuration(elapsedTotal)}`);
  console.log(`  Renewals missing grant:  ${gaps.length}`);
  console.log(`  Collected without grant: ${money(gapCents)}`);
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
  if (aborted) console.log("  ⚠️ Aborted via SIGINT — partial run");
  if (outerError instanceof GuardFailure) console.log("  🚨 --expect guard failed — nothing was written");
  else if (outerError) console.log("  🚨 Outer error — partial run");
  if (csvStream) {
    console.log(`  CSV audit log:           ${CSV_PATH}`);
    console.log(`     • failures/skips: grep -E ',(error|skipped),' "${CSV_PATH}"`);
  }
  if (!APPLY) {
    console.log(
      gaps.length > 0
        ? "\nDRY RUN — no writes. Review the rows above, then re-run with --apply to grant."
        : "\nDRY RUN — no gaps found. Nothing to backfill.",
    );
  }

  if (csvStream) {
    await new Promise<void>((resolve) => csvStream!.end(() => resolve()));
  }
  try {
    await mongoose.disconnect();
  } catch {
    // ignore disconnect errors during shutdown
  }

  if (outerError) process.exit(3);
  if (APPLY) process.exit(errored > 0 || skipped > 0 ? 2 : 0);
  process.exit(gaps.length > 0 ? 2 : 0);
}

/** Thrown by the `--expect` guard so the summary still prints, but nothing is written. */
class GuardFailure extends Error {
  constructor() {
    super("expect-guard-failed");
    this.name = "GuardFailure";
  }
}

main().catch((err) => {
  console.error("\n🚨 Backfill aborted with unhandled error:", err);
  process.exit(1);
});
