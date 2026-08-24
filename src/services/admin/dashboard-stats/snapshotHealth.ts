// src/services/admin/dashboard-stats/snapshotHealth.ts
//
// Health-check projections of the two daily snapshot collections that back the
// admin dashboard. Both are read-only diagnostic rollups: "are we missing any
// expected per-AEST-day snapshot rows over the relevant window?".
//
// Extracted from src/app/api/admin/health/{dashboard-stats-snapshot,membership-snapshot}/route.ts
// so the admin route and the Norm projection can call the same code and report
// identical numbers by construction. Framework-agnostic — no Request / NextResponse types.

import { formatInTimeZone } from "date-fns-tz";
import DashboardStatsDailySnapshot from "@/models/DashboardStatsDailySnapshot";
import MembershipDailySnapshot from "@/models/MembershipDailySnapshot";
import { expandDateKeyRange } from "@/services/admin/dashboard-stats/DashboardStatsSnapshotWriter";
import { getWebsiteLaunchDateUTC } from "@/utils/common/timezone";

const TZ = "Australia/Sydney";
const SUBSCRIPTION_PACKAGE_IDS = [
  "tradie-subscription",
  "foreman-subscription",
  "boss-subscription",
] as const;

export interface DashboardStatsSnapshotHealth {
  /** Number of AEST date keys from launch up to (but excluding) today. */
  expectedCount: number;
  /** Number of those keys that have a snapshot row. */
  presentCount: number;
  /** Number missing (`expectedCount - presentCount`). */
  missingCount: number;
  /** The missing keys, in AEST `YYYY-MM-DD` form. */
  missingDates: string[];
  /** Up to 3 most-recent present keys, ascending. */
  latestPresent: string[];
}

/**
 * Daily-snapshot freshness check for the dashboard stats collection.
 * Expects one row per AEST day from website launch up to (but excluding)
 * today — today is excluded because the cron has not yet rolled it up.
 */
export async function getDashboardStatsSnapshotHealth(): Promise<DashboardStatsSnapshotHealth> {
  const launchKey = formatInTimeZone(getWebsiteLaunchDateUTC(), TZ, "yyyy-MM-dd");
  const todayKey = formatInTimeZone(new Date(), TZ, "yyyy-MM-dd");
  // Expected keys exclude today (cron hasn't run yet for "today" until midnight AEST passes).
  const expectedKeys = expandDateKeyRange(launchKey, todayKey).slice(0, -1);

  const present = await DashboardStatsDailySnapshot.find({
    date: { $in: expectedKeys },
  })
    .select("date")
    .lean();

  const presentSet = new Set(present.map((p) => p.date));
  const missing = expectedKeys.filter((k) => !presentSet.has(k));

  return {
    expectedCount: expectedKeys.length,
    presentCount: presentSet.size,
    missingCount: missing.length,
    missingDates: missing,
    latestPresent: present.map((p) => p.date).sort().slice(-3),
  };
}

export interface MembershipSnapshotHealth {
  /** True when every package has a snapshot for every checked AEST day. */
  ok: boolean;
  /** The 7 AEST date keys that were inspected (yesterday → 7 days ago). */
  checked: string[];
  /** For each day with at least one missing package, the missing packageIds. */
  missingDays: Array<{ date: string; missingPackages: string[] }>;
}

/**
 * Daily-snapshot freshness check for the per-package membership snapshot.
 * Looks back the last 7 AEST days (excluding today) and confirms every
 * subscription package has a row on every checked day.
 *
 * ⚠️ EXPECT A DAILY "YESTERDAY MISSING" WINDOW — this is normal, not a fault (2026-08-24).
 * "Yesterday" enters `checked` the instant Sydney rolls past midnight (14:00 UTC AEST / 13:00
 * UTC AEDT), but `membership-daily-snapshot`'s first fire for that day doesn't happen until
 * `30 17 * * *` UTC (see docs/infrastructure/gotchas.md for why it isn't earlier — the cron
 * moved off the renewal-webhook-burst hour and then off a Sydney-ad-sync-slot collision). So
 * for roughly 3.5–4.5 hours every morning, `ok` is correctly `false` for yesterday, and BOTH
 * `/api/admin/health/membership-snapshot` and its Norm mirror report it — a caller checking
 * during that window should not treat this as an incident. Existence-only note: this function
 * only checks that a row EXISTS for each expected `(date, packageId)`; it does NOT validate the
 * row's counts, so a degenerate all-zero row (see `upsertMembershipSnapshotRow`'s escape hatch
 * in the cron route) reads as healthy. Nothing else repairs a bad row's counts.
 */
export async function getMembershipSnapshotHealth(): Promise<MembershipSnapshotHealth> {
  const now = new Date();
  const checkDates: string[] = [];
  for (let i = 1; i <= 7; i += 1) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    checkDates.push(formatInTimeZone(d, TZ, "yyyy-MM-dd"));
  }

  const rows = await MembershipDailySnapshot.find({ date: { $in: checkDates } })
    .select("date packageId")
    .lean();

  const presentByDate = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!presentByDate.has(r.date)) presentByDate.set(r.date, new Set());
    presentByDate.get(r.date)!.add(r.packageId);
  }

  const missingDays: Array<{ date: string; missingPackages: string[] }> = [];
  for (const date of checkDates) {
    const present = presentByDate.get(date) ?? new Set<string>();
    const missing = SUBSCRIPTION_PACKAGE_IDS.filter((id) => !present.has(id));
    if (missing.length > 0) missingDays.push({ date, missingPackages: [...missing] });
  }

  return {
    ok: missingDays.length === 0,
    checked: checkDates,
    missingDays,
  };
}
