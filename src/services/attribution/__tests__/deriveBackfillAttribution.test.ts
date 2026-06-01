import assert from "node:assert/strict";
import { deriveBackfillAttribution } from "../deriveBackfillAttribution";

// utm_source normalizes (with casing) → platform
{
  const r = deriveBackfillAttribution({ utmSource: "Facebook" });
  assert.equal(r.convertingPlatform, "meta");
  assert.equal(r.attributionConfidence, "inferred_backfill");
}
// klaviyo splits by medium
assert.equal(deriveBackfillAttribution({ utmSource: "klaviyo", utmMedium: "sms" }).convertingPlatform, "klaviyo_sms");
// no utm_source but Meta ad-id present → meta
assert.equal(deriveBackfillAttribution({ hasMetaAdAttribution: true }).convertingPlatform, "meta");
// no signal at all → direct
assert.equal(deriveBackfillAttribution({}).convertingPlatform, "direct");
// unknown source → other
assert.equal(deriveBackfillAttribution({ utmSource: "newsletter" }).convertingPlatform, "other");
// confidence is ALWAYS inferred_backfill, even with a clear source
assert.equal(deriveBackfillAttribution({ utmSource: "tiktok" }).attributionConfidence, "inferred_backfill");
// isRenewal from billingReason
assert.equal(deriveBackfillAttribution({ billingReason: "subscription_cycle" }).isRenewal, true);
assert.equal(deriveBackfillAttribution({ billingReason: "subscription_create" }).isRenewal, false);
assert.equal(deriveBackfillAttribution({}).isRenewal, false);

console.log("deriveBackfillAttribution: all assertions passed");
