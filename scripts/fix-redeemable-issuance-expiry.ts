#!/usr/bin/env npx tsx
/**
 * Repair RedeemableIssuance rows whose stored `expiresAt` is the far-future
 * SENTINEL (`9999-12-31T23:59:59.999Z`) even though their campaign has a real,
 * finite `endsAt` — and then mark genuinely-lapsed rows `status: "expired"`.
 *
 * WHY (incident, 2026-09-01). Campaign ANZAC DAY 25 (`ANZACDAY25`) ran
 * 2026-04-24 -> endsAt 2026-04-27T10:00Z with `neverExpires: false` and no
 * `validForHours`, but was left `isActive: true`. 452 of its issuances had been
 * minted with the sentinel expiry BEFORE an expiry was configured on the
 * campaign (the campaign was edited mid-run, `updatedAt` 2026-04-27T08:51), and
 * 188 of those were still `status: "active"`. Those rows therefore carried a
 * stored deadline in the year 9999 for a coupon that actually died in April.
 *
 * NOT THE FIX FOR THE CLAIM BUTTON. The enabled-Claim-button-the-server-refuses
 * bug was a CODE defect — RedeemablesWalletService hand-rolled a partial copy of
 * `isCampaignRedeemable` and never consulted `endsAt`. That is fixed in
 * `src/services/redeemables/RedeemablesWalletService.ts` and needs no data
 * change. This script fixes the SEPARATE problem that the stored dates are
 * simply wrong, so support tooling, exports, the "expires <date>" line and the
 * claimable/past split all tell the truth.
 *
 * TWO PASSES
 *   1. `expiresAt` >= year 9999  ->  set to the campaign's own `endsAt`.
 *   2. `expiresAt` < now AND `status: "active"`  ->  set `status: "expired"`.
 *      (In a live run this naturally includes the rows pass 1 just re-dated; a
 *      dry run reports that group separately, since pass 1 wrote nothing.)
 *
 * SCOPE — the guard that stops this eating a legitimate never-expiring grant.
 * Only issuances belonging to campaigns that ALL of:
 *   - `neverExpires` is not true (a never-expiring campaign's sentinel expiry is
 *     CORRECT — `NEVER_EXPIRES_ISSUANCE_DATE` is deliberately stamped there),
 *   - no personal window (`validForHours` unset / < 1) — a trigger campaign's
 *     issuance `expiresAt` is that customer's OWN emailed deadline and the
 *     campaign's `endsAt` is only a minting backstop, so copying `endsAt` over
 *     it would cut short a deadline we already promised in writing,
 *   - a real finite `endsAt` (present, and NOT itself the open-ended year-9999
 *     sentinel — see `isOpenEndedDate`).
 * Anything outside that set is counted and skipped with an explicit reason.
 *
 * SAFETY: DRY-RUN BY DEFAULT. Nothing is written unless you pass --apply.
 * Idempotent: pass 1's filter no longer matches a row it has already re-dated,
 * and pass 2's no longer matches a row it has already expired. Re-runs converge.
 *
 * Usage:
 *   npm run fix:redeemable-issuance-expiry:dry            # local DB, plan only (default)
 *   npm run fix:redeemable-issuance-expiry                # local DB, LIVE writes
 *   npm run fix:redeemable-issuance-expiry:prod:dry       # PRODUCTION, plan only  <- run this first
 *   npm run fix:redeemable-issuance-expiry:prod           # PRODUCTION, LIVE writes
 *
 * Options:
 *   --apply             Perform writes. Without it, nothing is written.
 *   --prod              Target production (loads MONGODB_URI from .env.production).
 *   --campaign=CODE     Restrict both passes to one campaign code (e.g. ANZACDAY25).
 *   --limit=N           Stop each pass after N rows (smoke-testing a live run).
 *   --out-dir=PATH      CSV audit-log directory (default: temp/readonly/).
 *   --no-csv            Terminal log only.
 *
 * Exit: 0 clean · 2 per-row errors · 3 outer/fatal · 1 unhandled.
 * Env: MONGODB_URI — from .env.local, or .env.production when --prod.
 * @module scripts/fix-redeemable-issuance-expiry
 */
