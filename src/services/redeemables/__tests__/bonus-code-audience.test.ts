/**
 * bonus-code-audience.test.ts
 *
 * Pins four things about `BonusCodeAudienceService` / `bonusCodeAudienceFilter.ts`:
 *
 * 1. THE CODE MAP IS READ FROM CONFIG, NEVER RESTATED. A second literal
 *    `"cancel-click": "BACKIN200"`-shaped entry anywhere in the audience files
 *    would drift silently from `src/config/bonusCodes.ts` the moment either one
 *    is edited — this is source-level, not runtime, because a JS object literal
 *    that happens to equal the map today gives no other signal that it is a copy.
 * 2. EACH AUDIENCE FILTER AGREES WITH `trigger-eligibility.test.ts`'s notion of
 *    the "right population" for a trigger, evaluated against the SAME fixture
 *    shapes that suite uses (`noSubscription`, `justCancelled`, an active
 *    `member`, a deactivated account). No DB connection — the filters are pure
 *    Mongo query OBJECTS, so this test interprets them against plain JS
 *    fixtures with a small evaluator scoped to exactly the operators the
 *    builders use ($and/$or/$ne/$exists/$gte/$in, dotted paths incl. into arrays).
 * 3. RECENCY SCOPING actually narrows the population — a customer who qualified
 *    before the cutoff is excluded from a `qualifiedSince`-scoped filter even
 *    though they still match the unscoped (all-time) one, for both single-
 *    collection triggers (`checkout-start`, `one-time-purchase`).
 * 4. CANCEL-CLICK'S "not resubscribed" CHECK USES `autoRenew`, NOT `isActive`
 *    (found sanity-checking the recency buckets against production, 2026-09-01).
 *    A default self-service cancel is cancel-at-period-end:
 *    `subscription.isActive` stays `true` until the already-paid period
 *    actually lapses, so keying "has not resubscribed" off `isActive` silently
 *    excludes every recent canceller for as long as their grace window lasts —
 *    exactly the customers this trigger exists to reach. See
 *    `hasNotResubscribedOr`'s doc comment in `bonusCodeAudienceFilter.ts`.
 *
 * Pure: no DB, no network.
 */
import fs from "node:fs";
import path from "node:path";
import mongoose from "mongoose";
import {
  buildCancelClickUserFilter,
  buildCheckoutStartAudienceFilter,
  buildOneTimePurchaseAudienceFilter,
  CANCEL_CLICK_FLOW_EVENT_FILTER,
  cutoffDate,
  hasNotResubscribedOr,
  notCurrentlyActiveSubscriberOr,
  RECENCY_WINDOW_DAYS,
} from "../../../utils/redeemables/bonusCodeAudienceFilter";
import { BONUS_CODE_BY_TRIGGER } from "../../../config/bonusCodes";

let failures = 0;
function check(name: string, actual: boolean, expected: boolean) {
  if (actual === expected) console.log(`  PASS  ${name}`);
  else {
    failures++;
    console.error(`  FAIL  ${name}\n        expected: ${expected}\n        actual:   ${actual}`);
  }
}

// ─── A minimal Mongo-filter evaluator, scoped to exactly what the builders emit ──

type PlainDoc = Record<string, unknown>;

/**
 * Resolves a dotted path, replicating Mongo's own semantics for a path that
 * descends INTO an array via a non-index field name (e.g. `oneTimePackages.purchaseDate`):
 * it projects that field across every element, and the match below then applies
 * "ANY element satisfies" — exactly how a real Mongo dotted-path match behaves,
 * without needing a real database to prove it.
 */
function getPath(obj: unknown, dottedPath: string): unknown {
  return resolveSegments(obj, dottedPath.split("."));
}

function resolveSegments(value: unknown, segments: string[]): unknown {
  if (segments.length === 0) return value;
  if (value == null) return undefined;
  const [head, ...rest] = segments;
  if (Array.isArray(value) && !/^\d+$/.test(head)) {
    return value.map((item) => resolveSegments(item, [head, ...rest]));
  }
  return resolveSegments((value as Record<string, unknown>)[head], rest);
}

