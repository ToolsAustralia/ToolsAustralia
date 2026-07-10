import assert from "node:assert/strict";
import {
  summarizeRepeatPurchases,
  bucketForDays,
  type RepeatPurchaseInputEvent,
  type MembershipCharge,
} from "../repeatPurchaseAnalytics";

const DAY = 86_400_000;

// Deterministic AEST day-diff for tests: treat dayKey as a plain calendar date.
function diffAestDays(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const a = Date.UTC(fy, fm - 1, fd);
  const b = Date.UTC(ty, tm - 1, td);
  return Math.round((b - a) / 86_400_000);
}

// day key + ts from a plain yyyy-mm-dd (midnight UTC stands in for AEST here).
function ev(userId: string, day: string, packageId: string, price: number): RepeatPurchaseInputEvent {
  const [y, m, d] = day.split("-").map(Number);
  return { userId, packageId, packageName: packageId, price, dayKey: day, ts: Date.UTC(y, m - 1, d) };
}

const NOW_DAY = "2026-07-09";
const NOW_MS = Date.UTC(2026, 6, 9);

function run(events: RepeatPurchaseInputEvent[], memberships: Array<[string, MembershipCharge[]]> = []) {
  return summarizeRepeatPurchases(events, {
    nowMs: NOW_MS,
    nowDayKey: NOW_DAY,
    membershipByUser: new Map(memberships),
    diffAestDays,
  });
}

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
}

// --- bucketForDays boundaries ---
check("bucketForDays boundaries", () => {
  assert.equal(bucketForDays(0), "same-day");
  assert.equal(bucketForDays(1), "1-7d");
  assert.equal(bucketForDays(6), "1-7d");
  assert.equal(bucketForDays(7), "7-30d");
  assert.equal(bucketForDays(29), "7-30d");
  assert.equal(bucketForDays(30), "30-60d");
  assert.equal(bucketForDays(59), "30-60d");
  assert.equal(bucketForDays(60), "60-90d");
  assert.equal(bucketForDays(89), "60-90d");
  assert.equal(bucketForDays(90), "90-180d");
  assert.equal(bucketForDays(179), "90-180d");
  assert.equal(bucketForDays(180), "180d+");
  assert.equal(bucketForDays(999), "180d+");
});

// --- single-purchase user is a buyer, not a repeat buyer ---
check("single purchase counts as buyer only", () => {
  const { summary } = run([ev("u1", "2026-01-01", "tradie-pack", 50)]);
  assert.equal(summary.oneTimeBuyers, 1);
  assert.equal(summary.repeatBuyers, 0);
  assert.equal(summary.repeatRate, 0);
  assert.equal(summary.totalPurchases, 1);
  assert.equal(summary.repeatRevenue, 0);
});

// --- two purchases: repeat buyer, daysToReturn from anchor→second, repeatRevenue = 2nd+ only ---
check("repeat buyer gap + revenue", () => {
  const { summary, users } = run([
    ev("u1", "2026-01-01", "tradie-pack", 50),
    ev("u1", "2026-01-20", "additional-tradie-pack", 25),
  ]);
  assert.equal(summary.repeatBuyers, 1);
  assert.equal(summary.repeatRate, 1);
  assert.equal(summary.repeatRevenue, 25); // only the 2nd purchase
  const u = users.find((r) => r.userId === "u1")!;
  assert.equal(u.daysToReturn, 19);
  assert.equal(u.bucket, "7-30d");
  assert.equal(u.purchaseCount, 2);
  assert.equal(u.totalSpent, 75);
  assert.equal(u.firstPackageId, "tradie-pack");
  assert.equal(u.secondPackageId, "additional-tradie-pack");
});

