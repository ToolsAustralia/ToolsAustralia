import assert from "node:assert/strict";
import {
  serializeAttributionCookie,
  deserializeAttributionCookie,
  writeAttributionCookie,
  writeLastTouchAttributionCookie,
  readAttributionCookieClient,
  ATTRIBUTION_COOKIE,
  LAST_TOUCH_ATTRIBUTION_COOKIE,
} from "../attribution-cookie";

// Minimal document.cookie mock (single-cookie store) so we can exercise the write semantics.
const store: Record<string, string> = {};
(globalThis as unknown as { document: { cookie: string } }).document = {
  get cookie() {
    return Object.entries(store).map(([k, v]) => `${k}=${v}`).join("; ");
  },
  set cookie(s: string) {
    const pair = s.split(";")[0];
    const eq = pair.indexOf("=");
    store[pair.slice(0, eq).trim()] = pair.slice(eq + 1);
  },
};

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

// FIRST-touch cookie keeps the earliest; LAST-touch cookie overwrites.
{
  writeAttributionCookie({ utm_source: "facebook", utm_medium: "cpc" });
  writeAttributionCookie({ utm_source: "klaviyo", utm_medium: "email" }); // must NOT overwrite
  assert.equal(readAttributionCookieClient()?.utm_source, "facebook", "first-touch keeps earliest");
  assert.ok(store[ATTRIBUTION_COOKIE]);

  writeLastTouchAttributionCookie({ utm_source: "facebook", utm_medium: "cpc" });
  writeLastTouchAttributionCookie({ utm_source: "klaviyo", utm_medium: "email" }); // MUST overwrite
  const last = deserializeAttributionCookie(store[LAST_TOUCH_ATTRIBUTION_COOKIE]);
  assert.equal(last?.utm_source, "klaviyo", "last-touch overwrites to most recent");
  assert.equal(last?.utm_medium, "email");
}

console.log("attribution-cookie: all assertions passed");
