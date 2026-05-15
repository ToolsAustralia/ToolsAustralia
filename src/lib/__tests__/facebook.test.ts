import assert from "node:assert/strict";
import type { FacebookEvent } from "../facebook";

function snapshotEnv(): NodeJS.ProcessEnv {
  return { ...process.env };
}

function restoreEnv(saved: NodeJS.ProcessEnv) {
  process.env = saved;
}

async function testRefusesPurchaseWithoutEventId() {
  const saved = snapshotEnv();
  process.env.VERCEL_ENV = "production";
  process.env.FACEBOOK_ACCESS_TOKEN = "test-token";
  process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID = "123456789";
  delete process.env.FACEBOOK_USE_TEST_EVENTS;

  let fetchCalls = 0;
  const prevFetch = global.fetch;
  global.fetch = async function _mockFetch() {
    fetchCalls++;
    return new Response(JSON.stringify({ events_received: 1 }), { status: 200 });
  };

  const { sendFacebookEvent } = await import("../facebook");
  const purchaseNoId: FacebookEvent = {
    event_name: "Purchase",
    event_time: Math.floor(Date.now() / 1000),
    action_source: "website",
    user_data: { client_user_agent: "Mozilla/5.0 (test)" },
    custom_data: { value: 10, currency: "AUD" },
  };

  const ok = await sendFacebookEvent(purchaseNoId);
  assert.equal(ok, false, "Purchase without event_id must be refused");
  assert.equal(fetchCalls, 0, "fetch must not run when Purchase is refused");

  global.fetch = prevFetch;
  restoreEnv(saved);
}

async function testRefusesNonProdWithoutTestEventCode() {
  const saved = snapshotEnv();
  process.env.VERCEL_ENV = "preview";
  process.env.FACEBOOK_ACCESS_TOKEN = "test-token";
  process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID = "123456789";
  delete process.env.FACEBOOK_TEST_EVENT_CODE;
  delete process.env.FACEBOOK_USE_TEST_EVENTS;

  let fetchCalls = 0;
  const prevFetch = global.fetch;
  global.fetch = async function _mockFetch() {
    fetchCalls++;
    return new Response(JSON.stringify({ events_received: 1 }), { status: 200 });
  };

  const { sendFacebookEvent } = await import("../facebook");
  const pageView: FacebookEvent = {
    event_name: "PageView",
    event_time: Math.floor(Date.now() / 1000),
    action_source: "website",
    user_data: { client_user_agent: "Mozilla/5.0 (test)" },
  };

  const ok = await sendFacebookEvent(pageView);
  assert.equal(ok, false, "Non-prod must refuse when FACEBOOK_TEST_EVENT_CODE is missing");
  assert.equal(fetchCalls, 0);

  global.fetch = prevFetch;
  restoreEnv(saved);
}

async function testFacebookProviderCanonicalTranslation() {
  const saved = snapshotEnv();
  process.env.VERCEL_ENV = "production";
  process.env.FACEBOOK_ACCESS_TOKEN = "test-token";
  process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID = "123456789";
  delete process.env.FACEBOOK_USE_TEST_EVENTS;
  delete process.env.FACEBOOK_TEST_EVENT_CODE;

  let capturedBody: { data: unknown[]; access_token: string } | null = null;
  const prevFetch = global.fetch;
  global.fetch = async function _captureFetch(_url, init) {
    capturedBody = init?.body ? JSON.parse(String(init.body)) : null;
    return new Response(JSON.stringify({ events_received: 1 }), { status: 200 });
  } as typeof fetch;

  const { facebookProvider } = await import("../tracking/providers/facebook");
  const ok = await facebookProvider.capiSend(
    {
      eventName: "Purchase",
      eventId: "evt-translate-1",
      eventTime: 1700000000,
      value: 49.99,
      currency: "AUD",
      userData: { email: "buyer@example.com", country: "AU" },
      customData: { orderId: "order-123", contentType: "product", packageType: "membership" },
      eventSourceUrl: "https://toolsaustralia.com.au/purchase-success",
    },
    {},
  );

  assert.equal(ok, true, "capiSend should succeed when env is production-configured");
  assert.ok(capturedBody, "fetch must have been called once with a JSON body");
  const body = capturedBody as { data: unknown[]; access_token: string };
  const event = (body.data[0] ?? {}) as {
    event_name?: string;
    event_id?: string;
    custom_data?: { value?: number; currency?: string; order_id?: string };
    user_data?: { em?: string; country?: string };
  };
  assert.equal(event.event_name, "Purchase");
  assert.equal(event.event_id, "evt-translate-1");
  assert.equal(event.custom_data?.value, 49.99);
  assert.equal(event.custom_data?.currency, "AUD");
  assert.equal(event.custom_data?.order_id, "order-123");
  assert.equal(
    (event.custom_data as { package_type?: string })?.package_type,
    "membership",
    "package_type must round-trip through capiSend custom_data",
  );
  assert.ok(event.user_data?.em && event.user_data.em.length === 64, "email should be sha256-hashed (64 hex chars)");
  assert.ok(event.user_data?.country && event.user_data.country.length === 64, "country should be sha256-hashed");

  global.fetch = prevFetch;
  restoreEnv(saved);
}