// --- last purchase is the most-recent; second stays the reconversion event ---
check("last purchase tracks most-recent, distinct from second", () => {
  const { users } = run([
    ev("u1", "2026-01-01", "tradie-pack", 50),
    ev("u1", "2026-01-10", "additional-tradie-pack", 25),
    ev("u1", "2026-03-01", "boss-pack", 250),
  ]);
  const u = users[0];
  assert.equal(u.daysToReturn, 9); // first→second unchanged
  assert.equal(u.secondPackageId, "additional-tradie-pack");
  assert.equal(u.lastPackageId, "boss-pack"); // most-recent, not the second
  assert.equal(u.lastPurchaseAt, new Date(Date.UTC(2026, 2, 1)).toISOString());
  assert.equal(u.purchaseCount, 3);
});

// --- single-purchase buyer: last == first ---
check("single buyer last purchase equals first", () => {
  const { users } = run([ev("u1", "2026-05-05", "tradie-pack", 50)]);
  const u = users[0];
  assert.equal(u.lastPurchaseAt, u.firstPurchaseAt);
  assert.equal(u.lastPackageId, "tradie-pack");
  assert.equal(u.secondPurchaseAt, undefined);
});

// --- same-day second purchase → same-day bucket, not dropped ---
check("same-day repeat counts", () => {
  const { summary, users } = run([
    ev("u1", "2026-02-02", "boss-pack", 250),
    ev("u1", "2026-02-02", "additional-tradie-pack", 25),
  ]);
  assert.equal(summary.repeatBuyers, 1);
  assert.equal(users[0].daysToReturn, 0);
  assert.equal(users[0].bucket, "same-day");
});

// --- events arrive out of order: anchor is still the earliest ---
check("anchor is earliest regardless of input order", () => {
  const { users } = run([
    ev("u1", "2026-03-10", "foreman-pack", 100),
    ev("u1", "2026-03-01", "tradie-pack", 50),
  ]);
  const u = users[0];
  assert.equal(u.firstPurchaseAt, new Date(Date.UTC(2026, 2, 1)).toISOString());
  assert.equal(u.daysToReturn, 9);
});

// --- becameMember: one-time buyer who LATER signs up (membership charge after anchor) ---
check("becameMember flag set when signup after anchor", () => {
  const anchorMs = Date.UTC(2026, 0, 1);
  const { summary, users } = run(
    [ev("u1", "2026-01-01", "apprentice-pack", 25), ev("u1", "2026-03-01", "foreman-pack", 100)],
    [["u1", [{ t: anchorMs + DAY, isNew: true }]]] // first membership signup one day AFTER the anchor
  );
  assert.equal(summary.oneTimeBuyers, 1); // not a member at their 1st one-time → included
  assert.equal(summary.becameMembers, 1);
  assert.equal(users[0].becameMember, true);
});

// --- ACTIVE member topping up with an Additional pack → EXCLUDED ---
check("active member topping up is excluded", () => {
  const anchorMs = Date.UTC(2026, 1, 1); // Feb 1 first one-time purchase
  const { summary, users } = run(
    [
      ev("u1", "2026-02-01", "additional-tradie-pack", 25),
      ev("u1", "2026-02-20", "additional-tradie-pack", 25),
      ev("u2", "2026-02-05", "tradie-pack", 50),
    ],
    [["u1", [{ t: anchorMs - 10 * DAY, isNew: true }]]] // u1 charged 10 days before → active at anchor
  );
  assert.equal(summary.oneTimeBuyers, 1); // only u2 (the genuine one-time buyer)
  assert.equal(users.length, 1);
  assert.equal(users[0].userId, "u2");
  assert.equal(summary.repeatBuyers, 0); // u1's repeat purchases leave with them
});

