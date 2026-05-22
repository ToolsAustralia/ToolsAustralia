// Run: npx tsx src/lib/tracking/__tests__/tiktok-capi.test.ts
import assert from "node:assert";
import crypto from "node:crypto";
import {
  normalizePhoneE164,
  mapCanonicalToTikTokEvent,
  buildTikTokRequestBody,
} from "../../tiktok";
import type { CanonicalEvent } from "../types";

const sha256 = (s: string) => crypto.createHash("sha256").update(s.toLowerCase().trim()).digest("hex");

function test(name: string, fn: () => void) {
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}`); throw e; }
}

console.log("tiktok-capi");

test("normalizePhoneE164 handles AU formats", () => {
  assert.equal(normalizePhoneE164("0412 345 678"), "+61412345678");
  assert.equal(normalizePhoneE164("+61412345678"), "+61412345678");
  assert.equal(normalizePhoneE164("61412345678"), "+61412345678");
});

test("mapCanonicalToTikTokEvent hashes PII, leaves ids/ip/ua raw", () => {
  const ev: CanonicalEvent = {
    eventName: "Purchase",
    eventId: "pi_123",
    eventTime: 1747872000,
    value: 49.99,
    currency: "AUD",
    userData: {
      email: "Test@Example.com ",
      phone: "0412 345 678",
      externalId: "abc123",
      ttclid: "ttclid-raw",
      ttp: "ttp-raw",
      clientIpAddress: "1.2.3.4",
      clientUserAgent: "UA/1.0",
    },
    customData: { orderId: "pi_123", contentType: "product", contentIds: ["pkg_x"], numItems: 1 },
    eventSourceUrl: "https://toolsaustralia.com.au/success",
  };
  const tt = mapCanonicalToTikTokEvent(ev, {});
  assert.equal(tt.event, "Purchase");
  assert.equal(tt.event_time, 1747872000);
  assert.equal(tt.event_id, "pi_123");
  assert.equal(tt.user.email, sha256("test@example.com"));
  assert.equal(tt.user.phone_number, sha256("+61412345678"));
  assert.equal(tt.user.external_id, sha256("abc123"));
  assert.equal(tt.user.ttclid, "ttclid-raw");       // raw
  assert.equal(tt.user.ttp, "ttp-raw");             // raw
  assert.equal(tt.user.ip, "1.2.3.4");              // raw
  assert.equal(tt.user.user_agent, "UA/1.0");       // raw
  assert.equal(tt.properties.value, 49.99);
  assert.equal(tt.properties.currency, "AUD");
  assert.deepEqual(tt.properties.contents, [{ content_id: "pkg_x", content_type: "product", quantity: 1 }]);
  assert.equal(tt.page?.url, "https://toolsaustralia.com.au/success");
});

test("mapCanonicalToTikTokEvent omits empty user fields", () => {
  const tt = mapCanonicalToTikTokEvent(
    { eventName: "ViewContent", eventId: "v1", eventTime: 1, userData: {} },
    {},
  );
  assert.equal("email" in tt.user, false);
  assert.equal("ttclid" in tt.user, false);
});

test("mapCanonicalToTikTokEvent keeps quantity for a single content row", () => {
  const tt = mapCanonicalToTikTokEvent(
    {
      eventName: "Purchase",
      eventId: "p-single",
      eventTime: 1,
      userData: {},
      customData: { contentType: "product", contentIds: ["only"], numItems: 1 },
    },
    {},
  );
  assert.equal(tt.properties.contents?.[0]?.quantity, 1);
});

test("mapCanonicalToTikTokEvent does NOT duplicate numItems across multiple content rows", () => {
  const tt = mapCanonicalToTikTokEvent(
    {
      eventName: "Purchase",
      eventId: "p-multi",
      eventTime: 1,
      userData: {},
      customData: { contentType: "product", contentIds: ["a", "b"], numItems: 2 },
    },
    {},
  );
  assert.equal(tt.properties.contents?.length, 2);
  // numItems is order-wide; it must NOT be stamped as per-row quantity on multi-line carts.
  assert.equal("quantity" in tt.properties.contents![0], false);
  assert.equal("quantity" in tt.properties.contents![1], false);
});

test("buildTikTokRequestBody wraps events with source + pixel id, top-level test code", () => {
  const body = buildTikTokRequestBody(
    [mapCanonicalToTikTokEvent({ eventName: "Purchase", eventId: "x", eventTime: 1, userData: {} }, {})],
    { pixelId: "PIX1", testEventCode: "TEST42" },
  );
  assert.equal(body.event_source, "web");
  assert.equal(body.event_source_id, "PIX1");
  assert.equal(body.test_event_code, "TEST42");
  assert.equal(body.data.length, 1);
});

test("buildTikTokRequestBody omits test_event_code when absent", () => {
  const body = buildTikTokRequestBody([], { pixelId: "PIX1" });
  assert.equal("test_event_code" in body, false);
});

console.log("✓ all tiktok-capi tests passed");
