import assert from "node:assert/strict";
import {
  AREAS,
  PERMISSIONS,
  ALL_PERMISSIONS,
  isValidPermission,
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

test("AREAS contains the 15 expected areas", () => {
  assert.equal(AREAS.length, 15);
  assert.ok(AREAS.includes("users"));
  assert.ok(AREAS.includes("settings"));
});

test("PERMISSIONS contains view + edit for every area", () => {
  assert.equal(PERMISSIONS.length, AREAS.length * 2);
  for (const a of AREAS) {
    assert.ok(PERMISSIONS.includes(`${a}.view`), `missing ${a}.view`);
    assert.ok(PERMISSIONS.includes(`${a}.edit`), `missing ${a}.edit`);
  }
});

test("ALL_PERMISSIONS is a Set with same size as PERMISSIONS", () => {
  assert.equal(ALL_PERMISSIONS.size, PERMISSIONS.length);
});

test("isValidPermission accepts known and rejects unknown", () => {
  assert.equal(isValidPermission("users.view"), true);
  assert.equal(isValidPermission("users.delete"), false);
  assert.equal(isValidPermission(""), false);
});

test("permissionFor returns correct strings", () => {
  assert.deepEqual(permissionFor("users"), { view: "users.view", edit: "users.edit" });
});

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log("\nAll tests passed");
