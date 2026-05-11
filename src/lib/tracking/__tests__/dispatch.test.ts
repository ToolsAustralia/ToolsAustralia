import assert from "node:assert/strict";
import type { CanonicalEvent, ConversionProvider, RequestContext } from "../types";

/** Build a controllable fake provider for testing dispatch behavior. */
function makeFakeProvider(
  id: ConversionProvider["id"],
  opts: {
    pixelEnabled?: boolean;
    capiEnabled?: boolean;
    capiResult?: boolean;
  } = {}
) {
  const calls = {
    pixelTrack: 0 as number,
    capiSend: 0 as number,
    lastEvent: null as CanonicalEvent | null,
  };
  const provider: ConversionProvider = {
    id,
    enabled: () => ({
      pixel: opts.pixelEnabled ?? true,
      capi: opts.capiEnabled ?? true,
    }),
    productionHostnames: () => ["example.test"],
    loadPixel: () => {},
    pixelTrack: (event) => {
      calls.pixelTrack++;
      calls.lastEvent = event;
    },
    capiSend: async (event) => {
      calls.capiSend++;
      calls.lastEvent = event;
      return opts.capiResult ?? true;
    },
  };
  return { provider, calls };
}

function purchase(eventId = "evt_123"): CanonicalEvent {
  return {
    eventName: "Purchase",
    eventId,
    eventTime: Math.floor(Date.now() / 1000),
    value: 29.99,
    currency: "AUD",
  };
}

async function testFanOutCallsEveryCapiEnabledProvider() {
  const fb = makeFakeProvider("facebook", { capiEnabled: true });
  const tt = makeFakeProvider("tiktok", { capiEnabled: false });
  const sc = makeFakeProvider("snapchat", { capiEnabled: true, capiResult: false });

  const { sendConversionWithProviders } = await import("../dispatch");
  const ctx: RequestContext = { clientIpAddress: "1.1.1.1" };
  const results = await sendConversionWithProviders(purchase(), ctx, [fb.provider, tt.provider, sc.provider]);

  assert.equal(fb.calls.capiSend, 1, "facebook capiSend should run once");
  assert.equal(tt.calls.capiSend, 0, "tiktok capiSend should be skipped (capi disabled)");
  assert.equal(sc.calls.capiSend, 1, "snapchat capiSend should run once even though it returns false");
  assert.deepEqual(results, { facebook: true, tiktok: false, snapchat: false });
}

async function testMissingEventIdRefusesAllProviders() {
  const fb = makeFakeProvider("facebook");
  const { sendConversionWithProviders } = await import("../dispatch");
  const bad: CanonicalEvent = { ...purchase(), eventId: "" };

  // assertValidEvent throws in dev; this test asserts the dispatcher catches that path.
  // Force prod NODE_ENV for this test so we observe the "skip + log" branch.
  // Note: process.env.NODE_ENV is typed readonly, so we mutate via index access.
  const env = process.env as Record<string, string | undefined>;
  const savedNodeEnv = env.NODE_ENV;
  env.NODE_ENV = "production";

  const results = await sendConversionWithProviders(bad, {}, [fb.provider]);

  env.NODE_ENV = savedNodeEnv;
  assert.equal(fb.calls.capiSend, 0, "no provider should be invoked when eventId is missing");
  assert.equal(results.facebook, false);
}

async function testDisabledProviderSkipsNetworkCall() {
  /** Critical: this is the missing-credentials contract from spec §3 invariant #4. */
  const tt = makeFakeProvider("tiktok", { capiEnabled: false });
  const { sendConversionWithProviders } = await import("../dispatch");
  const results = await sendConversionWithProviders(purchase(), {}, [tt.provider]);
  assert.equal(tt.calls.capiSend, 0, "disabled CAPI provider MUST not run");
  assert.equal(results.tiktok, false);
}

function withFakeWindow(hostname: string, fn: () => void) {
  const prevWindow = (globalThis as { window?: unknown }).window;
  (globalThis as { window?: unknown }).window = { location: { hostname } };
  try {
    fn();
  } finally {
    if (prevWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = prevWindow;
    }
  }
}

async function testClientDispatchHostnameGate() {
  const fb = makeFakeProvider("facebook");
  const { trackConversionWithProviders } = await import("../dispatch-client");

  withFakeWindow("staging.example.com", () => {
    trackConversionWithProviders(purchase(), [fb.provider]);
  });
  assert.equal(fb.calls.pixelTrack, 0, "non-prod hostname must skip pixel");

  withFakeWindow("example.test", () => {
    trackConversionWithProviders(purchase(), [fb.provider]);
  });
  assert.equal(fb.calls.pixelTrack, 1, "prod hostname must fire pixel");
}

async function testClientDispatchSkipsDisabledPixel() {
  const tt = makeFakeProvider("tiktok", { pixelEnabled: false });
  const { trackConversionWithProviders } = await import("../dispatch-client");
  withFakeWindow("example.test", () => {
    trackConversionWithProviders(purchase(), [tt.provider]);
  });
  assert.equal(tt.calls.pixelTrack, 0, "pixel-disabled provider MUST not fire");
}

async function run() {
  await testFanOutCallsEveryCapiEnabledProvider();
  await testMissingEventIdRefusesAllProviders();
  await testDisabledProviderSkipsNetworkCall();
  await testClientDispatchHostnameGate();
  await testClientDispatchSkipsDisabledPixel();
  console.log("tracking dispatch tests passed");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
