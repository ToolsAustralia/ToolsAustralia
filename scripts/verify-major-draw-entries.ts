#!/usr/bin/env npx tsx

/**
 * Verify Major Draw Entries — entry & multiplier audit for the active major draw.
 *
 * READ-ONLY. For every participant in the active MajorDraw (the current
 * Apr 28 → May 27 window), it reconciles three things:
 *
 *   1. Payment → entry linkage. Replays each user's PaymentEvent ledger
 *      (BenefitsGranted / UpsellProcessed minus RefundProcessed / RefundPartial),
 *      keeps only `drawGrants` pointing at the active draw, and compares the
 *      expected per-source breakdown against the live `entriesBySource` on the
 *      draw. Surfaces missing / double-counted / silently-dropped entries.
 *
 *   2. Internal consistency. Flags any draw row where
 *      `sum(entriesBySource) !== totalEntries`.
 *
 *   3. Multiplier correctness (the core ask). For each package payment that
 *      granted entries to the active draw, computes the APPLIED multiplier
 *      (`grantedEntries / staticPackageBase`) and compares it against the
 *      SCHEDULED grid multiplier that should have applied on the purchase date,
 *      replaying the real rules:
 *        - membership  → membership-packages grid for that date
 *        - one-time    → one-time-packages grid; else derived from membership
 *                        (10→5, 5→3, 3/2→2); member-only one-time bought by a
 *                        member uses the membership grid
 *        - membership RENEWALS are cumulative (lastMonthAccum + base), so they
 *          are reported but not hard-failed on the multiplier check
 *        - upsell / mini multipliers are reported as INFO (category multiplier
 *          not replayed here)
 *
 * Two CSVs are written (unless --dry-run): a per-participant summary and a
 * per-payment multiplier detail.
 *
 * Usage:
 *   npx tsx scripts/verify-major-draw-entries.ts
 *   npm run verify:major-draw-entries
 *   npm run verify:major-draw-entries:dry      # console summary only, no files
 *
 *   Options (positional `--key=value`):
 *     --drawId=<id>     Audit a specific MajorDraw _id instead of the active one.
 *     --userId=<id>     Limit to a single participant by ObjectId.
 *     --email=<addr>    Limit to a single participant by email (case-insensitive).
 *     --limit=<n>       Only audit the first N participants (smoke test).
 *     --out-dir=<path>  Where to write CSVs. Default: temp/readonly/
 *     --dry-run         Do not write CSV files; print summary only.
 *     --verbose         Print OK rows too, not just flagged ones.
 *
 * Safety: read-only. No database writes are performed.
 * Env: MONGODB_URI (from .env.local).
 */

import { config } from "dotenv";
import path from "path";
import fs from "fs";
import mongoose from "mongoose";
import { formatInTimeZone } from "date-fns-tz";

config({ path: path.resolve(process.cwd(), ".env.local") });

const SYDNEY_TZ = "Australia/Sydney";

// ── arg parsing ────────────────────────────────────────────────────────────
function parseArg(name: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
  return arg ? arg.split("=").slice(1).join("=") : undefined;
}
const ARG_DRAW_ID = parseArg("drawId");
const ARG_USER_ID = parseArg("userId");
const ARG_EMAIL = parseArg("email");
const ARG_LIMIT = parseArg("limit") ? parseInt(parseArg("limit") as string, 10) : undefined;
const OUT_DIR = parseArg("out-dir") ?? path.resolve(process.cwd(), "temp", "readonly");
const DRY_RUN = process.argv.includes("--dry-run");
const VERBOSE = process.argv.includes("--verbose");

// ── ledger / draw types (raw collection shapes) ─────────────────────────────
type DrawGrant = { kind: string; drawId: string; sourceKey: string; entries: number };
type EventRow = {
  _id: string;
  eventType: string;
  userId: mongoose.Types.ObjectId;
  paymentIntentId: string;
  packageType: string; // one-time | membership | upsell | mini-draw
  packageId?: string;
  packageName?: string;
  data: {
    entries?: number;
    grants?: { drawGrants?: DrawGrant[]; calculationType?: string };
    reversed?: { entries?: number; packageType?: string };
    [k: string]: unknown;
  };
  timestamp: Date;
};
type DrawEntryRow = {
  userId: { toString(): string };
  totalEntries: number;
  entriesBySource: Record<string, number>;
};
type PromoRow = {
  type: string;
  multiplier: number;
  startDate: Date;
  endDate: Date;
  createdAt: Date;
  isActive?: boolean;
  deletedAt?: Date | null;
};

