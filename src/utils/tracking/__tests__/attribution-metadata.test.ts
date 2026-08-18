import assert from "node:assert/strict";
import { buildAttributionMetadata } from "../attribution-metadata";

/**
 * Guards the payment path against attribution data.
 *
 * Stripe rejects an entire request if any metadata value exceeds 500 characters, and nothing
 * upstream caps these: `attributionSchema` is plain `z.string().optional()`, and the values
 * come from the URL — anyone can append `?utm_source=<600 chars>` to a landing link.
 *
 * Every purchase path calls this function (create-subscription, create-payment-intent,
 * create-one-time-purchase + existing-user, mini-draw/purchase, upsell/purchase), so an
 * unbounded value fails the CHARGE, not just the reporting.
 *
 * This was unreachable until 2026-08-10 because `extractAttributionParams` silently returned
 * {} for `window.location.search`, leaving these values permanently empty. Fixing that parser
 * is what made a long UTM able to reach Stripe at all.
 */

const LIMIT = 500;

// Empty / malformed input yields no metadata rather than throwing.
{
  assert.deepEqual(buildAttributionMetadata(undefined), {});
  assert.deepEqual(buildAttributionMetadata(null), {});
  assert.deepEqual(buildAttributionMetadata({}), {});
}

// Normal values pass through untouched — truncation must not disturb ordinary campaigns.
{
  const meta = buildAttributionMetadata({
    utm_source: "tiktok",
    utm_medium: "paid",
    utm_campaign: "aug-milwaukee",
    campaign_id: "120235851321270567",
    adset_id: "2",
    ad_id: "3",
  });
  assert.equal(meta.attr_utm_source, "tiktok");
  assert.equal(meta.attr_utm_medium, "paid");
  assert.equal(meta.attr_utm_campaign, "aug-milwaukee");
  assert.equal(meta.attr_campaign_id, "120235851321270567");
  assert.equal(meta.attr_adset_id, "2");
  assert.equal(meta.attr_ad_id, "3");
}

// THE GUARD: an over-long value is clipped, never passed through, and never throws.
{
  const long = "x".repeat(900);
  const meta = buildAttributionMetadata({
    utm_source: long,
    utm_medium: long,
    utm_campaign: long,
    utm_content: long,
    utm_term: long,
    campaign_id: long,
    adset_id: long,
    ad_id: long,
  });
  for (const [key, value] of Object.entries(meta)) {
    assert.ok(value.length <= LIMIT, `${key} must be clipped to ${LIMIT} chars, got ${value.length}`);
  }
  // Clipped, not dropped — partial attribution still beats none.
  assert.equal(meta.attr_utm_source.length, LIMIT);
  assert.equal(meta.attr_utm_source, "x".repeat(LIMIT));
}

// Exactly at the limit is untouched (off-by-one guard).
{
  const exact = "y".repeat(LIMIT);
  const meta = buildAttributionMetadata({ utm_source: exact });
  assert.equal(meta.attr_utm_source, exact);
  assert.equal(meta.attr_utm_source.length, LIMIT);
}

// One char over is clipped.
{
  const over = "z".repeat(LIMIT + 1);
  const meta = buildAttributionMetadata({ utm_source: over });
  assert.equal(meta.attr_utm_source.length, LIMIT);
}

// packages_focus is still validated as a literal, not clipped from arbitrary input —
// a tampered cookie must not be able to stamp its own value.
{
  const meta = buildAttributionMetadata({
    packages_focus: "arbitrary-injected" as unknown as "one-time",
  });
  assert.equal(meta.attr_packages_focus, undefined);

  const valid = buildAttributionMetadata({ packages_focus: "one-time" });
  assert.equal(valid.attr_packages_focus, "one-time");
}

// Stripe also caps at 50 keys — this function must never approach that on its own.
{
  const meta = buildAttributionMetadata({
    utm_source: "a", utm_medium: "b", utm_campaign: "c", utm_content: "d", utm_term: "e",
    campaign_id: "f", adset_id: "g", ad_id: "h", packages_focus: "one-time",
  });
  assert.ok(Object.keys(meta).length <= 9, "attribution contributes at most 9 metadata keys");
}

console.log("attribution-metadata tests passed");