async function testFacebookProviderHashesBirthdateAsDb() {
  const saved = snapshotEnv();
  process.env.VERCEL_ENV = "production";
  process.env.FACEBOOK_ACCESS_TOKEN = "test-token";
  process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID = "123456789";
  delete process.env.FACEBOOK_USE_TEST_EVENTS;
  delete process.env.FACEBOOK_TEST_EVENT_CODE;

  let capturedBody: { data: unknown[]; access_token: string } | null = null;
  const prevFetch = global.fetch;
  global.fetch = async function _captureFetch(_url, init) {
    capturedBody = init?.body ? JSON.parse(String(init.body)) : null;
    return new Response(JSON.stringify({ events_received: 1 }), { status: 200 });
  } as typeof fetch;

  const { facebookProvider } = await import("../tracking/providers/facebook");
  const { hashData } = await import("../facebook");

  // Case 1: birthdate as ISO string is normalized to YYYYMMDD then SHA-256 lowercased.
  await facebookProvider.capiSend(
    {
      eventName: "Purchase",
      eventId: "evt-db-1",
      eventTime: 1700000000,
      value: 10,
      currency: "AUD",
      userData: { email: "x@y.com", birthdate: "1990-06-15" },
      customData: { orderId: "o-1" },
    },
    {},
  );
  const body1 = capturedBody as unknown as { data: unknown[] };
  const event1 = body1.data[0] as { user_data?: { db?: string } };
  assert.equal(event1.user_data?.db, hashData("19900615"), "db must be SHA-256 of YYYYMMDD");

  // Case 2: unparseable birthdate is skipped (no db key).
  capturedBody = null;
  await facebookProvider.capiSend(
    {
      eventName: "Purchase",
      eventId: "evt-db-2",
      eventTime: 1700000000,
      value: 10,
      currency: "AUD",
      userData: { email: "x@y.com", birthdate: "not-a-date" },
      customData: { orderId: "o-2" },
    },
    {},
  );
  const body2 = capturedBody as unknown as { data: unknown[] };
  const event2 = body2.data[0] as { user_data?: { db?: string } };
  assert.equal(event2.user_data?.db, undefined, "db must be absent when birthdate is unparseable");

  // Case 3: missing birthdate is skipped.
  capturedBody = null;
  await facebookProvider.capiSend(
    {
      eventName: "Purchase",
      eventId: "evt-db-3",
      eventTime: 1700000000,
      value: 10,
      currency: "AUD",
      userData: { email: "x@y.com" },
      customData: { orderId: "o-3" },
    },
    {},
  );
  const body3 = capturedBody as unknown as { data: unknown[] };
  const event3 = body3.data[0] as { user_data?: { db?: string } };
  assert.equal(event3.user_data?.db, undefined, "db must be absent when birthdate is missing");

  global.fetch = prevFetch;
  restoreEnv(saved);
}

async function run() {
  await testRefusesPurchaseWithoutEventId();
  await testRefusesNonProdWithoutTestEventCode();
  await testFacebookProviderCanonicalTranslation();
  await testFacebookProviderHashesBirthdateAsDb();
  console.log("facebook CAPI guard tests passed");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
