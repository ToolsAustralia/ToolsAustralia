import assert from "node:assert/strict";
import { resolveConvertingPlatform } from "../resolveConvertingPlatform";

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

// 1. Paid beats owned
{
  const r = resolveConvertingPlatform({
    clicks: [{ platform: "meta", clickId: "fb.1.x", capturedAt: NOW - DAY }],
    utm: { utm_source: "klaviyo", utm_medium: "email" },
    utmCapturedAt: NOW - 2 * DAY,
    now: NOW,
  });
  assert.equal(r.platform, "meta");
  assert.equal(r.confidence, "click");
}
// 2. Recency tiebreak within paid tier
{
  const r = resolveConvertingPlatform({
    clicks: [
      { platform: "meta", clickId: "m", capturedAt: NOW - 3 * DAY },
      { platform: "tiktok", clickId: "t", capturedAt: NOW - 1 * DAY },
    ],
    now: NOW,
  });
  assert.equal(r.platform, "tiktok");
  assert.equal(r.attributedClickId, "t");
}
// 3. Window expiry → direct
{
  const r = resolveConvertingPlatform({
    clicks: [{ platform: "meta", clickId: "m", capturedAt: NOW - 8 * DAY }],
    now: NOW,
  });
  assert.equal(r.platform, "direct");
}
// 4. Exactly 7d still in-window
{
  const r = resolveConvertingPlatform({
    clicks: [{ platform: "meta", clickId: "m", capturedAt: NOW - 7 * DAY }],
    now: NOW,
  });
  assert.equal(r.platform, "meta");
}
// 5. null capturedAt cannot win → utm fallback
{
  const r = resolveConvertingPlatform({
    clicks: [{ platform: "meta", clickId: "m", capturedAt: null }],
    utm: { utm_source: "tiktok" },
    utmCapturedAt: NOW - DAY,
    now: NOW,
  });
  assert.equal(r.platform, "tiktok");
  assert.equal(r.confidence, "utm_only");
}
// 6. Klaviyo SMS via UTM
{
  const r = resolveConvertingPlatform({
    clicks: [],
    utm: { utm_source: "Klaviyo", utm_medium: "sms" },
    utmCapturedAt: NOW - 2 * DAY,
    now: NOW,
  });
  assert.equal(r.platform, "klaviyo_sms");
  assert.equal(r.confidence, "utm_only");
}
// 7. Klaviyo UTM beyond 5d window → direct
{
  const r = resolveConvertingPlatform({
    clicks: [],
    utm: { utm_source: "klaviyo", utm_medium: "email" },
    utmCapturedAt: NOW - 6 * DAY,
    now: NOW,
  });
  assert.equal(r.platform, "direct");
}
// 8. Nothing → direct
{
  const r = resolveConvertingPlatform({ clicks: [], now: NOW });
  assert.equal(r.platform, "direct");
}
// 10. Owned LAST-touch beats a non-Klaviyo FIRST-touch cookie (THE FIX: returning user whose
//     first touch was Meta, last touch was a Klaviyo email → credit Klaviyo, not Meta/direct).
{
  const r = resolveConvertingPlatform({
    clicks: [],
    utm: { utm_source: "facebook", utm_medium: "cpc" }, // first-touch
    utmCapturedAt: NOW - 30 * DAY,
    lastTouchUtm: { utm_source: "klaviyo", utm_medium: "email" }, // last-touch
    lastTouchUtmCapturedAt: NOW - 1 * DAY,
    now: NOW,
  });
  assert.equal(r.platform, "klaviyo_email");
  assert.equal(r.confidence, "utm_only");
}
// 11. Owned last-touch beats direct (no first-touch at all).
{
  const r = resolveConvertingPlatform({
    clicks: [],
    lastTouchUtm: { utm_source: "Klaviyo", utm_medium: "sms" },
    lastTouchUtmCapturedAt: NOW - 2 * DAY,
    now: NOW,
  });
  assert.equal(r.platform, "klaviyo_sms");
}
// 12. Paid click STILL beats owned last-touch (paid stays top priority).
{
  const r = resolveConvertingPlatform({
    clicks: [{ platform: "meta", clickId: "fb.1.x", capturedAt: NOW - 1 * DAY }],
    lastTouchUtm: { utm_source: "klaviyo", utm_medium: "email" },
    lastTouchUtmCapturedAt: NOW - 1 * DAY,
    now: NOW,
  });
  assert.equal(r.platform, "meta");
  assert.equal(r.confidence, "click");
}
// 13. Owned last-touch beyond its 5d window → falls through to the first-touch fallback.
{
  const r = resolveConvertingPlatform({
    clicks: [],
    utm: { utm_source: "facebook" }, // first-touch meta still in 7d
    utmCapturedAt: NOW - 2 * DAY,
    lastTouchUtm: { utm_source: "klaviyo", utm_medium: "email" },
    lastTouchUtmCapturedAt: NOW - 6 * DAY,
    now: NOW,
  });
  assert.equal(r.platform, "meta");
}
// 14. A tier-1 (paid) last-touch UTM is NOT credited by the owned step — paid resolves via
//     clicks / first-touch only, so a last-touch=facebook with nothing else → direct.
{
  const r = resolveConvertingPlatform({
    clicks: [],
    lastTouchUtm: { utm_source: "facebook", utm_medium: "cpc" },
    lastTouchUtmCapturedAt: NOW - 1 * DAY,
    now: NOW,
  });
  assert.equal(r.platform, "direct");
}
// 9. observedTouches records everything
{
  const r = resolveConvertingPlatform({
    clicks: [{ platform: "meta", clickId: "m", capturedAt: NOW - 1 * DAY }],
    now: NOW,
  });
  assert.equal(r.observedTouches.length, 1);
  assert.equal(r.observedTouches[0].inWindow, true);
}

console.log("resolveConvertingPlatform: all assertions passed");