import { config } from "dotenv";
import fs from "fs";
import path from "path";

const ARGS = process.argv.slice(2);
const APPLY = ARGS.includes("--apply");
const USE_PROD = ARGS.includes("--prod");
const NO_CSV = ARGS.includes("--no-csv");

function parseArg(name: string): string | undefined {
  const a = ARGS.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split("=").slice(1).join("=") : undefined;
}
const ARG_CAMPAIGN = parseArg("campaign")?.trim().toUpperCase();
const LIMIT_RAW = parseArg("limit");
const LIMIT = LIMIT_RAW ? Number.parseInt(LIMIT_RAW, 10) : Infinity;
const OUT_DIR = parseArg("out-dir") ?? path.resolve(process.cwd(), "temp", "readonly");

config({ path: path.resolve(process.cwd(), USE_PROD ? ".env.production" : ".env.local") });

/**
 * The year boundary that identifies a sentinel expiry, NOT an equality test on
 * `9999-12-31T23:59:59.999Z`. Same threshold `isOpenEndedDate` uses, and for the
 * same reason: a value that has round-tripped through the admin form's
 * `datetime-local` picker comes back as a DIFFERENT instant in the same year
 * (or rolls into year 10000 west of UTC). An equality test would silently leave
 * those rows behind.
 */
const SENTINEL_YEAR_FLOOR = new Date("9999-01-01T00:00:00.000Z");

/** Tally/audit label for a campaign row that predates the `code` field. */
const NO_CODE_LABEL = "(no-code)";

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s: string;
  if (value instanceof Error) s = value.message;
  else if (value instanceof Date) s = value.toISOString();
  else if (typeof value === "object") {
    try {
      s = JSON.stringify(value);
    } catch {
      s = String(value);
    }
  } else s = String(value);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function formatDuration(ms: number): string {
  const t = Math.round(ms / 1000);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = t % 60;
  return h > 0 ? `${h}h ${m}m ${s}s` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}

interface AuditRow {
  pass: 1 | 2;
  issuanceId: string;
  campaignId: string;
  campaignCode: string;
  userId: string;
  statusBefore: string;
  expiresAtBefore: Date | null;
  expiresAtAfter?: Date | null;
  statusAfter?: string;
  action: "update" | "skip" | "error";
  reason: string;
  error?: string;
}

