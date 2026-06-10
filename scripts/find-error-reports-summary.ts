#!/usr/bin/env npx tsx

/**
 * Read-only summary of the in-app ErrorReport store (src/models/ErrorReport.ts).
 *
 * This is the durable, severity-classified error log (client + server) that backs
 * the admin error-reports dashboard — unlike Vercel runtime logs (~hours of retention),
 * ErrorReport rows live for 90 days (TTL). Use this to see what's actually breaking,
 * ranked by severity / category / endpoint, without opening the admin UI.
 *
 * READ-ONLY: only counts/aggregations and `.find().lean()` reads. Never writes.
 *
 * Usage:
 *   npx tsx scripts/find-error-reports-summary.ts [--days=N] [--top=N] [--samples=N]
 *   npm run find:error-reports -- --days=14
 *
 *   --days=N     window for the summary (default 30)
 *   --top=N      how many rows in each "top" table (default 12)
 *   --samples=N  how many recent individual reports to print (default 10)
 *
 * Output: human-readable summary to stdout. Progress/diagnostics to stderr.
 */

import { config } from "dotenv";
import path from "path";

config({ path: path.resolve(process.cwd(), ".env.local") });

function numArg(flag: string, fallback: number): number {
  const a = process.argv.find((x) => x.startsWith(`${flag}=`));
  if (!a) return fallback;
  const n = parseInt(a.split("=")[1] || "", 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function strArg(flag: string): string | undefined {
  const a = process.argv.find((x) => x.startsWith(`${flag}=`));
  return a ? a.split("=").slice(1).join("=") : undefined;
}

const DAYS = numArg("--days", 30);
const TOP = numArg("--top", 12);
const SAMPLES = numArg("--samples", 10);
// Drill-down: when set, print full detail for reports whose errorMessage contains this substring.
const CONTAINS = strArg("--contains");

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type CountRow = { _id: string | null; count: number };

function printCounts(title: string, rows: CountRow[], total: number): void {
  console.log(`\n${title}`);
  if (rows.length === 0) {
    console.log("  (none)");
    return;
  }
  const labelWidth = Math.min(
    40,
    Math.max(...rows.map((r) => String(r._id ?? "(unset)").length), 6)
  );
  for (const r of rows) {
    const label = String(r._id ?? "(unset)").padEnd(labelWidth);
    const pct = total > 0 ? ((r.count / total) * 100).toFixed(1) : "0.0";
    console.log(`  ${label}  ${String(r.count).padStart(6)}  ${pct.padStart(5)}%`);
  }
}

async function main(): Promise<void> {
  if (!process.env.MONGODB_URI) {
    console.error("MONGODB_URI is not set (.env.local).");
    process.exit(1);
  }

  // Shared connector (repo rule: no ad-hoc mongoose.connect in scripts/) — its
  // pool sizing, timeouts, and SSL retry come for free; mongoose is still
  // imported for disconnect().
  const mongoose = await import("mongoose");
  const connectDB = (await import("../src/lib/mongodb")).default;
  const ErrorReport = (await import("../src/models/ErrorReport")).default;

  console.error(`Connecting to MongoDB…`);
  await connectDB();

  const since = new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);

  // ---- Drill-down mode: full detail for one error message ----
  if (CONTAINS) {
    const detailMatch = {
      createdAt: { $gte: since },
      errorMessage: { $regex: escapeRegex(CONTAINS), $options: "i" },
    };
    const matchCount = await ErrorReport.countDocuments(detailMatch);
    console.log("=".repeat(64));
    console.log(`ERROR REPORT DRILL-DOWN — contains "${CONTAINS}" (last ${DAYS}d)`);
    console.log(`matching reports: ${matchCount}`);
    console.log("=".repeat(64));
    if (matchCount === 0) {
      await mongoose.disconnect();
      return;
    }

    const groupDetail = (field: string) =>
      ErrorReport.aggregate<CountRow>([
        { $match: detailMatch },
        { $group: { _id: `$${field}`, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]);
    const [bySev, byOs, byBrowser, byStatus, byUrl] = await Promise.all([
      groupDetail("severity"),
      groupDetail("browserInfo.os"),
      groupDetail("browserInfo.name"),
      groupDetail("httpStatus"),
      ErrorReport.aggregate<CountRow>([
        { $match: detailMatch },
        { $group: { _id: "$currentUrl", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: TOP },
      ]),
    ]);
    printCounts("Severity:", bySev, matchCount);
    printCounts("OS:", byOs, matchCount);
    printCounts("Browser:", byBrowser, matchCount);
    printCounts("HTTP status:", byStatus, matchCount);
    printCounts(`Top ${TOP} pages:`, byUrl, matchCount);

    type DetailRow = {
      createdAt?: Date;
      severity?: string;
      httpStatus?: number;
      errorName?: string;
      errorMessage?: string;
      currentUrl?: string;
      userAgent?: string;
      browserInfo?: { name?: string; version?: string; os?: string };
      errorStack?: string;
    };
    const rows = (await ErrorReport.find(detailMatch)
      .sort({ createdAt: -1 })
      .limit(SAMPLES)
      .select(
        "createdAt severity httpStatus errorName errorMessage currentUrl userAgent browserInfo errorStack"
      )
      .lean()) as unknown as DetailRow[];
    console.log(`\nMost recent ${rows.length} full record(s):`);
    for (const r of rows) {
      const when = r.createdAt ? new Date(r.createdAt).toISOString().replace("T", " ").slice(0, 19) : "?";
      const b = r.browserInfo;
      const ua = b ? `${b.name ?? "?"} ${b.version ?? ""} / ${b.os ?? "?"}`.trim() : r.userAgent ?? "?";
      console.log(`\n  • ${when}  sev=${r.severity ?? "—"}  http=${r.httpStatus ?? "—"}  ${b ? ua : ua.slice(0, 70)}`);
      console.log(`    name: ${r.errorName ?? "—"}`);
      console.log(`    msg:  ${(r.errorMessage ?? "").replace(/\s+/g, " ").slice(0, 200)}`);
      console.log(`    url:  ${r.currentUrl ?? "—"}`);
      if (r.errorStack) {
        const stackHead = r.errorStack.split("\n").slice(0, 3).map((l) => l.trim()).join(" | ");
        console.log(`    stack: ${stackHead.slice(0, 220)}`);
      }
    }
    console.log("\n" + "=".repeat(64));
    await mongoose.disconnect();
    return;
  }

  const [grandTotal, windowTotal] = await Promise.all([
    ErrorReport.countDocuments({}),
    ErrorReport.countDocuments({ createdAt: { $gte: since } }),
  ]);

  console.error(`Total reports (all time): ${grandTotal}. In window: ${windowTotal}.`);

  console.log("=".repeat(64));
  console.log(`ERROR REPORT SUMMARY — last ${DAYS} days`);
  console.log(`since ${since.toISOString()}`);
  console.log(`reports in window: ${windowTotal}   (all-time stored: ${grandTotal}, 90-day TTL)`);
  console.log("=".repeat(64));

  if (windowTotal === 0) {
    console.log("\nNo error reports in this window. ✅");
    await mongoose.disconnect();
    return;
  }

  const match = { createdAt: { $gte: since } };
  const groupBy = (field: string) =>
    ErrorReport.aggregate<CountRow>([
      { $match: match },
      { $group: { _id: `$${field}`, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

  // Severity ordered critical → high → medium → unset for readability.
  const severityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2 };
  const [bySeverity, byCategory, byStatus, byAuto, byEndpoint, byRoute, byHttpStatus] =
    await Promise.all([
      groupBy("severity"),
      groupBy("category"),
      groupBy("status"),
      groupBy("autoLogged"),
      ErrorReport.aggregate<CountRow>([
        { $match: { ...match, apiEndpoint: { $nin: [null, ""] } } },
        { $group: { _id: "$apiEndpoint", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: TOP },
      ]),
      ErrorReport.aggregate<CountRow>([
        { $match: { ...match, route: { $nin: [null, ""] } } },
        { $group: { _id: "$route", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: TOP },
      ]),
      ErrorReport.aggregate<CountRow>([
        { $match: { ...match, httpStatus: { $ne: null } } },
        { $group: { _id: "$httpStatus", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: TOP },
      ]),
    ]);

  bySeverity.sort(
    (a, b) =>
      (severityOrder[a._id ?? ""] ?? 9) - (severityOrder[b._id ?? ""] ?? 9) || b.count - a.count
  );

  printCounts("By severity:", bySeverity, windowTotal);
  printCounts("By category:", byCategory, windowTotal);
  printCounts("By status:", byStatus, windowTotal);
  printCounts(
    "Auto-logged vs user-submitted:",
    byAuto.map((r) => ({ _id: r._id === null ? "(unset)" : r._id ? "auto-logged" : "user-submitted", count: r.count })),
    windowTotal
  );
  printCounts(`Top ${TOP} API endpoints:`, byEndpoint, windowTotal);
  printCounts(`Top ${TOP} frontend routes:`, byRoute, windowTotal);
  printCounts(`HTTP status codes:`, byHttpStatus, windowTotal);

  // Per-day trend (last min(DAYS, 21) days) using the Sydney-agnostic UTC day bucket.
  const trendDays = Math.min(DAYS, 21);
  const trendSince = new Date(Date.now() - trendDays * 24 * 60 * 60 * 1000);
  const byDay = await ErrorReport.aggregate<CountRow>([
    { $match: { createdAt: { $gte: trendSince } } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  console.log(`\nReports per day (last ${trendDays}d):`);
  if (byDay.length === 0) {
    console.log("  (none)");
  } else {
    const maxDay = Math.max(...byDay.map((d) => d.count));
    for (const d of byDay) {
      const bar = "█".repeat(Math.max(1, Math.round((d.count / maxDay) * 30)));
      console.log(`  ${d._id}  ${String(d.count).padStart(5)}  ${bar}`);
    }
  }

  // Most recent individual reports.
  type SampleRow = {
    createdAt?: Date;
    severity?: string;
    category?: string;
    errorName?: string;
    errorMessage?: string;
    apiEndpoint?: string;
    route?: string;
    httpStatus?: number;
    status?: string;
    autoLogged?: boolean;
  };
  const recent = (await ErrorReport.find(match)
    .sort({ createdAt: -1 })
    .limit(SAMPLES)
    .select(
      "createdAt severity category errorName errorMessage apiEndpoint route httpStatus status autoLogged"
    )
    .lean()) as unknown as SampleRow[];

  console.log(`\nMost recent ${recent.length} report(s):`);
  for (const r of recent) {
    const when = r.createdAt ? new Date(r.createdAt).toISOString().replace("T", " ").slice(0, 19) : "?";
    const sev = (r.severity ?? "—").padEnd(8);
    const where = r.apiEndpoint || r.route || "—";
    const msg = (r.errorName ? `${r.errorName}: ` : "") + (r.errorMessage ?? "");
    const httpStatus = r.httpStatus ? ` [${r.httpStatus}]` : "";
    console.log(`  ${when}  ${sev}  ${where}${httpStatus}`);
    console.log(`      ${msg.replace(/\s+/g, " ").slice(0, 160)}`);
  }

  console.log("\n" + "=".repeat(64));
  console.log(
    `Done. Unresolved (new/investigating): ` +
      `${byStatus.filter((s) => s._id === "new" || s._id === "investigating").reduce((a, b) => a + b.count, 0)}` +
      ` of ${windowTotal}.`
  );

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error("find-error-reports-summary failed:", err);
  try {
    const mongoose = await import("mongoose");
    await mongoose.disconnect();
  } catch {
    // ignore disconnect errors during failure cleanup
  }
  process.exit(1);
});