function toComparable(value: unknown): number | unknown {
  return value instanceof Date ? value.getTime() : value;
}

/** `actual` may be a plain value OR an array of projected values (see getPath above). */
function valueMatches(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(actual)) return actual.some((v) => valueMatches(v, expected));
  if (expected !== null && typeof expected === "object" && !Array.isArray(expected)) {
    return Object.entries(expected as Record<string, unknown>).every(([op, opVal]) => {
      if (op === "$ne") return actual !== opVal;
      if (op === "$exists") return opVal ? actual !== undefined : actual === undefined;
      if (op === "$gte") {
        if (actual == null) return false;
        return (toComparable(actual) as number) >= (toComparable(opVal) as number);
      }
      throw new Error(`bonus-code-audience.test.ts evaluator: unsupported operator "${op}"`);
    });
  }
  return actual === expected;
}

function evaluateClause(doc: PlainDoc, clause: Record<string, unknown>): boolean {
  return Object.entries(clause).every(([key, value]) => {
    if (key === "$and") return (value as Record<string, unknown>[]).every((c) => evaluateClause(doc, c));
    if (key === "$or") return (value as Record<string, unknown>[]).some((c) => evaluateClause(doc, c));
    // `_id: { $in: [...] }` selects WHICH users step 1 (CancellationFlowEvent)
    // already found — not tested here, since the fixtures below are always
    // constructed as members of that array. What this evaluator exists to
    // check is the step-2 USER-side narrowing (isActive / subscription.isActive).
    if (key === "_id") return true;

    return valueMatches(getPath(doc, key), value);
  });
}

function matches(doc: PlainDoc, filter: Record<string, unknown>): boolean {
  return evaluateClause(doc, filter);
}

