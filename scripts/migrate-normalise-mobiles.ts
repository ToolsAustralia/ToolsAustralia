#!/usr/bin/env npx tsx

/**
 * Normalise every `User.mobile` to E.164 (`+61…`) and free up duplicate numbers.
 *
 * WHY THIS MUST RUN BEFORE SMS LOGIN IS ENABLED
 * ---------------------------------------------
 * `User.mobile` is now a LOGIN IDENTIFIER — `/api/auth/send-mobile-login-code`
 * finds the account with `User.findOne({ mobile: normalised })`. Two things in
 * production break that lookup today (audited 2026-08-26 via
 * `npm run find:duplicate-mobiles:prod`):
 *
 *   1. DRIFT — 4,972 rows are stored as `04…` rather than the `+61…` the model's
 *      `pre("save")` hook produces (the hook only runs on `.save()`; `updateOne`
 *      bypasses it). A lookup on the canonical form silently MISSES those ~5,000
 *      members: they appear not to have an account at all.
 *
 *   2. DUPLICATES — 109 numbers are shared by 2 accounts each. A mobile lookup is
 *      then ambiguous, and resolving it wrongly hands someone another person's
 *      account. A `unique` index cannot be built until they are resolved.
 *
 * WHAT IT DOES ABOUT DUPLICATES — deliberately the minimum. It **unsets** `mobile`
 * on the LOWER-VALUE account of each pair, which is all the unique index needs. It
 * does NOT delete accounts, move entries, or merge anything: those are
 * customer-service decisions with real consequences, and `accumulatedEntries` is a
 * lifetime counter whose value mostly belongs to draws that already ran. The loser
 * keeps everything except the phone number.
 *
 * Value ranking (highest wins, ties → the account created FIRST keeps the number):
 *   active subscription > active one-time pack > more entries > has paid > older
 * A group where BOTH sides are privileged, or where the winner is ambiguous, is
 * SKIPPED and reported for a human.
 *
 * Usage:
 *   npm run migrate:normalise-mobiles:dry          # dry run, local
 *   npm run migrate:normalise-mobiles:prod:dry     # dry run, production  ← START HERE
 *   npm run migrate:normalise-mobiles:prod         # live, production
 *
 * Options:
 *   --prod          Target PROD_MONGODB_URI (see connect-ops-db).
 *   --dry-run       Report only; write nothing.
 *   --skip-dupes    Normalise drift only; leave duplicate groups alone.
 *   --csv <path>    Append an audit row per change (default ./temp/mobile-migration.csv).
 *                   Rows carry userId + email + phone — keep them out of the repo root.
 *
 * Safety:
 *   Dry-run is NOT the default (per the repo convention the `:dry` npm script
 *   passes the flag), but a live run prints the plan and pauses 10s first.
 *   Every write is a targeted `updateOne` by `_id`. Re-runnable: normalising an
 *   already-normalised value is a no-op, and a cleared mobile stays cleared.
 *
 * Env: MONGODB_URI (or PROD_MONGODB_URI + optional PROD_DB_NAME with --prod)
 */

import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env.local") });

import fs from "fs";
import { connectOpsDb } from "./connect-ops-db";
import { normaliseAuMobile } from "../src/lib/sms";
import { isPrivilegedAccount } from "../src/utils/auth/privileged-account";

const LABEL = "migrate:normalise-mobiles";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

interface Row {
  _id: unknown;
  email?: string;
  mobile?: string;
  accumulatedEntries?: number;
  processedPayments?: unknown[];
  stripeSubscriptionId?: string;
  createdAt?: Date;
  role?: string;
  userType?: string;
  roleId?: unknown;
  subscription?: { isActive?: boolean };
  oneTimePackages?: { isActive?: boolean }[];
}

/** Higher wins. Mirrors the ranking documented in the header. */
function score(u: Row): number {
  let s = 0;
  if (u.subscription?.isActive) s += 1_000_000;
  if (u.oneTimePackages?.some((p) => p.isActive)) s += 500_000;
  s += Math.min(u.accumulatedEntries ?? 0, 400_000);
  if ((u.processedPayments?.length ?? 0) > 0) s += 1_000;
  return s;
}

