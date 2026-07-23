import assert from "node:assert/strict";
import { isPrivilegedAccount } from "@/utils/auth/privileged-account";

// Pure logic — no env / DB. Guards the invariant that the public registration
// path (/api/auth/register) can never create or overwrite a staff/admin account.
// Regression anchor for the 2026-07-23 privileged-account-overwrite fix.

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

// --- privileged (must be rejected by register) ---

test("legacy super-admin (role:admin + userType:admin + roleId) is privileged", () => {
  assert.equal(
    isPrivilegedAccount({ role: "admin", userType: "admin", roleId: "abc123" }),
    true
  );
});

test("CRITICAL: Customer Support staff (role:user, userType:staff, roleId) is privileged", () => {
  // This is the real production shape that a naive `role !== "user"` check MISSES.
  assert.equal(
    isPrivilegedAccount({ role: "user", userType: "staff", roleId: "cs-role-id" }),
    true
  );
});

test("account with a roleId but stale role/userType is still privileged (roleId is definitive)", () => {
  assert.equal(
    isPrivilegedAccount({ role: "user", userType: "customer", roleId: "some-role" }),
    true
  );
});

test("staff by userType alone (no roleId yet) is privileged", () => {
  assert.equal(isPrivilegedAccount({ role: "user", userType: "staff", roleId: null }), true);
});

test("legacy admin by role alone is privileged", () => {
  assert.equal(isPrivilegedAccount({ role: "admin", userType: "customer", roleId: null }), true);
});

// --- NOT privileged (normal customers — register may still create/update these) ---

test("plain customer (role:user, userType:customer, roleId:null) is NOT privileged", () => {
  assert.equal(
    isPrivilegedAccount({ role: "user", userType: "customer", roleId: null }),
    false
  );
});

test("legacy customer with missing userType/roleId is NOT privileged", () => {
  assert.equal(isPrivilegedAccount({ role: "user" }), false);
});

test("null / undefined user is NOT privileged", () => {
  assert.equal(isPrivilegedAccount(null), false);
  assert.equal(isPrivilegedAccount(undefined), false);
});

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log("\nAll tests passed");
