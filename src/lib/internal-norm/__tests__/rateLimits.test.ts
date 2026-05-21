import { strict as assert } from "node:assert";
import { checkNormRateLimit, __resetForTests } from "@/lib/internal-norm/rateLimits";

__resetForTests();
// read tier: 120/min
for (let i = 0; i < 120; i++) {
  const r = checkNormRateLimit({ tier: "read", registryKey: "health", clientKey: "test" });
  assert.equal(r.ok, true);
}
const blocked = checkNormRateLimit({ tier: "read", registryKey: "health", clientKey: "test" });
assert.equal(blocked.ok, false);
// Different client = different bucket
const otherClient = checkNormRateLimit({ tier: "read", registryKey: "health", clientKey: "other" });
assert.equal(otherClient.ok, true);
// Per-endpoint override: 10/min on roas.summary
__resetForTests();
for (let i = 0; i < 10; i++) {
  const r = checkNormRateLimit({ tier: "read", registryKey: "roas.summary", clientKey: "k", perEndpointPerMinute: 10 });
  assert.equal(r.ok, true);
}
const overrideBlocked = checkNormRateLimit({
  tier: "read", registryKey: "roas.summary", clientKey: "k", perEndpointPerMinute: 10,
});
assert.equal(overrideBlocked.ok, false);
console.log("✓ rate limits: tier ceilings + per-client buckets + per-endpoint override");