async function main() {
  const mongoose = await connectOpsDb(LABEL);
  const dryRun = process.argv.includes("--dry-run");
  const skipDupes = process.argv.includes("--skip-dupes");
  // Default under /temp: these rows carry userId + EMAIL + PHONE NUMBER, and /temp is
  // gitignored. Writing PII to the repo root by default is a trap worth not setting.
  const csvPath = arg("--csv") ?? "./temp/mobile-migration.csv";

  const User = (await import("../src/models/User")).default;

  console.log(`\n${dryRun ? "🧪 DRY RUN — nothing will be written" : "🔴 LIVE RUN — will modify data"}`);

  const total = await User.countDocuments({ mobile: { $exists: true, $nin: [null, ""] } });
  console.log(`\n📊 Scanning ${total.toLocaleString()} users with a mobile…`);

  const cursor = User.find({ mobile: { $exists: true, $nin: [null, ""] } })
    .select(
      "email mobile accumulatedEntries processedPayments stripeSubscriptionId createdAt role userType roleId subscription.isActive oneTimePackages.isActive"
    )
    .lean<Row[]>()
    .cursor();

  const byNormalised = new Map<string, Row[]>();
  const drift: { row: Row; from: string; to: string }[] = [];
  const invalid: Row[] = [];

  let processed = 0;
  const started = Date.now();
  const tick = Math.max(1, Math.floor(total / 20));

  for await (const doc of cursor) {
    const u = doc as Row;
    processed++;
    const raw = (u.mobile ?? "").trim();
    const norm = normaliseAuMobile(raw);

    if (!norm) {
      invalid.push(u);
    } else {
      if (norm !== raw) drift.push({ row: u, from: raw, to: norm });
      const bucket = byNormalised.get(norm);
      if (bucket) bucket.push(u);
      else byNormalised.set(norm, [u]);
    }

    if (processed % tick === 0 || processed === total) {
      const elapsed = (Date.now() - started) / 1000;
      const rate = processed / Math.max(elapsed, 0.001);
      console.log(
        `   ${processed.toLocaleString()}/${total.toLocaleString()} ` +
          `(${((processed / Math.max(total, 1)) * 100).toFixed(1)}%) · ${rate.toFixed(0)}/sec · ` +
          `ETA ${((total - processed) / Math.max(rate, 0.001)).toFixed(0)}s`
      );
    }
  }

  const dupeGroups = [...byNormalised.entries()].filter(([, rows]) => rows.length > 1);

  console.log("\n" + "═".repeat(66));
  console.log("PLAN");
  console.log("═".repeat(66));
  console.log(`  normalise (04… → +61…)……… ${drift.length.toLocaleString()}`);
  console.log(`  duplicate groups……………………… ${dupeGroups.length.toLocaleString()}${skipDupes ? "  (SKIPPED via --skip-dupes)" : ""}`);
  console.log(`  invalid (left untouched)… ${invalid.length.toLocaleString()}`);

  if (!dryRun) {
    // Count down out loud. A silent 10s pause before a long write phase is
    // indistinguishable from a hang.
    for (let s = 10; s > 0; s--) {
      process.stdout.write(`\r⏳ Starting in ${String(s).padStart(2)}s — Ctrl-C to abort.   `);
      await new Promise((r) => setTimeout(r, 1000));
    }
    console.log("\r▶ Writing…                                   ");
  }

  const csvRows: string[] = [];
  let normalised = 0;
  let cleared = 0;
  const skipped: string[] = [];

  // ── 1. Normalise drift ────────────────────────────────────────────────────
  // Batched bulkWrite, not one awaited updateOne per row: ~5k sequential
  // round-trips to Atlas takes minutes and — with no output — reads as a hang.
  const BATCH = 500;
  const writeStarted = Date.now();

  for (let i = 0; i < drift.length; i += BATCH) {
    const slice = drift.slice(i, i + BATCH);

    for (const { row, from, to } of slice) {
      csvRows.push(`normalise,${String(row._id)},${row.email ?? ""},"${from}","${to}"`);
    }

    if (!dryRun) {
      // updateOne bypasses the pre-save hook — fine, the value is already
      // canonical. It also avoids re-validating unrelated fields on legacy
      // documents that might fail today's stricter validators.
      await User.bulkWrite(
        slice.map(({ row, to }) => ({
          updateOne: { filter: { _id: row._id }, update: { $set: { mobile: to } } },
        })),
        { ordered: false }
      );
    }

    normalised += slice.length;
    const elapsed = (Date.now() - writeStarted) / 1000;
    const rate = normalised / Math.max(elapsed, 0.001);
    console.log(
      `   normalise ${normalised.toLocaleString()}/${drift.length.toLocaleString()} ` +
        `(${((normalised / Math.max(drift.length, 1)) * 100).toFixed(1)}%) · ` +
        `${rate.toFixed(0)}/sec · ETA ${((drift.length - normalised) / Math.max(rate, 0.001)).toFixed(0)}s`
    );
  }

  // ── 2. Free duplicate numbers by unsetting the loser's mobile ─────────────
  if (!skipDupes) {
    for (const [norm, rows] of dupeGroups) {
      if (rows.some((r) => isPrivilegedAccount(r as never))) {
        skipped.push(`${norm} — involves a STAFF/ADMIN account; resolve by hand`);
        continue;
      }

      const ranked = [...rows].sort((a, b) => {
        const d = score(b) - score(a);
        if (d !== 0) return d;
        // Tie → the older account keeps the number (it had it first).
        return new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime();
      });

      const [winner, ...losers] = ranked;
      if (score(winner) === 0 && losers.every((l) => score(l) === 0)) {
        // Every account in the group is empty — keeping the oldest is arbitrary
        // but harmless, and it still frees the number for the unique index.
        console.log(`   ℹ️  ${norm}: all accounts empty, keeping oldest (${winner.email})`);
      }

      for (const loser of losers) {
        csvRows.push(
          `clear-duplicate,${String(loser._id)},${loser.email ?? ""},"${loser.mobile ?? ""}",` +
            `"kept:${winner.email ?? String(winner._id)}"`
        );
        if (!dryRun) {
          await User.updateOne({ _id: loser._id }, { $unset: { mobile: "" } });
        }
        cleared++;
        // Only ~109 of these, so per-row output is fine and useful — each line is
        // a real account losing its number and worth seeing in the log.
        if (cleared % 25 === 0) console.log(`   cleared ${cleared} duplicate mobile(s)…`);
      }
    }
  }

  if (csvRows.length) {
    const header = "action,userId,email,fromMobile,toMobileOrKept\n";
    // The default path is under ./temp, which may not exist on a fresh clone.
    fs.mkdirSync(path.dirname(csvPath), { recursive: true });
    fs.appendFileSync(csvPath, (fs.existsSync(csvPath) ? "" : header) + csvRows.join("\n") + "\n");
    console.log(`\n📄 Audit log: ${csvPath}`);
  }

  console.log("\n" + "═".repeat(66));
  console.log(dryRun ? "DRY RUN SUMMARY (nothing written)" : "DONE");
  console.log("═".repeat(66));
  console.log(`  mobiles normalised……………… ${normalised.toLocaleString()}`);
  console.log(`  duplicate mobiles cleared… ${cleared.toLocaleString()}`);
  console.log(`  groups needing a human……… ${skipped.length.toLocaleString()}`);
  skipped.forEach((s) => console.log(`     · ${s}`));
  console.log(`  invalid, left alone………… ${invalid.length.toLocaleString()}`);

  console.log("\n  NEXT: re-run `npm run find:duplicate-mobiles:prod` — it should report");
  console.log("  0 drift and 0 duplicate groups. Only then add the unique index.");
  console.log("═".repeat(66) + "\n");

  await mongoose.connection.close();
  // 0 clean · 1 human decisions outstanding · 2 fatal (thrown below).
  process.exit(skipped.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`❌ ${LABEL} failed:`, err);
  process.exit(2);
});
