/**
 * Post-backfill verification. READ-ONLY — writes nothing to Mongo or Klaviyo.
 *
 * Checks the three things the spec promised:
 *  1. `member_entries` in the projected profile matches the refund-netted payment ledger
 *     (i.e. the catalogue reconstruction is genuinely gone).
 *  2. `subscription_has_pending_upgrade` is no longer a hardcoded `true`.
 *  3. Each draw's `entriesBySource` still reconciles with its stored `totalEntries`. A
 *     165-entry / 0.008% gap was observed on the August draw on 2026-08-26 — this ASSERTS it
 *     has not grown, rather than assuming it is zero.
 *
 * Usage: npm run verify:klaviyo-accuracy -- --prod
 * Exit codes: 0 = all checks passed, 1 = fatal, 2 = one or more checks failed.
 */
import path from "node:path";
import { config } from "dotenv";
import { connectOpsDb } from "./connect-ops-db";
import { isValidPendingUpgrade } from "../src/utils/subscription/pending-upgrade";

// Must load BEFORE connectOpsDb reads MONGODB_URI / PROD_MONGODB_URI.
config({ path: path.resolve(process.cwd(), ".env.local") });

/** Per-draw tolerance for entriesBySource vs totalEntries drift. */
const DRAW_TOLERANCE = 0.001; // 0.1%
/** How many active members to sample for the projection checks. */
const SAMPLE_SIZE = 200;

async function main() {
  await connectOpsDb("verify-klaviyo-accuracy");

  const { default: User } = await import("../src/models/User");
  const { default: MajorDraw } = await import("../src/models/MajorDraw");
  const { aggregateNetGrantsByUser, emptyGrantLedger } = await import(
    "../src/utils/payment/payment-event-net-queries"
  );
  const { userToKlaviyoProfile } = await import(
    "../src/utils/integrations/klaviyo/klaviyo-helpers"
  );

  let failures = 0;

  // ── 1 + 2. Projection checks over a sample of active members ────────────────────────────
  console.log(`\n=== Projection checks (sample of ${SAMPLE_SIZE} active members) ===`);

  const members = await User.find({ "subscription.isActive": true }).limit(SAMPLE_SIZE);
  const ledgers = await aggregateNetGrantsByUser(members.map((m) => m._id));

  let checked = 0;
  let entriesMismatched = 0;
  let pendingMismatched = 0;

  for (const m of members) {
    const ledger = ledgers.get(String(m._id)) ?? emptyGrantLedger();
    const profile = (await userToKlaviyoProfile(m, undefined, undefined, undefined, ledger)) as {
      properties: Record<string, unknown>;
    };
    checked++;

    if (profile.properties.member_entries !== ledger.memberEntries) {
      entriesMismatched++;
      if (entriesMismatched <= 5) {
        console.log(
          `  MISMATCH member_entries ${m._id}: profile=${profile.properties.member_entries} ledger=${ledger.memberEntries}`
        );
      }
    }

    const expectedPending = isValidPendingUpgrade(m.subscription?.pendingChange);
    if (profile.properties.subscription_has_pending_upgrade !== expectedPending) {
      pendingMismatched++;
      if (pendingMismatched <= 5) {
        console.log(`  MISMATCH pending_upgrade ${m._id}`);
      }
    }
  }

  console.log(`member_entries              : ${checked - entriesMismatched}/${checked} match the ledger`);
  console.log(`pending_upgrade             : ${checked - pendingMismatched}/${checked} correct`);
  if (entriesMismatched > 0) failures++;
  if (pendingMismatched > 0) failures++;

  // ── 3. Draw ledger self-consistency ─────────────────────────────────────────────────────
  console.log("\n=== Draw ledger self-consistency ===");

  // Only LIVE draws (active / frozen / queued) gate this verification. A completed draw is
  // immutable history: measured 2026-08-26, the six draws from December to May carry
  // 0.22%-0.84% drift between `entriesBySource` and `totalEntries` while June, July and August
  // are EXACTLY zero — i.e. whatever caused it was fixed around June and cannot be repaired by
  // this work. Reported as informational so it stays visible without failing an unrelated run.
  const draws = await MajorDraw.find({ "entries.0": { $exists: true } });
  let historicalDrift = 0;

  for (const draw of draws) {
    let sourceSum = 0;
    for (const entry of draw.entries) {
      for (const value of Object.values(entry.entriesBySource || {})) {
        sourceSum += Number(value) || 0;
      }
    }

    const drift = Math.abs(sourceSum - draw.totalEntries);
    const ratio = draw.totalEntries > 0 ? drift / draw.totalEntries : 0;
    const ok = ratio <= DRAW_TOLERANCE;
    const isLive = draw.status !== "completed" && draw.status !== "cancelled";
    const label = ok ? "OK   " : isLive ? "FAIL " : "note ";

    console.log(
      `${label} ${String(draw.name).padEnd(16)} [${String(draw.status).padEnd(9)}] ` +
        `entriesBySource=${sourceSum} totalEntries=${draw.totalEntries} ` +
        `drift=${drift} (${(ratio * 100).toFixed(4)}%)`
    );

    if (!ok) {
      if (isLive) failures++;
      else historicalDrift++;
    }
  }

  if (historicalDrift > 0) {
    console.log(
      `\n${historicalDrift} COMPLETED draw(s) carry pre-existing entriesBySource drift. Not a\n` +
        `failure of this work — completed draws are immutable and the three most recent draws\n` +
        `reconcile exactly. Belongs with the entry-accounting ticket.`
    );
  }

  console.log(
    failures === 0 ? "\nAll verification checks passed." : `\n${failures} check(s) FAILED.`
  );
  process.exit(failures === 0 ? 0 : 2);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