async function run() {
  console.log("\nTHE CODE MAP — read from config, never restated");

  // src/config/bonusCodes.ts is the single source; a second literal here would
  // silently drift. Grep for the exact object-literal shape (`"key": "CODE"`),
  // which prose comments describing the map (used throughout these files'
  // doc comments) do not accidentally match.
  const auditedFiles = [
    "../../../utils/redeemables/bonusCodeAudienceFilter.ts",
    "../BonusCodeAudienceService.ts",
    "../../../app/api/admin/monthly-coupon/trigger-audience/route.ts",
    "../../../components/admin/BonusCodeAudiencePanel.tsx",
  ];
  const restatedMapPattern = /["'](cancel-click|checkout-start|one-time-purchase)["']\s*:\s*["'](BACKIN200|LOCKIN100|EXTRA100)["']/;
  for (const relativeFile of auditedFiles) {
    const absPath = path.resolve(__dirname, relativeFile);
    const source = fs.readFileSync(absPath, "utf8");
    check(`${path.basename(absPath)} does not restate a trigger->code literal`, restatedMapPattern.test(source), false);
  }
  const serviceSource = fs.readFileSync(path.resolve(__dirname, "../BonusCodeAudienceService.ts"), "utf8");
  check(
    "BonusCodeAudienceService imports BONUS_CODE_BY_TRIGGER from config/bonusCodes",
    /from\s+["']@\/config\/bonusCodes["']/.test(serviceSource) && serviceSource.includes("BONUS_CODE_BY_TRIGGER"),
    true
  );
  check(
    "BONUS_CODE_BY_TRIGGER still names exactly the three triggers this service resolves",
    Object.keys(BONUS_CODE_BY_TRIGGER).sort().join(",") === "cancel-click,checkout-start,one-time-purchase",
    true
  );

  console.log("\nCHECKOUT-START (LOCKIN100) — agrees with trigger-eligibility's 'noSubscription' population");

  const checkoutStartFilter = buildCheckoutStartAudienceFilter() as Record<string, unknown>;
  check(
    "guest, no subscription, zero entries -> addressable (matches trigger-eligibility's noSubscription fixture)",
    matches({ isActive: true }, checkoutStartFilter),
    true
  );
  check(
    "active member with entries -> NOT addressable (already converted)",
    matches({ isActive: true, subscription: { isActive: true }, accumulatedEntries: 500 }, checkoutStartFilter),
    false
  );
  check(
    "ex-member with entries from their membership tenure -> NOT addressable (belongs to cancel-click, not checkout-start)",
    matches({ isActive: true, subscription: { isActive: false }, accumulatedEntries: 620 }, checkoutStartFilter),
    false
  );
  check(
    "deactivated account -> NOT addressable (matches trigger-eligibility's hard stop)",
    matches({ isActive: false }, checkoutStartFilter),
    false
  );

  console.log("\nONE-TIME-PURCHASE (EXTRA100) — 'a one-time pack while NOT holding an active membership'");

  const oneTimeFilter = buildOneTimePurchaseAudienceFilter() as Record<string, unknown>;
  check(
    "bought a one-time pack, no active subscription -> addressable",
    matches({ isActive: true, oneTimePackages: [{ packageId: "apprentice" }] }, oneTimeFilter),
    true
  );
  check(
    "bought a one-time pack AND holds an active membership -> NOT addressable",
    matches(
      { isActive: true, subscription: { isActive: true }, oneTimePackages: [{ packageId: "apprentice" }] },
      oneTimeFilter
    ),
    false
  );
  check(
    "never bought a one-time pack -> NOT addressable",
    matches({ isActive: true }, oneTimeFilter),
    false
  );
  check(
    "deactivated account -> NOT addressable",
    matches({ isActive: false, oneTimePackages: [{ packageId: "apprentice" }] }, oneTimeFilter),
    false
  );

  console.log("\nCANCEL-CLICK (BACKIN200) — matches trigger-eligibility's 'justCancelled' population");

  check(
    "flow-event filter reads the COMMITTED outcome, not in_progress/saved",
    CANCEL_CLICK_FLOW_EVENT_FILTER.outcome === "cancelled",
    true
  );

  const memberId = new mongoose.Types.ObjectId();
  const cancelClickFilter = buildCancelClickUserFilter([memberId]) as Record<string, unknown>;
  check(
    "member who cancelled immediately (subscription.isActive false) -> addressable (byte-identical fixture to trigger-eligibility's justCancelled)",
    matches({ _id: memberId, isActive: true, subscription: { isActive: false, packageId: "tradie" } }, cancelClickFilter),
    true
  );
  check(
    "committed a cancellation but has GENUINELY resubscribed (autoRenew back on) -> NOT addressable (already renewed; not part of the forecast)",
    matches({ _id: memberId, isActive: true, subscription: { isActive: true, autoRenew: true } }, cancelClickFilter),
    false
  );
  check(
    // THE BUG THIS SECTION EXISTS TO CATCH (2026-09-01). cancelSubscription defaults to
    // cancelAtPeriodEnd: true, which sets autoRenew: false immediately but leaves
    // subscription.isActive: true until the already-paid period actually lapses — so a
    // customer who cancelled ten minutes ago, mid-grace-period, is NOT a resubscriber and
    // must still be addressable. Using notCurrentlyActiveSubscriberOr (isActive) here
    // instead of hasNotResubscribedOr (autoRenew) silently excluded this entire cohort —
    // caught against production, where it cut the last-30-day cancel-click count from
    // several hundred down to double digits.
    "cancelled but still mid-grace-period (isActive still true, autoRenew already false) -> addressable, NOT a resubscriber",
    matches({ _id: memberId, isActive: true, subscription: { isActive: true, autoRenew: false } }, cancelClickFilter),
    true
  );
  check(
    "deactivated account -> NOT addressable",
    matches({ _id: memberId, isActive: false, subscription: { isActive: false } }, cancelClickFilter),
    false
  );

  console.log("\nSHARED HELPERS — the two 'not currently X' clauses are DIFFERENT on purpose");
  const orClauses = notCurrentlyActiveSubscriberOr();
  check("notCurrentlyActiveSubscriberOr carries exactly three clauses (no subscription field / null / isActive not true)", orClauses.length === 3, true);
  const resubscribeClauses = hasNotResubscribedOr();
  check("hasNotResubscribedOr carries exactly three clauses (no subscription field / null / autoRenew not true)", resubscribeClauses.length === 3, true);
  check(
    "hasNotResubscribedOr's third clause keys off autoRenew, NOT isActive — the field that actually distinguishes the two questions",
    JSON.stringify(resubscribeClauses[2]) === JSON.stringify({ "subscription.autoRenew": { $ne: true } }),
    true
  );

  console.log("\nRECENCY BUCKETING (2026-09-01) — an all-time count overstates the actionable pool by an order of magnitude");

  const NOW = new Date("2026-09-01T00:00:00.000Z");
  check(
    "cutoffDate(now, 30) is exactly 30*24h before now — pure epoch-millisecond arithmetic, no ambient clock",
    cutoffDate(NOW, 30).getTime() === NOW.getTime() - 30 * 24 * 60 * 60 * 1000,
    true
  );
  check("RECENCY_WINDOW_DAYS names the two windows the card leads with", RECENCY_WINDOW_DAYS.last30 === 30 && RECENCY_WINDOW_DAYS.last90 === 90, true);

  const cutoff30 = cutoffDate(NOW, RECENCY_WINDOW_DAYS.last30);
  const recentGuest = { isActive: true, createdAt: new Date("2026-08-20T00:00:00.000Z") }; // 12 days ago
  const staleGuest = { isActive: true, createdAt: new Date("2026-03-01T00:00:00.000Z") }; // ~6 months ago

  const checkoutStartAllTime = buildCheckoutStartAudienceFilter() as Record<string, unknown>;
  const checkoutStart30 = buildCheckoutStartAudienceFilter({ qualifiedSince: cutoff30 }) as Record<string, unknown>;
  check("a guest who registered 12 days ago is in the all-time checkout-start pool", matches(recentGuest, checkoutStartAllTime), true);
  check("...and is ALSO in the last-30-day pool", matches(recentGuest, checkoutStart30), true);
  check("a guest who registered ~6 months ago is STILL in the all-time pool (that's the point of keeping it)", matches(staleGuest, checkoutStartAllTime), true);
  check(
    "...but is EXCLUDED from the last-30-day pool — the Klaviyo flow could never have reached them this window",
    matches(staleGuest, checkoutStart30),
    false
  );

  const recentBuyer = { isActive: true, oneTimePackages: [{ purchaseDate: new Date("2026-08-25T00:00:00.000Z") }] }; // 7 days ago
  const staleBuyer = { isActive: true, oneTimePackages: [{ purchaseDate: new Date("2026-01-01T00:00:00.000Z") }] }; // ~8 months ago
  const oneTimeAllTime = buildOneTimePurchaseAudienceFilter() as Record<string, unknown>;
  const oneTime30 = buildOneTimePurchaseAudienceFilter({ qualifiedSince: cutoff30 }) as Record<string, unknown>;
  check("bought a one-time pack 7 days ago -> in both the all-time and last-30-day pools", matches(recentBuyer, oneTimeAllTime) && matches(recentBuyer, oneTime30), true);
  check("bought a one-time pack ~8 months ago -> in the all-time pool", matches(staleBuyer, oneTimeAllTime), true);
  check("...but NOT in the last-30-day pool", matches(staleBuyer, oneTime30), false);
  check(
    "a customer with BOTH an old and a recent purchase counts by their MOST RECENT one (any-element $gte match)",
    matches(
      { isActive: true, oneTimePackages: [{ purchaseDate: new Date("2026-01-01T00:00:00.000Z") }, { purchaseDate: new Date("2026-08-30T00:00:00.000Z") }] },
      oneTime30
    ),
    true
  );

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log("\nAll assertions passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
