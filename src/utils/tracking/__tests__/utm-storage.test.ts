import assert from "node:assert/strict";
// Static imports, matching attribution-cookie.test.ts. Safe despite the mocks below being
// installed after them: neither module touches window/document/sessionStorage at module
// scope, only inside the functions under test.
import { getStoredUTMParams, getSessionUTMParams, setStoredUTMParams } from "../utm-storage";
import { writeAttributionCookie } from "../attribution-cookie";

/**
 * Pins the split between the two UTM reads, because they answer different questions and
 * mixing them up is silent and expensive.
 *
 *   getStoredUTMParams()  — prefers the 90-day FIRST-touch `_ta_attr` cookie. Feeds purchase
 *                           attribution (MembershipModal), useAttribution, affiliate and
 *                           Klaviyo. Credits the campaign that originally won the customer.
 *   getSessionUTMParams() — sessionStorage ONLY, deliberately ignoring that cookie. Answers
 *                           "what drove THIS visit", and feeds the Contentsquare
 *                           `traffic_source` dynamic variable.
 *
 * `getSessionUTMParams` was extracted out of `getStoredUTMParams` on 2026-08-10. That
 * function is on the revenue path and had no test, so these assertions exist mainly to prove
 * the extraction did not change what the purchase flow sees.
 */

const UTM_STORAGE_KEY = "tools-aus:utm-attribution";
const THIRTY_ONE_MINUTES = 31 * 60 * 1000;

// --- minimal browser mocks, installed before the module under test is imported ---
const sessionStore: Record<string, string> = {};
const cookieStore: Record<string, string> = {};

const g = globalThis as unknown as {
  window: unknown;
  sessionStorage: unknown;
  document: { cookie: string };
};

g.window = {};
g.sessionStorage = {
  getItem: (k: string) => (k in sessionStore ? sessionStore[k] : null),
  setItem: (k: string, v: string) => {
    sessionStore[k] = v;
  },
  removeItem: (k: string) => {
    delete sessionStore[k];
  },
};
g.document = {
  get cookie() {
    return Object.entries(cookieStore)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  },
  set cookie(s: string) {
    const pair = s.split(";")[0];
    const eq = pair.indexOf("=");
    cookieStore[pair.slice(0, eq).trim()] = pair.slice(eq + 1);
  },
};

function reset() {
  for (const k of Object.keys(sessionStore)) delete sessionStore[k];
  for (const k of Object.keys(cookieStore)) delete cookieStore[k];
}

// Both reads return null when nothing has been captured at all.
{
  reset();
  assert.equal(getStoredUTMParams(), null);
  assert.equal(getSessionUTMParams(), null);
}

// sessionStorage round-trips, and BOTH reads see it when there is no cookie.
{
  reset();
  setStoredUTMParams({ utm_source: "tiktok", utm_medium: "paid", utm_campaign: "aug" });
  assert.equal(getSessionUTMParams()?.utm_source, "tiktok");
  assert.equal(getSessionUTMParams()?.utm_medium, "paid");
  assert.equal(getStoredUTMParams()?.utm_source, "tiktok");
}

/**
 * THE LOAD-BEARING ONE. Cookie says facebook (first touch), session says tiktok (this visit).
 * getStoredUTMParams must keep crediting facebook — that is the purchase-attribution
 * behaviour that existed before the extraction. getSessionUTMParams must say tiktok, or the
 * Contentsquare channel comparison silently over-credits whichever campaign ran first.
 */
{
  reset();
  writeAttributionCookie({ utm_source: "facebook.com", utm_medium: "cpc" });
  setStoredUTMParams({ utm_source: "tiktok", utm_medium: "paid" });

  assert.equal(getStoredUTMParams()?.utm_source, "facebook.com", "first-touch cookie must win for attribution");
  assert.equal(getSessionUTMParams()?.utm_source, "tiktok", "session read must ignore the first-touch cookie");
}

// Expired sessionStorage is dropped, not returned stale.
{
  reset();
  sessionStore[UTM_STORAGE_KEY] = JSON.stringify({
    utm_source: "tiktok",
    capturedAt: Date.now() - THIRTY_ONE_MINUTES,
  });
  assert.equal(getSessionUTMParams(), null, "31-minute-old entry is past the 30-minute expiry");
  assert.equal(UTM_STORAGE_KEY in sessionStore, false, "expired entry is removed, not left to rot");
}

// Garbage in storage never throws — attribution must not take the purchase flow down.
{
  reset();
  sessionStore[UTM_STORAGE_KEY] = "not-json";
  assert.equal(getSessionUTMParams(), null);
  assert.equal(getStoredUTMParams(), null);
}

// An entry with no capturedAt is treated as unusable rather than trusted.
{
  reset();
  sessionStore[UTM_STORAGE_KEY] = JSON.stringify({ utm_source: "tiktok" });
  assert.equal(getSessionUTMParams(), null);
}

// setStoredUTMParams ignores empty input rather than writing a capturedAt-only record.
{
  reset();
  setStoredUTMParams({});
  assert.equal(UTM_STORAGE_KEY in sessionStore, false);
}

// packages_focus is validated, not passed through — a tampered value must not survive.
{
  reset();
  sessionStore[UTM_STORAGE_KEY] = JSON.stringify({
    utm_source: "tiktok",
    packages_focus: "arbitrary-injected-value",
    capturedAt: Date.now(),
  });
  assert.equal(getSessionUTMParams()?.packages_focus, undefined);
}

console.log("utm-storage tests passed");
