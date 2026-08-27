/**
 * Find members who redeemed the cancellation retention offer but never received the
 * 100 draw entries it promised them. READ-ONLY — writes nothing.
 *
 * THE BUG (fixed forward in `src/app/api/cancellation-upsell/redeem/route.ts`):
 * the redeem route performed two writes —
 *   1. `$inc accumulatedEntries: 100` and set `cancellationUpsellRedeemed: true`
 *   2. `addToMajorDraw(...)`
 * — and step 2 opened with `MajorDraw.findOne({ isActive: true })`, returning SILENTLY when
 * that found nothing. The customer's counter went up, the API replied "100 free entries
 * successfully added to your account", and no draw ever received the entries.
 *
 * A member is reported here when they carry `cancellationUpsellRedeemed: true` but have zero
 * `entriesBySource["cancellation-upsell"]` across every major draw.
 *
 * Usage:
 *   npm run find:missing-retention-entries -- --prod
 *   npm run find:missing-retention-entries -- --prod --csv
 *
 * Exit codes: 0 = none found, 1 = fatal, 2 = affected members found.
 */
import fs from "node:fs";
import path from "node:path";
import { config } from "dotenv";
import { connectOpsDb } from "./connect-ops-db";

config({ path: path.resolve(process.cwd(), ".env.local") });

const WRITE_CSV = process.argv.includes("--csv");
const CSV_PATH = path.join(process.cwd(), "missing-retention-entries.csv");
const ENTRIES_PROMISED = 100;

async function main() {
  await connectOpsDb("find-missing-retention-entries");

  const { default: User } = await import("../src/models/User");
  const { default: MajorDraw } = await import("../src/models/MajorDraw");

  // Every user who has ever been credited retention entries in ANY draw.
  const draws = await MajorDraw.find({ "entries.0": { $exists: true } }).select("name entries");
  const creditedInDraw = new Set<string>();
  for (const draw of draws) {
    for (const entry of draw.entries) {
      if ((entry.entriesBySource?.["cancellation-upsell"] ?? 0) > 0) {
        creditedInDraw.add(String(entry.userId));
      }
    }
  }

  const redeemers = await User.find({ cancellationUpsellRedeemed: true }).select(
    "email firstName accumulatedEntries cancellationUpsellRedeemedAt subscription.status"
  );

  const affected = redeemers.filter((u) => !creditedInDraw.has(String(u._id)));

  console.log("\n=== Retention offer: promised entries that never reached a draw ===");
  console.log(`redeemed the offer          : ${redeemers.length}`);
  console.log(`received their draw entries : ${redeemers.length - affected.length}`);
  console.log(`NEVER received them         : ${affected.length}`);
  console.log(`entries owed if ever granted: ${(affected.length * ENTRIES_PROMISED).toLocaleString()}`);

  // Redemption dates tell you which draws were affected — useful for confirming the
  // silent-skip window lines up with draw transitions.
  const byMonth = new Map<string, number>();
  for (const u of affected) {
    const d = u.cancellationUpsellRedeemedAt;
    const key = d ? `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}` : "unknown";
    byMonth.set(key, (byMonth.get(key) ?? 0) + 1);
  }
  console.log("\naffected by redemption month (UTC):");
  [...byMonth.entries()].sort().forEach(([m, n]) => console.log(`  ${m}  ${String(n).padStart(4)}`));

  console.log("\nfirst 15 affected members:");
  affected.slice(0, 15).forEach((u) =>
    console.log(
      `  ${String(u._id)}  ${String(u.firstName ?? "").padEnd(14)} ` +
        `redeemed=${u.cancellationUpsellRedeemedAt?.toISOString().slice(0, 10) ?? "-"} ` +
        `status=${String(u.subscription?.status ?? "-").padEnd(10)} acc=${u.accumulatedEntries ?? 0}`
    )
  );

  if (WRITE_CSV) {
    const rows = [
      "userId,email,firstName,redeemedAt,subscriptionStatus,accumulatedEntries,entriesOwed",
      ...affected.map((u) =>
        [
          String(u._id),
          u.email ?? "",
          (u.firstName ?? "").replace(/,/g, " "),
          u.cancellationUpsellRedeemedAt?.toISOString() ?? "",
          u.subscription?.status ?? "",
          u.accumulatedEntries ?? 0,
          ENTRIES_PROMISED,
        ].join(",")
      ),
    ];
    fs.writeFileSync(CSV_PATH, rows.join("\n") + "\n");
    console.log(`\nCSV written: ${CSV_PATH} (${affected.length} rows)`);
    console.log("Contains customer emails — treat as PII, do not commit.");
  } else {
    console.log("\nRe-run with --csv to write the full list to a file.");
  }

  process.exit(affected.length > 0 ? 2 : 0);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