async function main(): Promise<void> {
  if (!process.env.MONGODB_URI) {
    console.error(`MONGODB_URI missing from ${USE_PROD ? ".env.production" : ".env.local"}`);
    process.exit(1);
  }

  const connectDB = (await import("../src/lib/mongodb")).default;
  const mongoose = (await import("mongoose")).default;
  const RedeemableIssuance = (await import("../src/models/RedeemableIssuance")).default;
  const MonthlyEntryCampaign = (await import("../src/models/MonthlyEntryCampaign")).default;
  const { isOpenEndedDate, personalWindowGoverns } = await import("../src/utils/redeemables/bonus-code-policy");

  await connectDB();
  const dbName = mongoose.connection.db?.databaseName ?? "(unknown)";

  // ---- CSV audit log (append mode) -----------------------------------------
  let csvStream: fs.WriteStream | null = null;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const csvPath = path.join(OUT_DIR, `fix-redeemable-issuance-expiry-${APPLY ? "live" : "dry"}-${stamp}.csv`);
  if (!NO_CSV) {
    try {
      fs.mkdirSync(OUT_DIR, { recursive: true });
      csvStream = fs.createWriteStream(csvPath, { flags: "a" });
      if (!fs.existsSync(csvPath) || fs.statSync(csvPath).size === 0) {
        csvStream.write(
          "timestamp,mode,pass,issuance_id,campaign_id,campaign_code,user_id,status_before,expires_at_before,expires_at_after,status_after,action,reason,error\n"
        );
      }
    } catch (e) {
      console.error(
        `⚠️ Failed to open CSV at ${csvPath}: ${e instanceof Error ? e.message : String(e)} — terminal-log only.`
      );
      csvStream = null;
    }
  }
  function csvWrite(row: AuditRow): void {
    if (!csvStream) return;
    try {
      csvStream.write(
        [
          new Date().toISOString(),
          APPLY ? "LIVE" : "DRY",
          row.pass,
          row.issuanceId,
          row.campaignId,
          row.campaignCode,
          row.userId,
          row.statusBefore,
          row.expiresAtBefore,
          row.expiresAtAfter,
          row.statusAfter,
          row.action,
          row.reason,
          row.error,
        ]
          .map(csvEscape)
          .join(",") + "\n"
      );
    } catch {
      /* never break the loop for the audit log */
    }
  }

  const now = new Date();
  console.log("\nFix RedeemableIssuance expiry (sentinel -> campaign endsAt, then lapse to 'expired')");
  console.log("====================================================================================");
  console.log(`  Target:    ${USE_PROD ? "PRODUCTION" : "local"} · db="${dbName}"`);
  console.log(`  Mode:      ${APPLY ? "LIVE (writes)" : "DRY RUN (no writes)"}`);
  console.log(`  Now:       ${now.toISOString()}`);
  console.log(`  Campaign:  ${ARG_CAMPAIGN ?? "all in-scope campaigns"}`);
  console.log(`  Limit:     ${LIMIT === Infinity ? "no limit" : LIMIT} per pass`);
  console.log(`  CSV log:   ${csvStream ? csvPath : "DISABLED"}`);
  if (USE_PROD && APPLY) {
    console.log("  ⚠️  PRODUCTION WRITES. This changes what customers see. Ctrl-C now if unintended.");
  }

  // ---- Scope: which campaigns may be touched at all -------------------------
  // Read every candidate, then filter in memory with the SAME helpers the app
  // uses (isOpenEndedDate / personalWindowGoverns) rather than re-expressing
  // them as Mongo predicates — a re-expression is exactly how the wallet drifted
  // from the redeem path in the first place.
  const campaignFilter: Record<string, unknown> = { neverExpires: { $ne: true } };
  if (ARG_CAMPAIGN) campaignFilter.code = ARG_CAMPAIGN;
  const candidateCampaigns = await MonthlyEntryCampaign.find(campaignFilter)
    .select("code name endsAt neverExpires validForHours isActive")
    .lean();

  const eligible = new Map<string, { code: string; name: string; endsAt: Date }>();
  let excludedPersonalWindow = 0;
  let excludedOpenEnded = 0;
  let excludedNoEndsAt = 0;
  for (const c of candidateCampaigns) {
    if (personalWindowGoverns(c)) {
      excludedPersonalWindow++;
      continue;
    }
    if (!c.endsAt) {
      excludedNoEndsAt++;
      continue;
    }
    if (isOpenEndedDate(c.endsAt)) {
      excludedOpenEnded++;
      continue;
    }
    eligible.set(String(c._id), { code: c.code, name: c.name, endsAt: c.endsAt });
  }
  const eligibleIds = [...eligible.keys()].map((id) => new mongoose.Types.ObjectId(id));

  console.log("\nScope");
  console.log("-----");
  console.log(`  Campaigns considered:            ${candidateCampaigns.length.toLocaleString()}`);
  console.log(`  In scope (finite endsAt):        ${eligible.size.toLocaleString()}`);
  console.log(`  Excluded — personal window:      ${excludedPersonalWindow.toLocaleString()}`);
  console.log(`  Excluded — open-ended endsAt:    ${excludedOpenEnded.toLocaleString()}`);
  console.log(`  Excluded — no endsAt:            ${excludedNoEndsAt.toLocaleString()}`);
  console.log(`  (neverExpires campaigns were never queried — their sentinel expiry is correct.)`);

  const startMs = Date.now();
  let errored = 0;
  let aborted = false;
  const sigint = () => {
    console.log("\n⚠️ SIGINT — finishing current row then exiting...");
    aborted = true;
  };
  process.on("SIGINT", sigint);

  // Pass-1 rows whose NEW expiresAt already lies in the past. In a live run pass
  // 2's own query picks them up; in a dry run pass 1 wrote nothing, so they must
  // be carried across by hand or the dry run under-reports pass 2.
  const plannedLapsedByPass1 = new Set<string>();
  const pass1ByStatus: Record<string, number> = {};
  const pass1ByCampaign: Record<string, number> = {};
  const pass2ByCampaign: Record<string, number> = {};
  let pass1Processed = 0;
  let pass1Updated = 0;
  let pass2Processed = 0;
  let pass2Updated = 0;

  let outerError: unknown = null;
  try {
    // ================= PASS 1 — sentinel expiry -> campaign endsAt ============
    const pass1Filter = {
      campaignId: { $in: eligibleIds },
      expiresAt: { $gte: SENTINEL_YEAR_FLOOR },
    };
    const pass1Matched = eligibleIds.length ? await RedeemableIssuance.countDocuments(pass1Filter) : 0;
    const pass1Total = LIMIT === Infinity ? pass1Matched : Math.min(pass1Matched, LIMIT);
    console.log("\nPass 1 — sentinel expiresAt -> campaign endsAt");
    console.log("---------------------------------------------");
    console.log(`  To process: ${pass1Total.toLocaleString()} issuance(s)${LIMIT !== Infinity ? ` (capped at --limit ${LIMIT})` : ""}`);
    if (pass1Total === 0) console.log("  Nothing to re-date.");

    const pass1Every = Math.max(1, Math.min(1000, Math.floor(pass1Total / 20)));
    if (pass1Total > 0) {
      const q1 = RedeemableIssuance.find(pass1Filter).select("campaignId userId status expiresAt");
      if (LIMIT !== Infinity) q1.limit(LIMIT);
      for await (const row of q1.cursor({ batchSize: 500 })) {
        if (aborted) break;
        pass1Processed++;
        const id = String(row._id);
        const campaign = eligible.get(String(row.campaignId));
        const base = {
          pass: 1 as const,
          issuanceId: id,
          campaignId: String(row.campaignId),
          // A campaign predating the `code` field reads back undefined here. That is a
          // REAL shape in this collection (22 such rows in the dev DB), so it gets a stable
          // label rather than an "undefined" tally key that looks like a bug in the report.
          campaignCode: campaign?.code ?? NO_CODE_LABEL,
          userId: String(row.userId),
          statusBefore: row.status,
          expiresAtBefore: row.expiresAt ?? null,
        };
        try {
          if (!campaign) {
            // Unreachable via the $in filter, but a defensive skip beats a crash.
            csvWrite({ ...base, action: "skip", reason: "campaign_not_in_scope" });
            continue;
          }
          const newExpiresAt = campaign.endsAt;
          pass1ByStatus[row.status] = (pass1ByStatus[row.status] ?? 0) + 1;
          pass1ByCampaign[base.campaignCode] = (pass1ByCampaign[base.campaignCode] ?? 0) + 1;
          if (APPLY) {
            await RedeemableIssuance.updateOne({ _id: row._id }, { $set: { expiresAt: newExpiresAt } });
          }
          if (row.status === "active" && newExpiresAt.getTime() < now.getTime()) {
            plannedLapsedByPass1.add(id);
          }
          pass1Updated++;
          csvWrite({
            ...base,
            expiresAtAfter: newExpiresAt,
            action: "update",
            reason: row.status === "active" ? "sentinel_expiry_active_row" : `sentinel_expiry_${row.status}_row`,
          });
        } catch (err) {
          errored++;
          const msg = err instanceof Error ? err.message : String(err);
          csvWrite({ ...base, action: "error", reason: "update_failed", error: msg });
          console.error(`✗ pass1 ${id}: ${msg}`);
        }
        if (pass1Processed % pass1Every === 0) {
          const el = Date.now() - startMs;
          const rate = pass1Processed / Math.max(el / 1000, 0.001);
          const pct = Math.round((pass1Processed / pass1Total) * 100);
          const eta = rate > 0 ? (Math.max(0, pass1Total - pass1Processed) / rate) * 1000 : 0;
          console.log(
            `  Progress: ${pass1Processed.toLocaleString()}/${pass1Total.toLocaleString()} (${pct}%) · ` +
              `${pass1Updated} ok · ${errored} err · ${Math.round(rate)}/sec · elapsed ${formatDuration(el)} · ETA ${formatDuration(eta)}`
          );
        }
      }
    }

    // ================= PASS 2 — lapsed active rows -> status "expired" ========
    // NOTE: no code path in the app writes `status: "expired"` — the redeem and
    // re-arm gates both key off `expiresAt`, never off the status string (see
    // bonus-code-policy.decideRearm rule 2). So this pass changes NO behaviour;
    // it makes the stored status agree with the stored date, for support, admin
    // exports and the claimable/past split. The claim-button fix is the code
    // change in RedeemablesWalletService, not this.
    const pass2Filter = {
      campaignId: { $in: eligibleIds },
      status: "active",
      expiresAt: { $lt: now },
    };
    const pass2Matched = eligibleIds.length ? await RedeemableIssuance.countDocuments(pass2Filter) : 0;
    const pass2Total = LIMIT === Infinity ? pass2Matched : Math.min(pass2Matched, LIMIT);
    console.log("\nPass 2 — active rows already past expiry -> status 'expired'");
    console.log("-----------------------------------------------------------");
    console.log(`  Already past expiry in the DB:   ${pass2Total.toLocaleString()}`);
    if (!APPLY) {
      console.log(
        `  + would lapse via pass 1:        ${plannedLapsedByPass1.size.toLocaleString()}  (dry run — pass 1 wrote nothing, so this pass's query cannot see them yet)`
      );
      console.log(`  = total a LIVE run would expire: ${(pass2Total + plannedLapsedByPass1.size).toLocaleString()}`);
    }
    if (pass2Total === 0 && plannedLapsedByPass1.size === 0) console.log("  Nothing to expire.");

    const pass2Every = Math.max(1, Math.min(1000, Math.floor(pass2Total / 20)));
    if (pass2Total > 0) {
      const pass2StartMs = Date.now();
      const q2 = RedeemableIssuance.find(pass2Filter).select("campaignId userId status expiresAt");
      if (LIMIT !== Infinity) q2.limit(LIMIT);
      for await (const row of q2.cursor({ batchSize: 500 })) {
        if (aborted) break;
        pass2Processed++;
        const id = String(row._id);
        const campaign = eligible.get(String(row.campaignId));
        const base = {
          pass: 2 as const,
          issuanceId: id,
          campaignId: String(row.campaignId),
          campaignCode: campaign?.code ?? NO_CODE_LABEL,
          userId: String(row.userId),
          statusBefore: row.status,
          expiresAtBefore: row.expiresAt ?? null,
        };
        try {
          if (APPLY) {
            await RedeemableIssuance.updateOne({ _id: row._id }, { $set: { status: "expired" } });
          }
          pass2Updated++;
          pass2ByCampaign[base.campaignCode] = (pass2ByCampaign[base.campaignCode] ?? 0) + 1;
          csvWrite({
            ...base,
            expiresAtAfter: row.expiresAt ?? null,
            statusAfter: "expired",
            action: "update",
            reason: plannedLapsedByPass1.has(id) ? "lapsed_after_pass1_redate" : "already_past_expiry",
          });
        } catch (err) {
          errored++;
          const msg = err instanceof Error ? err.message : String(err);
          csvWrite({ ...base, action: "error", reason: "update_failed", error: msg });
          console.error(`✗ pass2 ${id}: ${msg}`);
        }
        if (pass2Processed % pass2Every === 0) {
          const el = Date.now() - pass2StartMs;
          const rate = pass2Processed / Math.max(el / 1000, 0.001);
          const pct = Math.round((pass2Processed / pass2Total) * 100);
          const eta = rate > 0 ? (Math.max(0, pass2Total - pass2Processed) / rate) * 1000 : 0;
          console.log(
            `  Progress: ${pass2Processed.toLocaleString()}/${pass2Total.toLocaleString()} (${pct}%) · ` +
              `${pass2Updated} ok · ${errored} err · ${Math.round(rate)}/sec · elapsed ${formatDuration(el)} · ETA ${formatDuration(eta)}`
          );
        }
      }
    }
  } catch (err) {
    outerError = err;
    console.error(`\n🚨 Outer error: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    process.removeListener("SIGINT", sigint);
  }

  // ---- Summary --------------------------------------------------------------
  const redeemedTouched = (pass1ByStatus.redeemed ?? 0) + (pass1ByStatus.cancelled ?? 0);
  console.log("\nSummary");
  console.log("=======");
  console.log(`  Target:    ${USE_PROD ? "PRODUCTION" : "local"} · db="${dbName}"`);
  console.log(`  Mode:      ${APPLY ? "LIVE (writes applied)" : "DRY RUN (no writes)"}`);
  console.log(`  Elapsed:   ${formatDuration(Date.now() - startMs)}`);
  console.log(`  Pass 1 — re-dated: ${pass1Updated.toLocaleString()} of ${pass1Processed.toLocaleString()} processed`);
  console.log(`           by status:   ${JSON.stringify(pass1ByStatus)}`);
  console.log(`           by campaign: ${JSON.stringify(pass1ByCampaign)}`);
  if (redeemedTouched > 0) {
    console.log(
      `  ⚠️  ${redeemedTouched.toLocaleString()} of those rows are ALREADY REDEEMED / CANCELLED. Their entries were\n` +
        `      granted long ago and are untouched — only the wrong stored deadline is corrected, so support\n` +
        `      tooling and exports stop showing a year-9999 expiry on a spent coupon. Nothing is re-granted\n` +
        `      and nothing is revoked.`
    );
  }
  console.log(`  Pass 2 — expired:  ${pass2Updated.toLocaleString()} of ${pass2Processed.toLocaleString()} processed`);
  console.log(`           by campaign: ${JSON.stringify(pass2ByCampaign)}`);
  if (!APPLY) {
    console.log(
      `  Pass 2 (dry) would ALSO expire ${plannedLapsedByPass1.size.toLocaleString()} row(s) that pass 1 re-dates into the past,\n` +
        `      for a live-run total of ${(pass2Processed + plannedLapsedByPass1.size).toLocaleString()}.`
    );
  }
  console.log(`  Errors:    ${errored.toLocaleString()}`);
  if (aborted) console.log("  ⚠️ Aborted via SIGINT — partial run");
  if (outerError) console.log("  🚨 Outer error — partial run");
  if (csvStream) console.log(`  CSV: ${csvPath}  (grep ',error,' to find failures)`);
  if (!APPLY) console.log("\n  DRY RUN — nothing was written. Re-run with --apply to commit these changes.");

  if (csvStream) await new Promise<void>((r) => csvStream!.end(() => r()));
  try {
    await mongoose.disconnect();
  } catch {
    /* ignore */
  }

  if (outerError) process.exit(3);
  process.exit(errored > 0 ? 2 : 0);
}

main().catch((err) => {
  console.error("\n🚨 fix-redeemable-issuance-expiry aborted with unhandled error:", err);
  process.exit(1);
});
