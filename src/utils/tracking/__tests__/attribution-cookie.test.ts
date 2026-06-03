import assert from "node:assert/strict";
import {
  serializeAttributionCookie,
  deserializeAttributionCookie,
} from "../attribution-cookie";

// round-trips utm fields + capturedAt
{
  const value = serializeAttributionCookie(
    { utm_source: "Klaviyo", utm_medium: "email", campaign_id: "123" },
    1_700_000_000_000
  );
  const back = deserializeAttributionCookie(value);
  assert.equal(back?.utm_source, "Klaviyo");
  assert.equal(back?.utm_medium, "email");
  assert.equal(back?.campaign_id, "123");
  assert.equal(back?.capturedAt, 1_700_000_000_000);
}

// tolerates garbage
{
  assert.equal(deserializeAttributionCookie("not-json"), null);
  assert.equal(deserializeAttributionCookie(""), null);
}

// drops empty params
{
  assert.equal(serializeAttributionCookie({}, 1), "");
}

console.log("attribution-cookie: all assertions passed");
