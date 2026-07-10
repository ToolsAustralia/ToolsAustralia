import { formatInTimeZone } from "date-fns-tz";
import connectDB from "@/lib/mongodb";
import PaymentEvent from "@/models/PaymentEvent";
import User from "@/models/User";
import { loadRefundedPaymentIntentIds } from "@/services/admin/dashboard-stats/revenueAggregator";
import {
  REPEAT_BUCKET_KEYS,
  REPEAT_WINDOW_DAYS,
  type RepeatBucketKey,
  type RepeatMemberFilter,
  type RepeatPackageBreakdown,
  type RepeatPurchaseSummary,
  type RepeatPurchaseUserRow,
  type RepeatPurchaseUsersResult,
  type RepeatSegment,
} from "@/types/admin/repeatPurchase";

const AEST = "Australia/Sydney";

// ─────────────────────────────────────────────────────────────────────────────
// Pure shaper — no I/O. Takes already refund-netted, projected one-time events
// and produces the summary + per-user rollups. `now` is injected for testability.
// ─────────────────────────────────────────────────────────────────────────────

/** One refund-netted, countable one-time purchase, pre-projected for the shaper. */
export interface RepeatPurchaseInputEvent {
  userId: string;
  packageId: string;
  packageName?: string;
  /** Dollars. */
  price: number;
  /** AEST calendar day key, yyyy-MM-dd. */
  dayKey: string;
  /** Epoch ms of the purchase timestamp — for ordering and ISO output. */
  ts: number;
}

export function bucketForDays(days: number): RepeatBucketKey {
  if (days <= 0) return "same-day";
  if (days < 7) return "1-7d";
  if (days < 30) return "7-30d";
  if (days < 60) return "30-60d";
  if (days < 90) return "60-90d";
  if (days < 180) return "90-180d";
  return "180d+";
}

