#!/usr/bin/env npx tsx

/**
 * Find duplicate / unnormalised / invalid `User.mobile` values — READ-ONLY audit.
 *
 * WHY: `User.mobile` is about to become a LOGIN IDENTIFIER (SMS OTP login resolves the
 * account BY MOBILE). Today `mobile` is optional and carries only a plain index
 * (`UserSchema.index({ mobile: 1 })`) — NOT `unique` — and `/api/user/update-phone`
 * performs no uniqueness check at all. So before login-by-mobile can ship we must know:
 *
 *   1. DUPLICATES  — two accounts sharing a number make a mobile lookup ambiguous,
 *                    and resolving it wrongly is an account takeover.
 *   2. DRIFT       — the model's pre-save hook normalises to `+61…`, but it only runs
 *                    on save. Any doc written before the hook existed (or via a raw
 *                    `updateOne`, which bypasses `pre("save")`) can still hold `04…`.
 *                    A lookup on the normalised form silently MISSES those users —
 *                    they would appear to "not have an account".
 *   3. INVALID     — values that fail the schema validator (junk / landlines / overseas).
 *
 * It also reports email- and mobile-verification COVERAGE, because making both a profile
 * requirement has a per-member SMS cost and a support cost proportional to those counts.
 *
 * Usage:
 *   npm run find:duplicate-mobiles           # local/dev MONGODB_URI
 *   npm run find:duplicate-mobiles:prod      # PROD_MONGODB_URI (read-only)
 *   npx tsx scripts/find-duplicate-mobiles.ts --prod --csv ./dupe-mobiles.csv
 *
 * Options:
 *   --prod          Target PROD_MONGODB_URI instead of MONGODB_URI (see connect-ops-db).
 *   --csv <path>    Write one row per duplicate-group member. Default: no file.
 *   --limit <n>     Print at most n duplicate groups to stdout (default 25). The CSV
 *                   and all counts are always complete regardless of this.
 *
 * Safety:
 *   READ-ONLY. Issues only `countDocuments` and a projected `find`. Performs no writes,
 *   no index changes, and no Stripe/Klaviyo calls. Safe to run against production.
 *
 * Env:
 *   MONGODB_URI (or PROD_MONGODB_URI + optional PROD_DB_NAME with --prod)
 */

import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env.local") });

import fs from "fs";
import { connectOpsDb } from "./connect-ops-db";

const LABEL = "find:duplicate-mobiles";

/**
 * Mirror of the `User` schema's `pre("save")` mobile normalisation
 * (src/models/User.ts). Deliberately duplicated rather than imported: importing
 * `src/lib/sms.ts` would construct a Twilio client at module scope, and importing the
 * model's hook in isolation is not possible. If the model's hook changes, change this
 * too — the whole point of the DRIFT check is that the two must agree.
 */
function normaliseMobile(raw: string): string {
  const cleaned = raw.replace(/\s+/g, "");
  if (cleaned.startsWith("+61")) return cleaned;
  if (cleaned.startsWith("61")) return `+${cleaned}`;
  if (cleaned.startsWith("0")) return `+61${cleaned.substring(1)}`;
  if (cleaned.length === 9 && /^[4-5]/.test(cleaned)) return `+61${cleaned}`;
  return cleaned;
}

/** Mirror of the schema validator on `User.mobile`. */
function isValidMobile(raw: string): boolean {
  return /^(\+61|61|0)?[4-5]\d{8}$/.test(raw.replace(/\s+/g, ""));
}

interface UserRow {
  _id: unknown;
  email?: string;
  mobile?: string;
  isEmailVerified?: boolean;
  isMobileVerified?: boolean;
  accumulatedEntries?: number;
  stripeCustomerId?: string;
  userType?: string;
  roleId?: unknown;
  role?: string;
  createdAt?: Date;
  subscription?: { isActive?: boolean };
  oneTimePackages?: { isActive?: boolean }[];
}

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** An account worth preserving in a duplicate-group merge. */
function accountWeight(u: UserRow): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;
  if (u.subscription?.isActive) {
    score += 100;
    reasons.push("active-sub");
  }
  if (u.oneTimePackages?.some((p) => p.isActive)) {
    score += 50;
    reasons.push("active-pack");
  }
  if ((u.accumulatedEntries ?? 0) > 0) {
    score += 25;
    reasons.push(`entries=${u.accumulatedEntries}`);
  }
  if (u.stripeCustomerId) {
    score += 10;
    reasons.push("stripe-customer");
  }
  if (u.userType === "staff" || u.roleId || u.role === "admin") {
    score += 1000;
    reasons.push("PRIVILEGED");
  }
  if (score === 0) reasons.push("plain");
  return { score, reasons };
}

