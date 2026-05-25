import assert from "node:assert/strict";
import { userScopedCacheControl } from "../cache-control";

let failed = 0;
function test(name: string, fn: () => void) {
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.error(`  ✗ ${name}`); console.error(e instanceof Error ? e.message : String(e)); }
}

const PUBLIC = "public, s-maxage=60, stale-while-revalidate=300";

test("authenticated → private, no-store (never shared/stored)", () => {
  const r = userScopedCacheControl(true, PUBLIC);
  assert.equal(r.cacheControl, "private, no-store");
  assert.equal(r.vary, "Cookie");
});

test("guest → passes through public value but Vary: Cookie isolates it", () => {
  const r = userScopedCacheControl(false, PUBLIC);
  assert.equal(r.cacheControl, PUBLIC);
  assert.equal(r.vary, "Cookie");
});

test("guest no-store value passes through unchanged", () => {
  const r = userScopedCacheControl(false, "no-store, must-revalidate");
  assert.equal(r.cacheControl, "no-store, must-revalidate");
});

console.log(failed === 0 ? "\nAll cache-control tests passed" : `\n${failed} test(s) failed`);
process.exit(failed === 0 ? 0 : 1);
