import assert from "node:assert/strict";
import {
  AREA_ACTIONS,
  AREAS,
  PERMISSIONS,
  ALL_PERMISSIONS,
  isValidPermission,
  actionsFor,
  permissionFor,
} from "@/lib/permissions";

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

test("AREAS matches AREA_ACTIONS keys exactly", () => {
  assert.deepEqual(AREAS, Object.keys(AREA_ACTIONS));
  assert.equal(AREAS.length, 15);
});

test("every area declares at least a 'view' action", () => {
  for (const a of AREAS) {
    assert.ok(AREA_ACTIONS[a].includes("view"), `area ${a} is missing the 'view' action`);
  }
});

test("PERMISSIONS contains exactly one entry per (area, action) pair", () => {
  const expected = AREAS.reduce((sum, a) => sum + AREA_ACTIONS[a].length, 0);
  assert.equal(PERMISSIONS.length, expected);
  for (const a of AREAS) {
    for (const action of AREA_ACTIONS[a]) {
      assert.ok(PERMISSIONS.includes(`${a}.${action}` as never), `missing ${a}.${action}`);
    }
  }
});

test("Users area has the destructive + financial sub-actions", () => {
  assert.deepEqual(
    [...AREA_ACTIONS.users],
    ["view", "edit", "charge", "cancelSubscription", "refund", "delete"]
  );
});

test("Promos area has the 'end' sub-action", () => {
  assert.ok(AREA_ACTIONS.promos.includes("end"));
});

test("Major draw and AB testing have 'selectWinner'", () => {
  assert.ok(AREA_ACTIONS.majorDraw.includes("selectWinner"));
  assert.ok(AREA_ACTIONS.abTesting.includes("selectWinner"));
});

test("Affiliates has 'processPayout' and 'delete'", () => {
  assert.ok(AREA_ACTIONS.affiliates.includes("processPayout"));
  assert.ok(AREA_ACTIONS.affiliates.includes("delete"));
});

test("ALL_PERMISSIONS is a Set with same size as PERMISSIONS", () => {
  assert.equal(ALL_PERMISSIONS.size, PERMISSIONS.length);
});

test("isValidPermission accepts known and rejects unknown", () => {
  assert.equal(isValidPermission("users.view"), true);
  assert.equal(isValidPermission("users.delete"), true);
  assert.equal(isValidPermission("users.charge"), true);
  assert.equal(isValidPermission("majorDraw.selectWinner"), true);
  assert.equal(isValidPermission("users.banhammer"), false);
  assert.equal(isValidPermission("overview.delete"), false);
  assert.equal(isValidPermission(""), false);
});

test("actionsFor returns the declared tuple", () => {
  assert.deepEqual([...actionsFor("settings")], ["view", "edit"]);
  assert.deepEqual([...actionsFor("overview")], ["view", "edit"]);
});

test("permissionFor composes (area, action) into a valid string", () => {
  assert.equal(permissionFor("users", "delete"), "users.delete");
  assert.equal(permissionFor("affiliates", "processPayout"), "affiliates.processPayout");
  // The cast below is exercised at type-check time too — passing an action
  // foreign to the area is a compile error.
  assert.equal(permissionFor("settings", "edit"), "settings.edit");
});

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log("\nAll tests passed");
