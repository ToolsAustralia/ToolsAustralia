import assert from "node:assert/strict";
import { stripEmpty } from "../../../utils/tracking/meta-capi-mirror";
import { sendConversionWithProviders } from "../dispatch";
import { facebookProvider } from "../providers/facebook";
import type { CanonicalEvent, RequestContext } from "../types";

function snapshotEnv(): NodeJS.ProcessEnv {
  return { ...process.env };
}
function restoreEnv(saved: NodeJS.ProcessEnv) {
  process.env = saved;
}

// --- Test 1: stripEmpty drops undefined/null/"" and keeps real values ---
function testStripEmpty() {
  const out = stripEmpty({ a: "x", b: "", c: undefined, d: null as unknown as string, e: "y" });
  assert.deepEqual(out, { a: "x", e: "y" }, "stripEmpty must keep only non-empty values");
}

// --- Test 2: client userData reaching CAPI is SHA-256 hashed into em/ph/fn/ln ---
async function testGuestUserDataIsHashed() {
  const saved = snapshotEnv();
  process.env.VERCEL_ENV = "production";
  process.env.FACEBOOK_ACCESS_TOKEN = "test-token";
  process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID = "123456789";
  delete process.env.FACEBOOK_USE_TEST_EVENTS;
  delete process.env.FACEBOOK_TEST_EVENT_CODE;

  let captured: { user_data?: Record<string, string | undefined> } | null = null;
  const prevFetch = global.fetch;
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes("facebook.com")) {
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      captured = body?.data?.[0] ?? null;
    }
    return new Response(JSON.stringify({ events_received: 1 }), { status: 200 });
  }) as typeof fetch;

  const event: CanonicalEvent = {
    eventName: "InitiateCheckout",
    eventId: "ic_test_1",
    eventTime: Math.floor(Date.now() / 1000),
    value: 19,
    currency: "AUD",
    userData: {
      email: "Guest@Example.com",
      phone: "+61 400 000 000",
      firstName: "Guest",
      lastName: "Buyer",
    },
    customData: { contentType: "product", numItems: 1 },
    eventSourceUrl: "https://toolsaustralia.com.au/",
  };
  const ctx: RequestContext = {
    clientIpAddress: "203.0.113.10",
    clientUserAgent: "Mozilla/5.0 (test)",
  };

  await sendConversionWithProviders(event, ctx, [facebookProvider]);

  assert.ok(captured, "InitiateCheckout with guest userData must POST to FB CAPI");
  const ud = (captured as { user_data?: Record<string, string | undefined> }).user_data ?? {};
  assert.ok(ud.em && ud.em.length === 64, "email must be hashed into em");
  assert.ok(ud.ph && ud.ph.length === 64, "phone must be hashed into ph");
  assert.ok(ud.fn && ud.fn.length === 64, "firstName must be hashed into fn");
  assert.ok(ud.ln && ud.ln.length === 64, "lastName must be hashed into ln");

  global.fetch = prevFetch;
  restoreEnv(saved);
}

async function run() {
  testStripEmpty();
  await testGuestUserDataIsHashed();
  console.log("capi-userdata-enrichment tests passed");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
