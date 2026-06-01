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
