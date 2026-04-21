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

async function run() {
  await testRefusesPurchaseWithoutEventId();
  await testRefusesNonProdWithoutTestEventCode();
  console.log("facebook CAPI guard tests passed");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