async function main() {
  const mongoose = await connectOpsDb(LABEL);
  const csvPath = argValue("--csv");
  const printLimit = Number(argValue("--limit") ?? 25);

  const User = (await import("../src/models/User")).default;

  console.log("\n📊 Counting…");
  const totalUsers = await User.countDocuments({});
  const withMobile = await User.countDocuments({ mobile: { $exists: true, $nin: [null, ""] } });
  const emailVerified = await User.countDocuments({ isEmailVerified: true });
  const mobileVerified = await User.countDocuments({ isMobileVerified: true });

  console.log(`   total users…………………… ${totalUsers.toLocaleString()}`);
  console.log(
    `   with a mobile……………… ${withMobile.toLocaleString()} (${((withMobile / Math.max(totalUsers, 1)) * 100).toFixed(1)}%)`
  );
  console.log(
    `   email verified………… ${emailVerified.toLocaleString()} (${((emailVerified / Math.max(totalUsers, 1)) * 100).toFixed(1)}%)`
  );
  console.log(
    `   mobile verified……… ${mobileVerified.toLocaleString()} (${((mobileVerified / Math.max(totalUsers, 1)) * 100).toFixed(1)}%)`
  );

  console.log(`\n🔍 Scanning ${withMobile.toLocaleString()} users with a mobile…`);

  // Explicit include-list projection — an unprojected find() on this collection ships
  // MB-scale `entries[]` arrays (see docs perf footgun #3).
  const cursor = User.find({ mobile: { $exists: true, $nin: [null, ""] } })
    .select(
      "email mobile isEmailVerified isMobileVerified accumulatedEntries stripeCustomerId userType roleId role createdAt subscription.isActive oneTimePackages.isActive"
    )
    .lean<UserRow[]>()
    .cursor();

  const byNormalised = new Map<string, UserRow[]>();
  const drift: UserRow[] = [];
  const invalid: UserRow[] = [];

  let processed = 0;
  const started = Date.now();
  // Adaptive cadence: ~20 progress lines regardless of collection size.
  const tick = Math.max(1, Math.floor(withMobile / 20));

  for await (const doc of cursor) {
    const u = doc as UserRow;
    const raw = (u.mobile ?? "").trim();
    processed++;

    if (raw) {
      if (!isValidMobile(raw)) invalid.push(u);
      const norm = normaliseMobile(raw);
      if (norm !== raw) drift.push(u);
      const bucket = byNormalised.get(norm);
      if (bucket) bucket.push(u);
      else byNormalised.set(norm, [u]);
    }

    if (processed % tick === 0 || processed === withMobile) {
      const elapsed = (Date.now() - started) / 1000;
      const rate = processed / Math.max(elapsed, 0.001);
      const eta = (withMobile - processed) / Math.max(rate, 0.001);
      console.log(
        `   ${processed.toLocaleString()}/${withMobile.toLocaleString()} ` +
          `(${((processed / Math.max(withMobile, 1)) * 100).toFixed(1)}%) · ` +
          `${rate.toFixed(0)}/sec · ETA ${eta.toFixed(0)}s`
      );
    }
  }

  const dupeGroups = [...byNormalised.entries()]
    .filter(([, rows]) => rows.length > 1)
    .sort((a, b) => b[1].length - a[1].length);

  const dupeAccounts = dupeGroups.reduce((n, [, rows]) => n + rows.length, 0);
  const privilegedInDupes = dupeGroups.filter(([, rows]) =>
    rows.some((r) => accountWeight(r).reasons.includes("PRIVILEGED"))
  );
  const contestedGroups = dupeGroups.filter(
    ([, rows]) => rows.filter((r) => accountWeight(r).score > 0).length > 1
  );

  console.log("\n" + "═".repeat(66));
  console.log("RESULTS");
  console.log("═".repeat(66));
  console.log(`duplicate mobile groups……………………… ${dupeGroups.length.toLocaleString()}`);
  console.log(`  accounts involved……………………………… ${dupeAccounts.toLocaleString()}`);
  console.log(`  ⚠️  CONTESTED (2+ with real value)… ${contestedGroups.length.toLocaleString()}`);
  console.log(`  🚨 involving a PRIVILEGED account… ${privilegedInDupes.length.toLocaleString()}`);
  console.log(`unnormalised (stored ≠ +61 form)…… ${drift.length.toLocaleString()}`);
  console.log(`invalid per schema validator……………… ${invalid.length.toLocaleString()}`);

  if (dupeGroups.length) {
    console.log(`\n── duplicate groups (showing ${Math.min(printLimit, dupeGroups.length)}) ──`);
    for (const [norm, rows] of dupeGroups.slice(0, printLimit)) {
      console.log(`\n  ${norm}  ×${rows.length}`);
      for (const r of rows) {
        const { score, reasons } = accountWeight(r);
        console.log(
          `    · ${String(r.email ?? "(no email)").padEnd(38)} ` +
            `score=${String(score).padStart(4)} [${reasons.join(", ")}] ` +
            `emailVerified=${r.isEmailVerified ? "y" : "n"} raw="${r.mobile}"`
        );
      }
    }
  }

  if (drift.length) {
    console.log(`\n── unnormalised sample (first 10 of ${drift.length}) ──`);
    for (const u of drift.slice(0, 10)) {
      console.log(`    · ${u.email} stored="${u.mobile}" → would normalise to "${normaliseMobile(u.mobile!)}"`);
    }
    console.log(
      "\n  ⚠️  These users would NOT be found by a login lookup on the normalised form.\n" +
        "     They must be normalised BEFORE login-by-mobile ships."
    );
  }

  if (invalid.length) {
    console.log(`\n── invalid sample (first 10 of ${invalid.length}) ──`);
    for (const u of invalid.slice(0, 10)) console.log(`    · ${u.email} mobile="${u.mobile}"`);
  }

  if (csvPath) {
    const header = "normalised,rawMobile,email,score,reasons,emailVerified,mobileVerified,createdAt,userId\n";
    const body = dupeGroups
      .flatMap(([norm, rows]) =>
        rows.map((r) => {
          const { score, reasons } = accountWeight(r);
          return [
            norm,
            r.mobile ?? "",
            r.email ?? "",
            score,
            `"${reasons.join("; ")}"`,
            r.isEmailVerified ? "y" : "n",
            r.isMobileVerified ? "y" : "n",
            r.createdAt ? new Date(r.createdAt).toISOString() : "",
            String(r._id),
          ].join(",");
        })
      )
      .join("\n");
    fs.appendFileSync(csvPath, fs.existsSync(csvPath) ? body + "\n" : header + body + "\n");
    console.log(`\n📄 CSV written: ${csvPath}`);
  }

  console.log("\n" + "═".repeat(66));
  const blocking = contestedGroups.length + privilegedInDupes.length + drift.length;
  if (blocking === 0 && dupeGroups.length === 0) {
    console.log("✅ CLEAR — mobile is de-facto unique and normalised. A unique+sparse");
    console.log("   index can be added directly.");
  } else if (contestedGroups.length === 0 && privilegedInDupes.length === 0) {
    console.log("🟡 SOFT — duplicates exist but each group has at most one account of");
    console.log("   real value; the plain siblings can be merged/cleared mechanically.");
    if (drift.length) console.log("   Unnormalised rows must still be backfilled first.");
  } else {
    console.log("🔴 BLOCKED — contested and/or privileged duplicate groups require a");
    console.log("   human decision per group before mobile can become a login identifier.");
  }
  console.log("═".repeat(66) + "\n");

  await mongoose.connection.close();
  // 3-tier exit: 0 clear · 1 needs mechanical cleanup · 2 needs human decisions.
  process.exit(
    contestedGroups.length || privilegedInDupes.length ? 2 : dupeGroups.length || drift.length ? 1 : 0
  );
}

main().catch((err) => {
  console.error(`❌ ${LABEL} failed:`, err);
  process.exit(1);
});
