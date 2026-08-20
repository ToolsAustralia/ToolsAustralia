import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  SHOP_ENTRY_MULTIPLIER_MAX,
  SHOP_ENTRY_MULTIPLIER_MIN,
} from "@/utils/shop/entry-multiplier";

/**
 * The admin panel ⇄ route contract for the merchandise entry multiplier.
 *
 * WHY THIS EXISTS
 *
 * `ShopEntryMultiplierPanel` serialised the shop-wide value under the key `cap`,
 * while the route's Zod schema requires `multiplier` and strips unknown keys — so
 * every save 400'd and the panel had NEVER successfully written anything. The read
 * half was broken the same way (`config.cap` against a response carrying
 * `multiplier`), so every dropdown showed the blank option no matter what was
 * stored. All three tiers save on one button, so the whole feature was
 * unconfigurable in production.
 *
 * `tsc` cannot catch this class of bug: `res.json()` is untyped and the request
 * body is an object literal, so neither side of the wire has a shared type. The
 * only thing that catches it is asserting the ACTUAL wire keys.
 *
 * These assertions read the panel SOURCE rather than rendering it. That is
 * deliberate: there is no DOM test runner here, and the thing that broke was a
 * literal key name, which is visible in the source and is exactly what drifted.
 */

let failures = 0;
const test = (name: string, fn: () => void) => {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (e) {
    failures++;
    console.error(`✗ ${name}\n  ${(e as Error).message}`);
  }
};

const read = (rel: string) => readFileSync(path.resolve(process.cwd(), rel), "utf8");

const PANEL = read("src/components/admin/ShopEntryMultiplierPanel.tsx");
const ROUTE = read("src/app/api/admin/shop/entry-multiplier/route.ts");

/** A faithful copy of the route's own schema, kept in step by the test below. */
const multiplierSchema = z
  .number()
  .int()
  .min(SHOP_ENTRY_MULTIPLIER_MIN)
  .max(SHOP_ENTRY_MULTIPLIER_MAX)
  .nullable();

const updateSchema = z.object({
  multiplier: multiplierSchema,
  categoryMultipliers: z.record(z.string().trim().min(1), multiplierSchema).optional(),
  productMultipliers: z.record(z.string().trim().min(1), multiplierSchema).optional(),
});

test("the route still requires exactly the keys this test models", () => {
  // If the route's schema gains or renames a required key, this test's copy is
  // stale and every assertion below is worthless. Pin the names to the source.
  assert.match(ROUTE, /multiplier:\s*multiplierSchema/, "route must require `multiplier`");
  assert.match(ROUTE, /categoryMultipliers:\s*z\s*\.?\s*record/, "route must accept categoryMultipliers");
  assert.match(ROUTE, /productMultipliers:\s*z\s*\.?\s*record/, "route must accept productMultipliers");
});

test("the panel PUTs `multiplier`, not `cap`", () => {
  // The exact defect: `cap: toValue(draft.cap)` in the request body.
  assert.match(
    PANEL,
    /body:\s*JSON\.stringify\(\{[\s\S]{0,600}?multiplier:\s*toValue\(/,
    "the PUT body must carry a `multiplier` key"
  );
  assert.ok(
    !/body:\s*JSON\.stringify\(\{[\s\S]{0,600}?\bcap:\s*toValue\(/.test(PANEL),
    "the PUT body must NOT carry a `cap` key — the route strips it and then rejects the request"
  );
});

test("the body the panel sends actually parses against the route's schema", () => {
  // What the panel builds for a fully-populated form.
  const panelBody = {
    multiplier: 3,
    categoryMultipliers: { apparel: 2 },
    productMultipliers: { "6a87459873a4a7fa8521910e": 5 },
  };
  const parsed = updateSchema.safeParse(panelBody);
  assert.ok(parsed.success, `panel body must parse: ${JSON.stringify(parsed.error?.issues)}`);

  // CONTROL: the old body must FAIL, or this assertion proves nothing.
  const oldBody = { cap: 3, categoryMultipliers: {}, productMultipliers: {} };
  const oldParsed = updateSchema.safeParse(oldBody);
  assert.ok(!oldParsed.success, "control: the old `cap` body must be rejected");
  assert.match(
    JSON.stringify(oldParsed.error?.issues),
    /multiplier/,
    "and it must be rejected FOR the missing multiplier key"
  );
});

test("a cleared field sends null, which the schema accepts", () => {
  // Blank means "inherit" — it must reach the server as an explicit null so the
  // stored value is removed, not merely omitted.
  assert.ok(updateSchema.safeParse({ multiplier: null }).success);
  assert.ok(updateSchema.safeParse({ multiplier: null, categoryMultipliers: { apparel: null } }).success);
});

test("out-of-range values are rejected at the boundary", () => {
  assert.ok(!updateSchema.safeParse({ multiplier: 0 }).success, "0 is below the floor");
  assert.ok(
    !updateSchema.safeParse({ multiplier: SHOP_ENTRY_MULTIPLIER_MAX + 1 }).success,
    "above the ceiling must be rejected"
  );
  assert.ok(!updateSchema.safeParse({ multiplier: 2.5 }).success, "a fractional multiplier is not a thing");
  assert.ok(updateSchema.safeParse({ multiplier: SHOP_ENTRY_MULTIPLIER_MIN }).success);
  assert.ok(updateSchema.safeParse({ multiplier: SHOP_ENTRY_MULTIPLIER_MAX }).success);
});

test("the panel READS `multiplier` off the GET response, not `cap`", () => {
  assert.match(PANEL, /config\.multiplier/, "toDraft must read config.multiplier");
  assert.match(PANEL, /p\.multiplier/, "product rows must read p.multiplier");
  assert.ok(
    !/config\.cap|p\.cap\b/.test(PANEL),
    "no `cap` reads may remain — the GET returns `multiplier`, so a cap read is always undefined"
  );
  // And the route really does return that key.
  assert.match(ROUTE, /multiplier:\s*config\.multiplier\s*\?\?\s*null/, "GET must return `multiplier`");
});

test("no ceiling framing survives in admin-VISIBLE copy", () => {
  // The resolver returns the most specific value UNCHANGED — there is no min()
  // anywhere in the chain. Copy promising "can never lift above the packs" would
  // lead an admin to set a 10 believing it were a harmless cap.
  //
  // Scoped to everything BELOW the leading docblock on purpose: that docblock still
  // uses the word "ceiling" while recording what the old model claimed and why it
  // was wrong, which is worth keeping. What must not survive is copy an admin READS.
  const body = PANEL.slice(PANEL.indexOf("*/") + 2);
  for (const banned of [/No ceiling/, /min\(promo/, /never lift/, /Save ceilings/]) {
    assert.ok(!banned.test(body), `ceiling framing survives in panel copy: ${banned}`);
  }
  // And the replacement is present, so this cannot pass merely by deletion.
  assert.match(body, /Most specific wins/, "the panel must still explain the hierarchy");
  assert.match(body, /Inherit/, "blank must be labelled as inherit");
});

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log("\nAll tests passed");