// --- LAPSED member buying a one-time pack after their subscription ended → INCLUDED ---
// (subscribed, stopped renewing, then bought one-time 31 days after their last charge — a prime target.)
check("lapsed member buying after membership ended is included", () => {
  const lastCharge = Date.UTC(2026, 2, 9); // 9 Mar — their only/last membership charge
  const { summary, users } = run(
    [ev("u1", "2026-04-09", "tradie-pack", 50), ev("u1", "2026-04-25", "tradie-pack", 50)], // 1st one-time 31 days later
    [["u1", [{ t: lastCharge, isNew: true }]]]
  );
  assert.equal(summary.oneTimeBuyers, 1); // included — not an active member on 9 Apr
  assert.equal(users[0].userId, "u1");
  assert.equal(summary.repeatBuyers, 1); // their repeat purchase counts
  assert.equal(users[0].becameMember, false); // membership was BEFORE, so not a "conversion"
});

// --- continuously-renewing member is active even months after their first charge → EXCLUDED ---
check("continuously renewing member stays excluded", () => {
  const { summary } = run(
    [ev("u1", "2026-04-09", "additional-tradie-pack", 25)],
    [["u1", [
      { t: Date.UTC(2026, 1, 24), isNew: true },  // Feb 24 signup
      { t: Date.UTC(2026, 2, 24), isNew: false },  // Mar 24 renewal
      { t: Date.UTC(2026, 3, 24), isNew: false },  // Apr 24 renewal (after the 9 Apr purchase)
    ]]]
  );
  assert.equal(summary.oneTimeBuyers, 0); // renewed past the purchase → active → excluded
});

// --- buckets + shares + median ---
check("buckets, shares, median across users", () => {
  // 3 repeat buyers with gaps 0, 10, 40 days; 1 single-purchase buyer
  const { summary } = run([
    ev("a", "2026-01-01", "tradie-pack", 50), ev("a", "2026-01-01", "tradie-pack", 50), // 0d
    ev("b", "2026-01-01", "tradie-pack", 50), ev("b", "2026-01-11", "tradie-pack", 50), // 10d
    ev("c", "2026-01-01", "tradie-pack", 50), ev("c", "2026-02-10", "tradie-pack", 50), // 40d
    ev("d", "2026-01-01", "tradie-pack", 50), // single
  ]);
  assert.equal(summary.oneTimeBuyers, 4);
  assert.equal(summary.repeatBuyers, 3);
  const same = summary.buckets.find((x) => x.bucket === "same-day")!;
  const seven = summary.buckets.find((x) => x.bucket === "7-30d")!;
  const thirty = summary.buckets.find((x) => x.bucket === "30-60d")!;
  assert.equal(same.users, 1);
  assert.equal(seven.users, 1);
  assert.equal(thirty.users, 1);
  assert.equal(same.sharePct, Math.round((1 / 3) * 1000) / 10);
  assert.equal(summary.medianDaysToReturn, 10); // middle of [0,10,40]
  // Each of the 3 repeat buyers has one 2nd purchase of $50 → $50 revenue in their bucket.
  assert.equal(same.revenue, 50);
  assert.equal(seven.revenue, 50);
  assert.equal(thirty.revenue, 50);
  // Bucket revenues sum to the summary's repeat revenue (3 × $50).
  const bucketRevSum = summary.buckets.reduce((s, b) => s + b.revenue, 0);
  assert.equal(bucketRevSum, summary.repeatRevenue);
  assert.equal(summary.repeatRevenue, 150);
});

// --- windows: matured denominators ---
check("window rates use matured denominators", () => {
  // u1 anchored 200d ago, returned in 5d (mature for all windows, returned within 7/30/…)
  // u2 anchored 3d ago, not returned yet (only eligible for the 1d window)
  const { summary } = run([
    ev("u1", "2025-12-21", "tradie-pack", 50), ev("u1", "2025-12-26", "tradie-pack", 50), // 200d ago, gap 5
    ev("u2", "2026-07-06", "tradie-pack", 50), // 3d ago, single
  ]);
  const w1 = summary.windows.find((w) => w.windowDays === 1)!;
  const w7 = summary.windows.find((w) => w.windowDays === 7)!;
  const w180 = summary.windows.find((w) => w.windowDays === 180)!;
  // 1-day window: both anchors ≥1 day old → eligible 2; u1 returned in 5d (>1) → returned 0
  assert.equal(w1.eligible, 2);
  assert.equal(w1.returned, 0);
  // 7-day window: u2 anchor only 3d old → NOT eligible; u1 eligible + returned in 5d
  assert.equal(w7.eligible, 1);
  assert.equal(w7.returned, 1);
  assert.equal(w7.rate, 1);
  // 180-day window: only u1 eligible, returned
  assert.equal(w180.eligible, 1);
  assert.equal(w180.returned, 1);
});