interface UserAccum {
  userId: string;
  purchases: RepeatPurchaseInputEvent[]; // sorted ascending by ts
  totalSpent: number;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** One membership charge (invoice paid): its time + whether it's a NEW signup (not a renewal). */
export interface MembershipCharge {
  t: number;
  /** true when data.billingReason !== "subscription_cycle" (a new signup / resubscribe, not an auto-renewal). */
  isNew: boolean;
}

/**
 * Days a single membership charge keeps a subscription active, used only for the
 * user's LAST charge (a lapse). While a member keeps renewing, each charge is
 * covered by the existence of the next charge, so this grace only decides the tail.
 * 30d < a full billing cycle so a purchase ≥ ~1 month after the last charge reads as
 * "lapsed" (e.g. subscribed 9 Jun, bought 10 Jul → 31d → lapsed → counts).
 */
const MEMBERSHIP_COVERAGE_DAYS = 30;

/** Was the user an ACTIVE member at time `t`? chargesAsc = all membership charge times, ascending. */
export function wasActiveMemberAt(chargesAsc: number[], t: number, coverageDays = MEMBERSHIP_COVERAGE_DAYS): boolean {
  let mostRecent = -1;
  let hasLater = false;
  for (const c of chargesAsc) {
    if (c <= t) mostRecent = c;
    else { hasLater = true; break; } // a membership charge AFTER t (given one also ≤ t) ⇒ renewed past t
  }
  if (mostRecent < 0) return false; // no membership charge at/before t ⇒ not a member yet
  if (hasLater) return true; // charge before AND after t ⇒ covered continuously through t
  return t - mostRecent <= coverageDays * 86_400_000; // last charge still within its coverage window?
}

export function summarizeRepeatPurchases(
  events: RepeatPurchaseInputEvent[],
  opts: {
    nowMs: number;
    nowDayKey: string;
    /** userId → all their membership charges (any order; the shaper sorts). Drives active-member detection. */
    membershipByUser: Map<string, MembershipCharge[]>;
    /** AEST calendar-day difference between two yyyy-MM-dd keys (to − from). */
    diffAestDays: (fromDayKey: string, toDayKey: string) => number;
  }
): { summary: RepeatPurchaseSummary; users: RepeatPurchaseUserRow[] } {
  const { membershipByUser, diffAestDays, nowDayKey } = opts;

  // Per-user membership timeline, derived once: sorted charge times + earliest NEW signup.
  const memInfo = new Map<string, { chargesAsc: number[]; firstNew: number | null }>();
  for (const [uid, charges] of membershipByUser) {
    const sorted = [...charges].sort((a, b) => a.t - b.t);
    const firstNewCharge = sorted.find((c) => c.isNew);
    memInfo.set(uid, { chargesAsc: sorted.map((c) => c.t), firstNew: firstNewCharge ? firstNewCharge.t : null });
  }

  // Group by user, ascending by ts.
  const byUser = new Map<string, UserAccum>();
  for (const e of events) {
    let acc = byUser.get(e.userId);
    if (!acc) {
      acc = { userId: e.userId, purchases: [], totalSpent: 0 };
      byUser.set(e.userId, acc);
    }
    acc.purchases.push(e);
    acc.totalSpent += e.price;
  }
  for (const acc of byUser.values()) acc.purchases.sort((a, b) => a.ts - b.ts);

  // Cohort = one-time buyers who were NOT an ACTIVE member at their first one-time purchase.
  // This keeps: never-members, one-time buyers who LATER became members (conversion story),
  // AND lapsed members who buy one-time packs after their subscription ended (prime targets —
  // they want one-time over subscription). It excludes: active members topping up with an
  // Additional pack (already recurring via membership, not a one-time buyer who came back).
  const cohort: UserAccum[] = [];
  for (const acc of byUser.values()) {
    const charges = memInfo.get(acc.userId)?.chargesAsc ?? [];
    if (!wasActiveMemberAt(charges, acc.purchases[0].ts)) cohort.push(acc);
  }

  const users: RepeatPurchaseUserRow[] = [];
  const gapDays: number[] = [];
  let repeatBuyers = 0;
  let repeatRevenue = 0;
  let becameMembers = 0;
  let totalPurchases = 0;

  const bucketUsers = Object.fromEntries(REPEAT_BUCKET_KEYS.map((k) => [k, 0])) as Record<RepeatBucketKey, number>;
  const bucketRevenue = Object.fromEntries(REPEAT_BUCKET_KEYS.map((k) => [k, 0])) as Record<RepeatBucketKey, number>;

  // Per-package rollup, two attributions on the SAME cohort purchases:
  //  • anchor-grouped ("started with this pack") — each buyer counted once under their FIRST pack;
  //  • per-purchase gross — each purchase counted under the pack actually bought.
  // packageId/packageName are both optional on PaymentEvent, so key defensively.
  interface PkgAccum {
    packageId: string;
    packageName: string;
    startedBuyers: number;
    startedReturned: number;
    startedBecameMembers: number;
    startedRevenue: number;
    purchases: number;
    grossRevenue: number;
  }
  const pkg = new Map<string, PkgAccum>();
  const ensurePkg = (id: string, name?: string): PkgAccum => {
    const key = id || name || "unknown";
    let a = pkg.get(key);
    if (!a) {
      a = {
        packageId: key,
        packageName: name || id || "Unknown",
        startedBuyers: 0,
        startedReturned: 0,
        startedBecameMembers: 0,
        startedRevenue: 0,
        purchases: 0,
        grossRevenue: 0,
      };
      pkg.set(key, a);
    }
    return a;
  };

  for (const acc of cohort) {
    const anchor = acc.purchases[0];
    const second = acc.purchases[1];
    const last = acc.purchases[acc.purchases.length - 1]; // = anchor for single-purchase buyers
    totalPurchases += acc.purchases.length;

    // Converted to a member AFTER starting as a one-time buyer (new signup post-anchor).
    const firstNew = memInfo.get(acc.userId)?.firstNew ?? null;
    const becameMember = firstNew != null && firstNew > anchor.ts;
    if (becameMember) becameMembers++;

    // Per-package: anchor attribution (this buyer counted once under their first pack) …
    const anchorPkg = ensurePkg(anchor.packageId, anchor.packageName);
    anchorPkg.startedBuyers++;
    anchorPkg.startedRevenue += acc.totalSpent;
    if (second) anchorPkg.startedReturned++;
    if (becameMember) anchorPkg.startedBecameMembers++;
    // … and per-purchase gross (each purchase under the pack actually bought).
    for (const p of acc.purchases) {
      const pp = ensurePkg(p.packageId, p.packageName);
      pp.purchases++;
      pp.grossRevenue += p.price;
    }

    let daysToReturn: number | undefined;
    let bucket: RepeatBucketKey | undefined;
    if (second) {
      repeatBuyers++;
      daysToReturn = Math.max(0, diffAestDays(anchor.dayKey, second.dayKey));
      bucket = bucketForDays(daysToReturn);
      bucketUsers[bucket]++;
      gapDays.push(daysToReturn);
      // This buyer's repeat revenue = every purchase after the anchor. Attribute it to
      // their gap bucket so bucket revenue sums to summary.repeatRevenue.
      let buyerRepeatRevenue = 0;
      for (let i = 1; i < acc.purchases.length; i++) buyerRepeatRevenue += acc.purchases[i].price;
      repeatRevenue += buyerRepeatRevenue;
      bucketRevenue[bucket] += buyerRepeatRevenue;
    }

    users.push({
      userId: acc.userId,
      firstPurchaseAt: new Date(anchor.ts).toISOString(),
      firstPackageId: anchor.packageId,
      firstPackageName: anchor.packageName,
      secondPurchaseAt: second ? new Date(second.ts).toISOString() : undefined,
      secondPackageId: second?.packageId,
      secondPackageName: second?.packageName,
      lastPurchaseAt: new Date(last.ts).toISOString(),
      lastPackageId: last.packageId,
      lastPackageName: last.packageName,
      daysToReturn,
      bucket,
      purchaseCount: acc.purchases.length,
      totalSpent: Math.round(acc.totalSpent * 100) / 100,
      becameMember,
    });
  }

  const oneTimeBuyers = cohort.length;

  // Windows — matured denominators.
  const windows = REPEAT_WINDOW_DAYS.map((windowDays) => {
    let eligible = 0;
    let returned = 0;
    for (const acc of cohort) {
      const anchorAgeDays = diffAestDays(acc.purchases[0].dayKey, nowDayKey);
      if (anchorAgeDays < windowDays) continue; // not matured for this window
      eligible++;
      const second = acc.purchases[1];
      if (second) {
        const gap = Math.max(0, diffAestDays(acc.purchases[0].dayKey, second.dayKey));
        if (gap <= windowDays) returned++;
      }
    }
    return { windowDays, eligible, returned, rate: eligible ? returned / eligible : 0 };
  });

  const buckets = REPEAT_BUCKET_KEYS.map((bucket) => ({
    bucket,
    users: bucketUsers[bucket],
    sharePct: repeatBuyers ? Math.round((bucketUsers[bucket] / repeatBuyers) * 1000) / 10 : 0,
    revenue: Math.round(bucketRevenue[bucket] * 100) / 100,
  }));

  // Biggest (most trustworthy + highest-impact) cohorts first; revenue breaks ties.
  const packages: RepeatPackageBreakdown[] = [...pkg.values()]
    .map((a) => ({
      packageId: a.packageId,
      packageName: a.packageName,
      startedBuyers: a.startedBuyers,
      startedReturned: a.startedReturned,
      startedRepeatRate: a.startedBuyers ? a.startedReturned / a.startedBuyers : 0,
      startedBecameMembers: a.startedBecameMembers,
      startedMemberRate: a.startedBuyers ? a.startedBecameMembers / a.startedBuyers : 0,
      startedRevenue: Math.round(a.startedRevenue * 100) / 100,
      purchases: a.purchases,
      grossRevenue: Math.round(a.grossRevenue * 100) / 100,
    }))
    // Most starters first (trust + impact); ties break on downstream then gross, so packs
    // that only ever appear as add-on/repeat buys (0 starters) sink to the bottom, ordered
    // by how much they were bought.
    .sort(
      (x, y) =>
        y.startedBuyers - x.startedBuyers ||
        y.startedRevenue - x.startedRevenue ||
        y.grossRevenue - x.grossRevenue
    );

  const summary: RepeatPurchaseSummary = {
    oneTimeBuyers,
    repeatBuyers,
    repeatRate: oneTimeBuyers ? repeatBuyers / oneTimeBuyers : 0,
    medianDaysToReturn: median(gapDays),
    repeatRevenue: Math.round(repeatRevenue * 100) / 100,
    becameMembers,
    totalPurchases,
    buckets,
    windows,
    packages,
  };

  return { summary, users };
}

// ─────────────────────────────────────────────────────────────────────────────
// I/O wrappers — the only place that touches Mongo.
// ─────────────────────────────────────────────────────────────────────────────

/** Cohort window bounds (UTC); filters on the user's ANCHOR (first) purchase date. endDate exclusive. */
export interface RepeatPurchaseRange {
  startDate?: Date;
  endDate?: Date;
}

/** AEST calendar-day difference between two yyyy-MM-dd keys (to − from). */
function diffAestDays(fromDayKey: string, toDayKey: string): number {
  const [fy, fm, fd] = fromDayKey.split("-").map(Number);
  const [ty, tm, td] = toDayKey.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

interface LeanEvent {
  userId?: unknown;
  packageId?: string;
  packageName?: string;
  paymentIntentId?: string;
  timestamp?: Date;
  data?: { price?: number; billingReason?: string };
}

/** Load + shape the full cohort once; both public functions reuse this. */
async function loadCohort(
  range: RepeatPurchaseRange
): Promise<{ summary: RepeatPurchaseSummary; users: RepeatPurchaseUserRow[] }> {
  await connectDB();

  // Three independent reads — fire concurrently so we pay one round-trip of latency,
  // not three (matters most on the live admin request path).
  const [refunded, rows, membershipCharges] = await Promise.all([
    loadRefundedPaymentIntentIds(),
    // All one-time BenefitsGranted, all-time (anchor detection needs full history;
    // the cohort window is applied AFTER anchor is known). ~3k docs at prod scale.
    PaymentEvent.find(
      { eventType: "BenefitsGranted", packageType: "one-time" },
      { userId: 1, packageId: 1, packageName: 1, paymentIntentId: 1, timestamp: 1, "data.price": 1 }
    )
      .lean()
      .exec() as unknown as Promise<LeanEvent[]>,
    // ALL membership charges per user (signups + renewals), collapsed server-side to one
    // row per member. Powers active-member detection: `isNew` = a signup (not a renewal),
    // used for the "became a member after buying one-time" conversion flag.
    PaymentEvent.aggregate<{ _id: unknown; charges: Array<{ t: Date; isNew: boolean }> }>([
      { $match: { eventType: "BenefitsGranted", packageType: "membership" } },
      {
        $group: {
          _id: "$userId",
          charges: { $push: { t: "$timestamp", isNew: { $ne: ["$data.billingReason", "subscription_cycle"] } } },
        },
      },
    ]).exec(),
  ]);

  const events: RepeatPurchaseInputEvent[] = rows
    .filter((r) => !(r.paymentIntentId && refunded.has(r.paymentIntentId)))
    .filter((r): r is LeanEvent & { userId: unknown; timestamp: Date } => !!r.userId && !!r.timestamp)
    .map((r) => ({
      userId: String(r.userId),
      packageId: r.packageId ?? "",
      packageName: r.packageName,
      price: r.data?.price ?? 0,
      dayKey: formatInTimeZone(r.timestamp, AEST, "yyyy-MM-dd"),
      ts: new Date(r.timestamp).getTime(),
    }));

  const membershipByUser = new Map<string, MembershipCharge[]>();
  for (const m of membershipCharges) {
    if (!m._id || !Array.isArray(m.charges)) continue;
    membershipByUser.set(
      String(m._id),
      m.charges
        .filter((c) => c && c.t)
        .map((c) => ({ t: new Date(c.t).getTime(), isNew: !!c.isNew }))
    );
  }

  const now = new Date();
  const nowDayKey = formatInTimeZone(now, AEST, "yyyy-MM-dd");
  const shapeOpts = {
    nowMs: now.getTime(),
    nowDayKey,
    membershipByUser,
    diffAestDays,
  };

  const full = summarizeRepeatPurchases(events, shapeOpts);

  // Cohort window filter on anchor (firstPurchaseAt), applied AFTER anchor is fixed.
  if (!range.startDate && !range.endDate) return full;

  const startMs = range.startDate ? range.startDate.getTime() : -Infinity;
  const endMs = range.endDate ? range.endDate.getTime() : Infinity; // exclusive
  const keep = new Set(
    full.users
      .filter((u) => {
        const t = new Date(u.firstPurchaseAt).getTime();
        return t >= startMs && t < endMs;
      })
      .map((u) => u.userId)
  );

  // Re-run the shaper over just the kept users' events so every derived figure
  // (buckets, windows, medians) stays internally consistent for the cohort.
  const filteredEvents = events.filter((e) => keep.has(e.userId));
  return summarizeRepeatPurchases(filteredEvents, shapeOpts);
}

export async function getRepeatPurchaseSummary(
  range: RepeatPurchaseRange
): Promise<RepeatPurchaseSummary> {
  const { summary } = await loadCohort(range);
  return summary;
}

/** Segment + bucket + membership filter, then default sort (most-recent anchor first). Pure, no I/O. */
function filterAndSortCohort(
  users: RepeatPurchaseUserRow[],
  segment: RepeatSegment,
  bucket?: RepeatBucketKey,
  member: RepeatMemberFilter = "all"
): RepeatPurchaseUserRow[] {
  let filtered = users;
  if (segment === "returned") filtered = filtered.filter((u) => !!u.secondPurchaseAt);
  else if (segment === "not-returned") filtered = filtered.filter((u) => !u.secondPurchaseAt);
  if (bucket) filtered = filtered.filter((u) => u.bucket === bucket);
  if (member === "member") filtered = filtered.filter((u) => u.becameMember);
  else if (member === "non-member") filtered = filtered.filter((u) => !u.becameMember);
  // Default sort: most-recent anchor first (actionable "who just entered the cohort").
  return [...filtered].sort(
    (a, b) => new Date(b.firstPurchaseAt).getTime() - new Date(a.firstPurchaseAt).getTime()
  );
}

/** Hydrate firstName/lastName/email for the given rows (admin UI is allowed full PII). */
async function hydratePii(rows: RepeatPurchaseUserRow[]): Promise<RepeatPurchaseUserRow[]> {
  const ids = rows.map((r) => r.userId);
  const profiles = ids.length
    ? await User.find({ _id: { $in: ids } }).select({ firstName: 1, lastName: 1, email: 1 }).lean()
    : [];
  const pmap = new Map(profiles.map((p) => [String(p._id), p]));
  return rows.map((r) => {
    const p = pmap.get(r.userId);
    return {
      ...r,
      firstName: p?.firstName ?? undefined,
      lastName: p?.lastName ?? undefined,
      email: p?.email ?? undefined,
    };
  });
}

export async function getRepeatPurchaseUsers(params: {
  segment: RepeatSegment;
  bucket?: RepeatBucketKey;
  member?: RepeatMemberFilter;
  page?: number;
  limit?: number;
  startDate?: Date;
  endDate?: Date;
}): Promise<RepeatPurchaseUsersResult> {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 25));

  const { users } = await loadCohort({ startDate: params.startDate, endDate: params.endDate });
  const filtered = filterAndSortCohort(users, params.segment, params.bucket, params.member);

  const totalCount = filtered.length;
  const rows = await hydratePii(filtered.slice((page - 1) * limit, page * limit));

  return { rows, totalCount, page, limit };
}

/**
 * All matching cohort rows (no paging), PII-hydrated — for CSV export. The cohort
 * is bounded (≤ all one-time buyers, ~2.4k), so a single un-paged pass is fine.
 */
export async function getRepeatPurchaseUsersForExport(params: {
  segment: RepeatSegment;
  bucket?: RepeatBucketKey;
  member?: RepeatMemberFilter;
  startDate?: Date;
  endDate?: Date;
}): Promise<RepeatPurchaseUserRow[]> {
  const { users } = await loadCohort({ startDate: params.startDate, endDate: params.endDate });
  const filtered = filterAndSortCohort(users, params.segment, params.bucket, params.member);
  return hydratePii(filtered);
}