function eventToSourceKey(packageType: string): string | null {
  switch (packageType) {
    case "membership":
      return "membership";
    case "one-time":
      return "one-time-package";
    case "upsell":
      return "upsell";
    case "mini-draw":
      return "mini-draw";
    default:
      return null;
  }
}

function deriveOneTimeFromMembership(m: number): number {
  switch (m) {
    case 10:
      return 5;
    case 5:
      return 3;
    case 3:
    case 2:
      return 2;
    default:
      return m;
  }
}

/**
 * Point-in-time scheduled grid resolution: newest createdAt among phases that
 * cover `instant`. When `asOfMs` is given, only phases that already EXISTED at
 * that moment (createdAt <= asOfMs) are considered — this reconstructs what the
 * webhook would have resolved at purchase time, vs. the grid as it stands now.
 */
function resolveGrid(
  promos: PromoRow[],
  fullType: string,
  instant: Date,
  asOfMs?: number
): number | null {
  const t = instant.getTime();
  let candidates = promos.filter(
    (p) => p.type === fullType && p.startDate.getTime() <= t && p.endDate.getTime() >= t
  );
  if (asOfMs != null) {
    candidates = candidates.filter((p) => new Date(p.createdAt).getTime() <= asOfMs);
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return candidates[0].multiplier;
}

/** Legitimate one-time multiplier(s) for a given grid state (own grid → else derived). */
function expectedOneTime(
  oneTimeGrid: number | null,
  membershipGrid: number | null,
  memberOnly: boolean
): Set<number> {
  const legit = new Set<number>();
  if (oneTimeGrid != null) legit.add(oneTimeGrid);
  else if (membershipGrid != null && membershipGrid > 1) legit.add(deriveOneTimeFromMembership(membershipGrid));
  else legit.add(1);
  if (memberOnly && membershipGrid != null) legit.add(membershipGrid); // member bought as member
  return legit;
}
function fmtSet(s: Set<number>): string {
  return Array.from(s).sort((a, b) => a - b).map((m) => `${m}x`).join(" or ");
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function csvRow(cells: Array<string | number>): string {
  return cells.map(csvCell).join(",");
}

async function main(): Promise<void> {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set (.env.local).");
    process.exit(1);
  }

  // Pure, client-safe helpers (no mongoose) — safe to import in a script.
  const { getPackageBaseEntries } = await import("../src/utils/payment/package-base-entries");
  const { isMemberOnlyPackageById } = await import("../src/utils/promo/get-effective-promo-type");

  const connectDB = (await import("../src/lib/mongodb")).default;
  await connectDB();
  const db = mongoose.connection.db;
  if (!db) {
    console.error("Mongo connection is not ready");
    process.exit(1);
  }

  const usersColl = db.collection("users");
  const eventsColl = db.collection<EventRow>("paymentevents");
  const drawsColl = db.collection("majordraws");
  const promosColl = db.collection("scheduledpromos");

  // 1. Resolve the target draw.
  let draw: Record<string, unknown> | null;
  if (ARG_DRAW_ID) {
    draw = await drawsColl.findOne({ _id: new mongoose.Types.ObjectId(ARG_DRAW_ID) });
  } else {
    draw = await drawsColl.findOne({ status: "active" }, { sort: { activationDate: -1 } });
  }
  if (!draw) {
    console.error("No active MajorDraw found (and no --drawId given).");
    process.exit(1);
  }
  const drawId = (draw._id as mongoose.Types.ObjectId).toString();
  const fmt = (d: unknown) => (d ? formatInTimeZone(new Date(d as Date), SYDNEY_TZ, "yyyy-MM-dd HH:mm zzz") : "—");
  console.error("══════════════════════════════════════════════════════════════");
  console.error(`Active major draw: ${String(draw.name)}  (${drawId})`);
  console.error(`  status:        ${String(draw.status)}`);
  console.error(`  activation:    ${fmt(draw.activationDate)}`);
  console.error(`  freeze:        ${fmt(draw.freezeEntriesAt)}`);
  console.error(`  draw date:     ${fmt(draw.drawDate)}`);
  console.error(`  totalEntries:  ${Number(draw.totalEntries ?? 0)}`);

  const drawEntries = (draw.entries as DrawEntryRow[]) ?? [];
  console.error(`  participants:  ${drawEntries.length}`);

  // 2. Preload scheduled-promo phases overlapping the draw window (+ margin).
  const winStart = new Date(new Date(draw.activationDate as Date).getTime() - 3 * 24 * 3600 * 1000);
  const winEnd = new Date(new Date(draw.drawDate as Date).getTime() + 1 * 24 * 3600 * 1000);
  // allPhases (incl. soft-deleted) → used for "as of purchase" historical replay.
  // activePhases (live grid)        → used for "now" / the photo comparison.
  const allPhases = (await promosColl
    .find({ startDate: { $lte: winEnd }, endDate: { $gte: winStart } })
    .toArray()) as unknown as PromoRow[];
  const activePhases = allPhases.filter((p) => p.isActive !== false && p.deletedAt == null);
  console.error(
    `  scheduled-promo phases overlapping window: ${activePhases.length} active / ${allPhases.length} incl. soft-deleted ` +
      `(active membership=${activePhases.filter((p) => p.type === "membership-packages").length}, ` +
      `one-time=${activePhases.filter((p) => p.type === "one-time-packages").length}, ` +
      `mini=${activePhases.filter((p) => p.type === "mini-packages").length})`
  );
  console.error("══════════════════════════════════════════════════════════════");

  // 2b. Optional grid dump: resolved multiplier per AEST day (DB vs your photo).
  if (process.argv.includes("--dump-grid")) {
    console.error("Membership scheduled-promo phases (start → end = mult, createdAt), AEST:");
    const memPhases = allPhases
      .filter((p) => p.type === "membership-packages")
      .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    for (const p of memPhases) {
      const deleted = p.isActive === false || p.deletedAt != null ? "  [soft-deleted]" : "";
      console.error(
        `  ${formatInTimeZone(p.startDate, SYDNEY_TZ, "MM-dd HH:mm")} → ${formatInTimeZone(
          p.endDate,
          SYDNEY_TZ,
          "MM-dd HH:mm"
        )} = ${p.multiplier}x   (created ${formatInTimeZone(new Date(p.createdAt), SYDNEY_TZ, "MM-dd HH:mm")})${deleted}`
      );
    }
    console.error("──────────────────────────────────────────────────────────────");
    console.error("Per-day scheduled grid (current state), AEST:");
    const start = new Date(draw.activationDate as Date);
    const end = new Date(draw.drawDate as Date);
    for (let d = new Date(start); d <= end; d = new Date(d.getTime() + 24 * 3600 * 1000)) {
      const noonAEST = new Date(
        new Date(formatInTimeZone(d, SYDNEY_TZ, "yyyy-MM-dd") + "T12:00:00+10:00").getTime()
      );
      const key = formatInTimeZone(noonAEST, SYDNEY_TZ, "yyyy-MM-dd EEE");
      const mem = resolveGrid(activePhases, "membership-packages", noonAEST);
      const ot = resolveGrid(activePhases, "one-time-packages", noonAEST);
      const mini = resolveGrid(activePhases, "mini-packages", noonAEST);
      console.error(
        `  ${key}  membership=${mem ?? "—"}x  one-time=${ot ?? (mem ? deriveOneTimeFromMembership(mem) + " (derived)" : "—")}x  mini=${mini ?? "—"}x`
      );
    }
    console.error("══════════════════════════════════════════════════════════════");
  }

  // 3. Build participant id list.
  let participantIds: mongoose.Types.ObjectId[];
  if (ARG_USER_ID) {
    participantIds = [new mongoose.Types.ObjectId(ARG_USER_ID)];
  } else if (ARG_EMAIL) {
    const u = await usersColl.findOne(
      { email: { $regex: `^${ARG_EMAIL}$`, $options: "i" } },
      { projection: { _id: 1 } }
    );
    if (!u) {
      console.error(`No user found with email ${ARG_EMAIL}`);
      process.exit(1);
    }
    participantIds = [u._id as mongoose.Types.ObjectId];
  } else {
    participantIds = drawEntries.map((e) => new mongoose.Types.ObjectId(e.userId.toString()));
    if (ARG_LIMIT) participantIds = participantIds.slice(0, ARG_LIMIT);
  }

  const liveByUser = new Map<string, DrawEntryRow>();
  for (const e of drawEntries) liveByUser.set(e.userId.toString(), e);

  // ── output rows ───────────────────────────────────────────────────────────
  const summaryRows: string[] = [];
  summaryRows.push(
    csvRow([
      "email",
      "userId",
      "liveTotal",
      "liveBreakdown",
      "ledgerTotal",
      "ledgerBreakdown",
      "ledgerVsLiveDelta",
      "sumVsTotalDelta",
      "accumulatedEntries",
      "paymentsToThisDraw",
      "multiplierFlags",
      "verdict",
    ])
  );
  const detailRows: string[] = [];
  detailRows.push(
    csvRow([
      "email",
      "userId",
      "paymentIntentId",
      "packageType",
      "packageId",
      "packageName",
      "purchaseDateAEST",
      "calcType",
      "staticBase",
      "grantedEntries",
      "appliedMultiplier",
      "gridAtBuy",
      "gridNow",
      "expectedAtBuy",
      "verdict",
    ])
  );

  let inspected = 0;
  let usersWithAnyFlag = 0;
  let consistencyMismatches = 0;
  let multiplierMismatches = 0;
  let gridLatePayments = 0;
  let ledgerMismatches = 0;

  for (const userId of participantIds) {
    inspected++;
    if (inspected % 50 === 0) console.error(`  …inspected ${inspected}/${participantIds.length}`);

    const user = await usersColl.findOne(
      { _id: userId },
      { projection: { email: 1, accumulatedEntries: 1 } }
    );
    const email = (user?.email as string) ?? "";
    const accumulated = Number(user?.accumulatedEntries ?? 0);

    const live = liveByUser.get(userId.toString());

    // 4. Replay this user's ledger for the target draw only.
    const events = (await eventsColl.find({ userId }).sort({ timestamp: 1 }).toArray()) as EventRow[];

    const ledgerBySource: Record<string, number> = {};
    let ledgerTotal = 0;
    const bump = (key: string, delta: number) => {
      ledgerBySource[key] = (ledgerBySource[key] ?? 0) + delta;
      ledgerTotal += delta;
    };

    const packagePayments: EventRow[] = [];

    for (const ev of events) {
      if (ev.eventType === "BenefitsGranted" || ev.eventType === "UpsellProcessed") {
        const grants = ev.data.grants?.drawGrants ?? [];
        const grantsForDraw = grants.filter((g) => g.kind === "major" && g.drawId === drawId);
        if (grantsForDraw.length) {
          for (const g of grantsForDraw) bump(g.sourceKey, g.entries);
          packagePayments.push(ev);
        }
      } else if (ev.eventType === "RefundProcessed" || ev.eventType === "RefundPartial") {
        const grant = events.find(
          (e) =>
            (e.eventType === "BenefitsGranted" || e.eventType === "UpsellProcessed") &&
            e.paymentIntentId === ev.paymentIntentId
        );
        const grants = (grant?.data.grants?.drawGrants ?? []).filter(
          (g) => g.kind === "major" && g.drawId === drawId
        );
        for (const g of grants) bump(g.sourceKey, -g.entries);
      }
    }

    // 5. Compare ledger vs live for this draw.
    const liveBreakdown = live?.entriesBySource ?? {};
    const liveTotal = live?.totalEntries ?? 0;
    const allKeys = new Set<string>([...Object.keys(ledgerBySource), ...Object.keys(liveBreakdown)]);
    const sourceDeltas: string[] = [];
    let ledgerVsLiveDelta = 0;
    for (const k of allKeys) {
      const l = ledgerBySource[k] ?? 0;
      const a = Number(liveBreakdown[k] ?? 0);
      if (l !== a) {
        sourceDeltas.push(`${k}:ledger=${l} live=${a} (Δ${a - l})`);
        ledgerVsLiveDelta += a - l;
      }
    }
    const sumOfLive = Object.values(liveBreakdown).reduce((s, v) => s + (Number(v) || 0), 0);
    const sumVsTotalDelta = sumOfLive - liveTotal;

    // 6. Multiplier replay per package payment.
    const flags: string[] = [];
    for (const ev of packagePayments) {
      const sourceKey = eventToSourceKey(ev.packageType);
      const grantsForDraw = (ev.data.grants?.drawGrants ?? []).filter(
        (g) => g.kind === "major" && g.drawId === drawId && g.sourceKey === sourceKey
      );
      const grantedEntries = grantsForDraw.reduce((s, g) => s + g.entries, 0);
      const calcType = ev.data.grants?.calculationType ?? "";
      const purchaseInstant = new Date(ev.timestamp);
      const purchaseAEST = formatInTimeZone(purchaseInstant, SYDNEY_TZ, "yyyy-MM-dd HH:mm");

      const buyMs = purchaseInstant.getTime();
      // Grid as it stood at purchase (faithful to what the webhook resolved)…
      const memGridAtBuy = resolveGrid(allPhases, "membership-packages", purchaseInstant, buyMs);
      const oneTimeGridAtBuy = resolveGrid(allPhases, "one-time-packages", purchaseInstant, buyMs);
      const miniGridAtBuy = resolveGrid(allPhases, "mini-packages", purchaseInstant, buyMs);
      // …vs. the grid as it stands now (what the photo shows).
      const memGridNow = resolveGrid(activePhases, "membership-packages", purchaseInstant);
      const oneTimeGridNow = resolveGrid(activePhases, "one-time-packages", purchaseInstant);

      let staticBase = 0;
      if (ev.packageId && (ev.packageType === "one-time" || ev.packageType === "membership")) {
        staticBase = getPackageBaseEntries({
          packageId: ev.packageId,
          packageType: ev.packageType === "membership" ? "membership" : "one-time",
        });
      } else if (ev.packageId && ev.packageType === "mini-draw") {
        staticBase = getPackageBaseEntries({ packageId: ev.packageId, packageType: "mini-draw" });
      }

      const appliedMultiplier = staticBase > 0 ? grantedEntries / staticBase : NaN;
      const matches = (set: Set<number>) =>
        [...set].some((m) => Math.abs(m - appliedMultiplier) < 0.001);

      let expectedStr = "";
      let gridAtBuyStr = "";
      let gridNowStr = "";
      let verdict = "INFO";

      if (ev.packageType === "one-time") {
        const memberOnly = ev.packageId ? isMemberOnlyPackageById(ev.packageId) : false;
        const expAtBuy = expectedOneTime(oneTimeGridAtBuy, memGridAtBuy, memberOnly);
        const expNow = expectedOneTime(oneTimeGridNow, memGridNow, memberOnly);
        const gridExistedAtBuy = oneTimeGridAtBuy != null || memGridAtBuy != null;
        gridAtBuyStr = `mem=${memGridAtBuy ?? "—"}|ot=${oneTimeGridAtBuy ?? "—"}`;
        gridNowStr = `mem=${memGridNow ?? "—"}|ot=${oneTimeGridNow ?? "—"}`;
        expectedStr = fmtSet(expAtBuy);
        if (staticBase <= 0) verdict = "BASE_UNKNOWN";
        else if (gridExistedAtBuy) {
          // Grid was painted at purchase time → it must have been applied.
          verdict = matches(expAtBuy) ? "OK" : "MULTIPLIER_MISMATCH";
        } else if (matches(expNow)) {
          // No grid at buy, but what was applied already equals today's grid.
          verdict = "OK";
        } else {
          // No grid at buy; today's grid implies a different (higher) multiplier
          // → buyer got the as-of-purchase default (usually 1x), under-credited
          // relative to the grid you later painted for that day. Informational.
          verdict = "NO_GRID_AT_PURCHASE";
          expectedStr = `${fmtSet(expNow)} (today's grid; got ${
            Number.isNaN(appliedMultiplier) ? "?" : appliedMultiplier
          }x at buy)`;
        }
      } else if (ev.packageType === "membership") {
        const expectedAtBuy = memGridAtBuy ?? 1;
        gridAtBuyStr = `mem=${memGridAtBuy ?? "—"}`;
        gridNowStr = `mem=${memGridNow ?? "—"}`;
        expectedStr = `${expectedAtBuy}x`;
        if (calcType === "renewal") verdict = "RENEWAL_CUMULATIVE";
        else if (staticBase <= 0) verdict = "BASE_UNKNOWN";
        else if (Math.abs(expectedAtBuy - appliedMultiplier) < 0.001) verdict = "OK";
        else verdict = "REVIEW"; // initial/upgrade/resubscribe variants — eyeball
      } else if (ev.packageType === "mini-draw") {
        gridAtBuyStr = `mini=${miniGridAtBuy ?? "—"}`;
        expectedStr = `${miniGridAtBuy ?? 1}x`;
        verdict = "INFO";
      } else {
        verdict = "INFO"; // upsell — category multiplier not replayed
      }

      if (verdict === "MULTIPLIER_MISMATCH" || verdict === "NO_GRID_AT_PURCHASE") {
        flags.push(
          `${ev.packageId ?? ev.packageType}@${purchaseAEST}: applied=${
            Number.isNaN(appliedMultiplier) ? "?" : appliedMultiplier
          }x expected=${expectedStr}${verdict === "NO_GRID_AT_PURCHASE" ? " [grid painted after purchase]" : ""}`
        );
        if (verdict === "MULTIPLIER_MISMATCH") multiplierMismatches++;
        else gridLatePayments++;
      }

      if (
        VERBOSE ||
        verdict === "MULTIPLIER_MISMATCH" ||
        verdict === "NO_GRID_AT_PURCHASE" ||
        verdict === "REVIEW" ||
        verdict === "BASE_UNKNOWN"
      ) {
        detailRows.push(
          csvRow([
            email,
            userId.toString(),
            ev.paymentIntentId,
            ev.packageType,
            ev.packageId ?? "",
            ev.packageName ?? "",
            purchaseAEST,
            calcType,
            staticBase,
            grantedEntries,
            Number.isNaN(appliedMultiplier) ? "" : Number(appliedMultiplier.toFixed(3)),
            gridAtBuyStr,
            gridNowStr,
            expectedStr,
            verdict,
          ])
        );
      }
    }

    // 7. Participant verdict.
    const problems: string[] = [];
    if (ledgerVsLiveDelta !== 0 || sourceDeltas.length) {
      problems.push("LEDGER_VS_LIVE");
      ledgerMismatches++;
    }
    if (sumVsTotalDelta !== 0) {
      problems.push("INTERNAL_INCONSISTENT");
      consistencyMismatches++;
    }
    if (flags.length) problems.push(`MULTIPLIER(${flags.length})`);
    const verdict = problems.length ? problems.join("|") : "OK";
    if (problems.length) usersWithAnyFlag++;

    if (VERBOSE || problems.length) {
      const ledgerBreakdownStr = Object.entries(ledgerBySource)
        .map(([k, v]) => `${k}=${v}`)
        .join("|");
      const liveBreakdownStr = Object.entries(liveBreakdown)
        .map(([k, v]) => `${k}=${v}`)
        .join("|");
      summaryRows.push(
        csvRow([
          email,
          userId.toString(),
          liveTotal,
          liveBreakdownStr,
          ledgerTotal,
          ledgerBreakdownStr,
          sourceDeltas.join(" ; ") || ledgerVsLiveDelta,
          sumVsTotalDelta,
          accumulated,
          packagePayments.length,
          flags.join(" ; "),
          verdict,
        ])
      );
    }
  }

  // 8. Emit.
  console.error("──────────────────────────────────────────────────────────────");
  console.error(`Audited participants:        ${inspected}`);
  console.error(`Participants with any flag:  ${usersWithAnyFlag}`);
  console.error(`  ledger≠live:               ${ledgerMismatches}`);
  console.error(`  internal-inconsistent:     ${consistencyMismatches}`);
  console.error(`  multiplier mismatches:     ${multiplierMismatches} (real — grid existed, wrong mult applied)`);
  console.error(`  grid-painted-after-buy:    ${gridLatePayments} (informational — under/over vs current grid)`);
  console.error("──────────────────────────────────────────────────────────────");

  if (DRY_RUN) {
    console.error("[dry-run] No CSV files written. Showing flagged summary rows below:\n");
    for (const r of summaryRows.slice(0, 40)) console.error(r);
    if (summaryRows.length > 41) console.error(`… ${summaryRows.length - 41} more rows`);
  } else {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const stamp = formatInTimeZone(new Date(), SYDNEY_TZ, "yyyyMMdd-HHmm");
    const summaryPath = path.join(OUT_DIR, `major-draw-entries-audit-${stamp}.csv`);
    const detailPath = path.join(OUT_DIR, `major-draw-multiplier-detail-${stamp}.csv`);
    fs.writeFileSync(summaryPath, summaryRows.join("\n"), "utf8");
    fs.writeFileSync(detailPath, detailRows.join("\n"), "utf8");
    console.error(`Wrote participant summary → ${summaryPath} (${summaryRows.length - 1} rows)`);
    console.error(`Wrote multiplier detail   → ${detailPath} (${detailRows.length - 1} rows)`);
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
