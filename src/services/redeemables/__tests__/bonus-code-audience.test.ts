/**
 * bonus-code-audience.test.ts
 *
 * Pins two things about `BonusCodeAudienceService` / `bonusCodeAudienceFilter.ts`:
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
 *    builders use ($and/$or/$ne/$exists/$in, dotted paths).
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
  notCurrentlyActiveSubscriberOr,
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

function getPath(obj: unknown, dottedPath: string): unknown {
  return dottedPath.split(".").reduce<unknown>((acc, key) => {
    if (acc == null) return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
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

    const actual = getPath(doc, key);
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      return Object.entries(value as Record<string, unknown>).every(([op, opVal]) => {
        if (op === "$ne") return actual !== opVal;
        if (op === "$exists") return opVal ? actual !== undefined : actual === undefined;
        throw new Error(`bonus-code-audience.test.ts evaluator: unsupported operator "${op}"`);
      });
    }
    return actual === value;
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
    "committed a cancellation but has since resubscribed -> NOT addressable (already renewed; not part of the forecast)",
    matches({ _id: memberId, isActive: true, subscription: { isActive: true } }, cancelClickFilter),
    false
  );
  check(
    "deactivated account -> NOT addressable",
    matches({ _id: memberId, isActive: false, subscription: { isActive: false } }, cancelClickFilter),
    false
  );

  console.log("\nSHARED HELPER — notCurrentlyActiveSubscriberOr matches the 'inactive' branch shape used elsewhere");
  const orClauses = notCurrentlyActiveSubscriberOr();
  check("carries exactly three clauses (no subscription field / null / isActive not true)", orClauses.length === 3, true);

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
