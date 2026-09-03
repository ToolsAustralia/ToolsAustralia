import { config } from "dotenv";
import path from "node:path";
import assert from "node:assert/strict";

// Load .env.local before dynamic imports that read env vars at module load.
// api-auth-permissions transitively imports @/lib/auth → @/lib/jwt, which
// throws if NEXTAUTH_SECRET / MONGODB_URI / GOOGLE_CLIENT_* are unset.
// Using dynamic imports below ensures config() runs first.
config({ path: path.resolve(process.cwd(), ".env.local") });

let failures = 0;
const test = (name: string, fn: () => void) => {
  try { fn(); console.log(`✓ ${name}`); }
  catch (e) { failures++; console.error(`✗ ${name}\n  ${(e as Error).message}`); }
};

async function run() {
  const { hasPermissionInList, LEGACY_ADMIN_ALL } = await import("@/lib/api-auth-permissions");
  const { PERMISSIONS } = await import("@/lib/permissions");

  test("hasPermissionInList returns true when permission is present", () => {
    assert.equal(hasPermissionInList(["users.view", "users.edit"], "users.view"), true);
  });

  test("hasPermissionInList returns false when permission is absent", () => {
    assert.equal(hasPermissionInList(["users.view"], "users.edit"), false);
  });

  test("hasPermissionInList returns false on empty list", () => {
    assert.equal(hasPermissionInList([], "users.view"), false);
  });

  test("LEGACY_ADMIN_ALL is the full PERMISSIONS array (frozen)", () => {
    assert.equal(LEGACY_ADMIN_ALL.length, PERMISSIONS.length);
    assert.ok(Object.isFrozen(LEGACY_ADMIN_ALL));
  });

  if (failures > 0) { console.error(`\n${failures} test(s) failed`); process.exit(1); }
  console.log("\nAll tests passed");
  // Explicit exit: the dynamic `@/lib/api-auth-permissions` import pulls in
  // `@/lib/auth`, which opens a Mongo handle that keeps the event loop alive.
  // Without this the suite prints "All tests passed" and then hangs forever —
  // a chained `&&` never returns. Same reason as the other exit(0) suites.
  process.exit(0);
}

run().catch((err) => { console.error(err); process.exit(1); });
