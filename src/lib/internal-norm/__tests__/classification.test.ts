import { strict as assert } from "node:assert";
import { NORM_ENDPOINTS, NORM_TIERS, getEndpoint } from "@/lib/internal-norm/classification";
import { ALL_PERMISSIONS } from "@/lib/permissions";

assert.ok(Array.isArray(NORM_TIERS) || typeof NORM_TIERS === "object", "NORM_TIERS exported");
// "forbidden" is NOT a tier under the new design
assert.equal((NORM_TIERS as readonly string[]).includes("forbidden"), false);
assert.equal(typeof NORM_ENDPOINTS, "object");
// Health must be present in the registry from day one
const health = getEndpoint("health");
assert.ok(health, "health endpoint registered");
assert.equal(health!.path, "/v1/health");
assert.equal(health!.tier, "read");
assert.ok(ALL_PERMISSIONS.has(health!.requiredPermission), "health.requiredPermission is in catalog");
// Unknown key returns undefined (NOT throw — caller decides)
assert.equal(getEndpoint("nope.nonexistent"), undefined);
// Every registry entry has a valid permission (boot-time guard already throws on load, this re-asserts)
for (const [key, spec] of Object.entries(NORM_ENDPOINTS)) {
  assert.ok(ALL_PERMISSIONS.has(spec.requiredPermission), `${key}.requiredPermission not in catalog`);
}
console.log("✓ classification registry exports + lookup + permission validity ok");
