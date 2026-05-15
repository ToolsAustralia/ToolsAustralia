import assert from "node:assert/strict";

function snapshotEnv(): NodeJS.ProcessEnv {
  return { ...process.env };
}

function restoreEnv(saved: NodeJS.ProcessEnv) {
  process.env = saved;
}

// --- Test 1: trackPixelSubscriptionUpgrade emits st/db/ip/ua ---
async function testUpgradeFiresFullUserData() {
  const saved = snapshotEnv();
  process.env.VERCEL_ENV = "production";
  process.env.FACEBOOK_ACCESS_TOKEN = "test-token";
  process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID = "123456789";
  delete process.env.FACEBOOK_USE_TEST_EVENTS;
  delete process.env.FACEBOOK_TEST_EVENT_CODE;

  let captured: { user_data?: Record<string, string | undefined> } | null = null;
  const prevFetch = global.fetch;
  global.fetch = async function _capture(_url, init) {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    captured = body?.data?.[0] ?? null;
    return new Response(JSON.stringify({ events_received: 1 }), { status: 200 });
  } as typeof fetch;

  const { trackPixelSubscriptionUpgrade } = await import("../pixel-purchase-tracking");
  await trackPixelSubscriptionUpgrade({
    oldValue: 10,
    newValue: 20,
    currency: "AUD",
    oldPackageId: "pkg-old",
    newPackageId: "pkg-new",
    oldPackageName: "Old",
    newPackageName: "New",
    subscriptionId: "sub_123",
    userId: "user_abc",
    userEmail: "buyer@example.com",
    userPhone: "+61400000000",
    userFirstName: "Jane",
    userLastName: "Doe",
    userState: "NSW",
    userBirthdate: "1990-06-15",
    paymentIntentId: "pi_x",
    prorationAmount: 5,
    entriesAdded: 1,
    requestContext: {
      client_ip_address: "203.0.113.7",
      client_user_agent: "Mozilla/5.0 (test)",
    },
  });

  assert.ok(captured, "Upgrade must POST to FB CAPI");
  const ud = (captured as unknown as { user_data?: Record<string, string | undefined> }).user_data ?? {};
  assert.ok(ud.em && ud.em.length === 64, "Upgrade must hash email into em");
  assert.ok(ud.st && ud.st.length === 64, "Upgrade must hash state into st");
  assert.ok(ud.db && ud.db.length === 64, "Upgrade must hash birthdate into db");
  assert.equal(ud.client_ip_address, "203.0.113.7", "Upgrade must forward raw IP");
  assert.equal(ud.client_user_agent, "Mozilla/5.0 (test)", "Upgrade must forward raw UA");
  assert.ok(ud.external_id, "Upgrade must include hashed external_id");

  global.fetch = prevFetch;
  restoreEnv(saved);
}

// --- Test 2: trackPixelSubscriptionDowngrade emits st/db/ip/ua ---
async function testDowngradeFiresFullUserData() {
  const saved = snapshotEnv();
  process.env.VERCEL_ENV = "production";
  process.env.FACEBOOK_ACCESS_TOKEN = "test-token";
  process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID = "123456789";
  delete process.env.FACEBOOK_USE_TEST_EVENTS;
  delete process.env.FACEBOOK_TEST_EVENT_CODE;

  let captured: { user_data?: Record<string, string | undefined> } | null = null;
  const prevFetch = global.fetch;
  global.fetch = async function _capture(_url, init) {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    captured = body?.data?.[0] ?? null;
    return new Response(JSON.stringify({ events_received: 1 }), { status: 200 });
  } as typeof fetch;

  const { trackPixelSubscriptionDowngrade } = await import("../pixel-purchase-tracking");
  await trackPixelSubscriptionDowngrade({
    oldValue: 20,
    newValue: 10,
    currency: "AUD",
    oldPackageId: "pkg-old",
    newPackageId: "pkg-new",
    oldPackageName: "Old",
    newPackageName: "New",
    subscriptionId: "sub_123",
    userId: "user_abc",
    userEmail: "buyer@example.com",
    userState: "VIC",
    userBirthdate: new Date("1985-12-31T00:00:00Z"),
    requestContext: {
      client_ip_address: "203.0.113.8",
      client_user_agent: "Mozilla/5.0 (down)",
    },
  });

  assert.ok(captured, "Downgrade must POST to FB CAPI");
  const ud = (captured as unknown as { user_data?: Record<string, string | undefined> }).user_data ?? {};
  assert.ok(ud.st && ud.st.length === 64, "Downgrade must hash state into st");
  assert.ok(ud.db && ud.db.length === 64, "Downgrade must hash birthdate into db");
  assert.equal(ud.client_ip_address, "203.0.113.8", "Downgrade must forward raw IP");
  assert.equal(ud.client_user_agent, "Mozilla/5.0 (down)", "Downgrade must forward raw UA");

  global.fetch = prevFetch;
  restoreEnv(saved);
}

