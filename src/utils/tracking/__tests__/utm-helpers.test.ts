import assert from "node:assert/strict";
import { extractAttributionParams } from "../utm-helpers";

/**
 * Regression guard for a bug that silently disabled ALL client-side UTM capture.
 *
 * `extractAttributionParams` accepted a full URL, a bare `key=value` string, or a
 * URLSearchParams — but the one shape it is most often handed in practice,
 * `window.location.search` ("?utm_source=…"), fell through to the full-URL branch because it
 * contains a "?". `new URL("?utm_source=…")` throws on a relative string, the function's outer
 * try swallowed it, and it returned {}.
 *
 * `useUTMPersistence` passes `window.location.search` verbatim, so the consequence was that
 * `_ta_attr` (first-touch, feeds purchase attribution), `_ta_attr_last` and the sessionStorage
 * UTM copy were NEVER written client-side. Confirmed on production 2026-08-10: all three
 * absent after landing on a URL carrying utm_source. It failed closed and threw nothing, so
 * no error surfaced anywhere.
 *
 * The first assertion below is the one that matters — it is the exact call the hook makes.
 */

const QUERY = "?utm_source=TIKTOK&utm_medium=paid&utm_campaign=aug&campaign_id=1&adset_id=2&ad_id=3";

// THE REGRESSION: window.location.search, exactly as useUTMPersistence passes it.
{
  const p = extractAttributionParams(QUERY);
  assert.equal(p.utm_source, "TIKTOK", "a leading '?' must not defeat extraction");
  assert.equal(p.utm_medium, "paid");
  assert.equal(p.utm_campaign, "aug");
  assert.equal(p.campaign_id, "1");
  assert.equal(p.adset_id, "2");
  assert.equal(p.ad_id, "3");
}

// All four accepted input shapes must agree — the bug was that only one of them disagreed.
{
  const fromSearch = extractAttributionParams(QUERY);
  const fromBare = extractAttributionParams(QUERY.slice(1));
  const fromUrl = extractAttributionParams(`https://toolsaustralia.com.au/promotions/x${QUERY}`);
  const fromUsp = extractAttributionParams(new URLSearchParams(QUERY));

  for (const [label, got] of [
    ["bare key=value", fromBare],
    ["full URL", fromUrl],
    ["URLSearchParams", fromUsp],
  ] as const) {
    assert.deepEqual(got, fromSearch, `${label} must match window.location.search parsing`);
  }
}

// Degenerate inputs stay empty rather than throwing — attribution must never break a render.
{
  assert.deepEqual(extractAttributionParams("?"), {});
  assert.deepEqual(extractAttributionParams(""), {});
  assert.deepEqual(extractAttributionParams("nonsense"), {});
  assert.deepEqual(extractAttributionParams(new URLSearchParams()), {});
}

// A query string with unrelated params only yields nothing, not a partial object.
{
  assert.deepEqual(extractAttributionParams("?fbclid=abc&gclid=def"), {});
}

// Values are passed through verbatim — casing is normalised downstream (Contentsquare), not here,
// because purchase attribution wants the raw value the campaign actually sent.
{
  assert.equal(extractAttributionParams("?utm_source=TIKTOK").utm_source, "TIKTOK");
  assert.equal(extractAttributionParams("?utm_source=tiktok").utm_source, "tiktok");
}

console.log("utm-helpers tests passed");