// --- per-package breakdown: anchor grouping vs per-purchase gross, members, invariants ---
check("package breakdown splits anchor vs per-purchase and honours members", () => {
  const { summary } = run(
    [
      // a: starts Apprentice, returns buying Tradie; signs up after anchor → became member
      ev("a", "2026-01-01", "apprentice", 25),
      ev("a", "2026-01-10", "tradie", 50),
      // b: starts Apprentice, single purchase
      ev("b", "2026-01-02", "apprentice", 25),
      // c: starts Tradie, returns buying Tradie again
      ev("c", "2026-01-03", "tradie", 50),
      ev("c", "2026-02-03", "tradie", 50),
    ],
    [["a", [{ t: Date.UTC(2026, 0, 5), isNew: true }]]] // a's signup is AFTER their anchor
  );
  const byId = Object.fromEntries(summary.packages.map((p) => [p.packageId, p]));

  // Apprentice — anchor group: 2 buyers started here (a, b); a returned; a became a member.
  assert.equal(byId["apprentice"].startedBuyers, 2);
  assert.equal(byId["apprentice"].startedReturned, 1);
  assert.equal(byId["apprentice"].startedRepeatRate, 0.5);
  assert.equal(byId["apprentice"].startedBecameMembers, 1);
  assert.equal(byId["apprentice"].startedMemberRate, 0.5);
  assert.equal(byId["apprentice"].startedRevenue, 100); // a: 25+50, b: 25
  // Apprentice — per-purchase gross: only the two apprentice purchases (a's & b's anchors).
  assert.equal(byId["apprentice"].purchases, 2);
  assert.equal(byId["apprentice"].grossRevenue, 50);

  // Tradie — anchor group: 1 buyer started here (c); c returned.
  assert.equal(byId["tradie"].startedBuyers, 1);
  assert.equal(byId["tradie"].startedReturned, 1);
  assert.equal(byId["tradie"].startedRevenue, 100); // c: 50+50
  // Tradie — per-purchase gross: a's 2nd (50) + c's two (50+50) = 3 purchases, $150.
  assert.equal(byId["tradie"].purchases, 3);
  assert.equal(byId["tradie"].grossRevenue, 150);

  // Invariants: each attribution counts every purchase exactly once.
  const sumStarted = summary.packages.reduce((s, p) => s + p.startedRevenue, 0);
  const sumGross = summary.packages.reduce((s, p) => s + p.grossRevenue, 0);
  assert.equal(sumStarted, sumGross);
  assert.equal(sumGross, 200); // 25+50+25+50+50
  assert.equal(summary.packages.reduce((s, p) => s + p.purchases, 0), summary.totalPurchases);
  assert.equal(summary.packages.reduce((s, p) => s + p.startedBuyers, 0), summary.oneTimeBuyers);
  assert.equal(summary.packages.reduce((s, p) => s + p.startedReturned, 0), summary.repeatBuyers);
  assert.equal(summary.packages.reduce((s, p) => s + p.startedBecameMembers, 0), summary.becameMembers);
  // Sorted by startedBuyers desc → apprentice (2) before tradie (1).
  assert.equal(summary.packages[0].packageId, "apprentice");
});

console.log(`\n${passed} checks passed`);
