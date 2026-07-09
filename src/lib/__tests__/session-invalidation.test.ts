import assert from "node:assert/strict";

/**
 * Regression test for the staff auto-logout bug: apiRequest's force-logout
 * treated 403 (authorization — "authenticated but not allowed") the same as
 * 401 (authentication), so any staff role lacking one permission used by an
 * auto-mounted admin widget (e.g. Overview → TopDrawsCard → miniDraws.view)
 * was force-signed-out seconds after login.
 *
 * Run: npm run test:session-invalidation
 */

let failures = 0;
const test = (name: string, fn: () => void | Promise<void>) => {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`✓ ${name}`))
    .catch((e: Error) => {
      failures++;
      console.error(`✗ ${name}\n  ${e.message}`);
    });
};

async function main() {
  const { shouldInvalidateSession } = await import("@/lib/queries");

  await test("401 invalidates the session (not authenticated)", () => {
    assert.equal(shouldInvalidateSession(401), true);
  });

  await test("403 does NOT invalidate the session (permission denied is routine for staff roles)", () => {
    assert.equal(shouldInvalidateSession(403), false);
  });

  await test("403 with an error code still does NOT invalidate", () => {
    assert.equal(shouldInvalidateSession(403, "FORBIDDEN"), false);
  });

  await test("404 + USER_NOT_FOUND invalidates (dangling session, backing user gone)", () => {
    assert.equal(shouldInvalidateSession(404, "USER_NOT_FOUND"), true);
  });

  await test("plain 404 does NOT invalidate", () => {
    assert.equal(shouldInvalidateSession(404), false);
  });

  await test("400 / 429 / 500 do NOT invalidate", () => {
    assert.equal(shouldInvalidateSession(400), false);
    assert.equal(shouldInvalidateSession(429), false);
    assert.equal(shouldInvalidateSession(500), false);
  });

  if (failures > 0) {
    console.error(`\n${failures} test(s) failed`);
    process.exit(1);
  }
  console.log("\nAll session-invalidation tests passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