// --- Test 3: trackPixelSubscription forwards state + birthdate ---
async function testSubscribeFiresStateAndBirthdate() {
  const saved = snapshotEnv();
  process.env.VERCEL_ENV = "production";
  process.env.FACEBOOK_ACCESS_TOKEN = "test-token";
  process.env.NEXT_PUBLIC_FACEBOOK_PIXEL_ID = "123456789";
  delete process.env.FACEBOOK_USE_TEST_EVENTS;
  delete process.env.FACEBOOK_TEST_EVENT_CODE;

  let captured: { user_data?: Record<string, string | undefined> } | null = null;
  const prevFetch = global.fetch;
  global.fetch = async function _capture(_url, init) {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    captured = body?.data?.[0] ?? null;
    return new Response(JSON.stringify({ events_received: 1 }), { status: 200 });
  } as typeof fetch;

  const { trackPixelSubscription } = await import("../pixel-purchase-tracking");
  await trackPixelSubscription("Subscribe", {
    value: 19,
    currency: "AUD",
    packageId: "pkg-1",
    packageName: "Starter",
    subscriptionId: "sub_1",
    userId: "u1",
    userEmail: "x@y.com",
    userFirstName: "Alex",
    userLastName: "Smith",
    userState: "QLD",
    userBirthdate: "1992-02-29",
    clientIpAddress: "203.0.113.9",
    clientUserAgent: "Mozilla/5.0 (sub)",
  });

  assert.ok(captured, "Subscribe must POST to FB CAPI");
  const ud = (captured as unknown as { user_data?: Record<string, string | undefined> }).user_data ?? {};
  assert.ok(ud.st && ud.st.length === 64, "Subscribe must hash state into st");
  assert.ok(ud.db && ud.db.length === 64, "Subscribe must hash birthdate into db");

  global.fetch = prevFetch;
  restoreEnv(saved);
}

// --- Test 4: registration-user-data helper includes state + birthdate ---
async function testRegisterHelperIncludesStateAndBirthdate() {
  const { userDataForRegistration } = await import("../registration-user-data");
  const result = userDataForRegistration({
    email: "alice@example.com",
    mobile: "+61400000000",
    firstName: "Alice",
    lastName: "Lee",
    state: "WA",
    birthdate: "1995-03-10",
    _id: { toString: () => "user_id_123" },
  });
  assert.equal(result.state, "WA", "helper must forward state");
  assert.equal(result.birthdate, "1995-03-10", "helper must forward birthdate");
  assert.equal(result.externalId, "user_id_123", "helper must stringify _id");
  assert.equal(result.email, "alice@example.com");
  assert.equal(result.phone, "+61400000000");
}

// --- Test 5: browser getFBCFromURL reads _fbc cookie first ---
async function testBrowserGetFBCReadsFbcCookieFirst() {
  const prevWindow = (globalThis as { window?: unknown }).window;
  const prevDocument = (globalThis as { document?: unknown }).document;

  (globalThis as { window?: unknown }).window = { location: { search: "?fbclid=URLCLICKID" } };
  (globalThis as { document?: unknown }).document = {
    cookie: "_fbp=fb.1.111.aaa; _fbc=fb.1.222.COOKIECLICK",
  };

  // tsx caches imports; bust by appending a query param.
  const { getFBCFromURL } = await import("../facebook-helpers?cb=cookie-set" as string);

  const got = getFBCFromURL();
  assert.equal(got, "fb.1.222.COOKIECLICK", "must return _fbc cookie value verbatim, ignoring URL fbclid");

  // Clear cookie → fall back to URL.
  (globalThis as { document?: unknown }).document = { cookie: "" };
  const { getFBCFromURL: getFBCFromURL2 } = await import("../facebook-helpers?cb=cookie-cleared" as string);
  const fallback = getFBCFromURL2();
  assert.ok(fallback?.startsWith("fb.1.") && fallback.endsWith(".URLCLICKID"), "fallback must build from URL fbclid");

  (globalThis as { window?: unknown }).window = prevWindow;
  (globalThis as { document?: unknown }).document = prevDocument;
}

async function run() {
  await testUpgradeFiresFullUserData();
  await testDowngradeFiresFullUserData();
  await testSubscribeFiresStateAndBirthdate();
  await testRegisterHelperIncludesStateAndBirthdate();
  await testBrowserGetFBCReadsFbcCookieFirst();
  console.log("facebook-emq tests passed");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
