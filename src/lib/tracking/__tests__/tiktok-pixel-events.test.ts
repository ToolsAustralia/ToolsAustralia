/**
 * TikTok BROWSER pixel regressions (2026-07-31).
 *
 * The headline case is the one that actually shipped: `ConversionPixels` dispatches a
 * canonical event literally named "PageView" on SPA route changes, and before the provider
 * learned to translate it, it fell through to the generic `ttq.track(event.eventName, …)`
 * tail. TikTok passes unknown names through verbatim, so that registered a CUSTOM event
 * named `PageView` alongside the standard `Pageview` — 3,748 events on their own Events
 * Manager row, which TikTok provides no way to delete. `pixelTrack` had no test at all.
 *
 * Zero network: `window.ttq` is a spy object; nothing is sent.
 */
import assert from "node:assert/strict";

const realEnv = process.env;
const PIXEL_ID = "TESTPIXEL123";
// Must be one of BASE_PRODUCTION_HOSTNAMES in src/lib/tracking/hostname-gate.ts, or the
// provider's hostname gate correctly refuses to fire anything.
const ALLOWED_HOST = "toolsaustralia.com.au";

interface TrackCall {
  name: string;
  params: Record<string, unknown>;
  options?: { event_id?: string };
}

interface Spy {
  pageCalls: number;
  trackCalls: TrackCall[];
  identifyCalls: Record<string, unknown>[];
}

/** Install a fake browser environment with a spying `ttq`, and return the spy. */
function installBrowser(cookie = ""): Spy {
  const spy: Spy = { pageCalls: 0, trackCalls: [], identifyCalls: [] };
  const g = globalThis as unknown as Record<string, unknown>;
  g.window = {
    ttq: {
      page: () => {
        spy.pageCalls += 1;
      },
      track: (name: string, params: Record<string, unknown>, options?: { event_id?: string }) => {
        spy.trackCalls.push({ name, params, options });
      },
      identify: (user: Record<string, unknown>) => {
        spy.identifyCalls.push(user);
      },
    },
    location: { hostname: ALLOWED_HOST, pathname: "/", search: "", href: `https://${ALLOWED_HOST}/` },
  };
  g.document = { cookie };
  return spy;
}

function teardownBrowser() {
  const g = globalThis as unknown as Record<string, unknown>;
  delete g.window;
  delete g.document;
}

const tests: [string, () => Promise<void>][] = [
  [
    'PageView routes to ttq.page() and NEVER ttq.track — the stray custom-event regression',
    async () => {
      process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID = PIXEL_ID;
      const spy = installBrowser();
      const { tiktokProvider } = await import("../providers/tiktok");

      tiktokProvider.pixelTrack({
        eventName: "PageView",
        eventId: "pageview-/x-123",
        eventTime: 1_750_000_000,
      });

      assert.equal(spy.pageCalls, 1, "PageView must call ttq.page()");
      assert.equal(
        spy.trackCalls.length,
        0,
        'PageView must NEVER reach ttq.track — that creates a CUSTOM "PageView" event beside the standard "Pageview"',
      );
      teardownBrowser();
    },
  ],
  [
    "a non-PageView event still goes through ttq.track with the event_id dedup key",
    async () => {
      process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID = PIXEL_ID;
      const spy = installBrowser();
      const { tiktokProvider } = await import("../providers/tiktok");

      tiktokProvider.pixelTrack({
        eventName: "AddToCart",
        eventId: "atc_42",
        eventTime: 1_750_000_000,
        value: 25,
        currency: "AUD",
      });

      assert.equal(spy.pageCalls, 0, "AddToCart must not fire a page view");
      assert.equal(spy.trackCalls.length, 1);
      assert.equal(spy.trackCalls[0].name, "AddToCart");
      assert.equal(
        spy.trackCalls[0].options?.event_id,
        "atc_42",
        "the 3rd arg { event_id } is TikTok's browser<->Events-API dedup key",
      );
      assert.equal(spy.trackCalls[0].params.value, 25);
      assert.equal(spy.trackCalls[0].params.currency, "AUD");
      teardownBrowser();
    },
  ],
  [
    "the hostname gate refuses to fire anything off a production host",
    async () => {
      process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID = PIXEL_ID;
      const spy = installBrowser();
      const g = globalThis as unknown as { window: { location: { hostname: string } } };
      g.window.location.hostname = "preview-abc.vercel.app";
      const { tiktokProvider } = await import("../providers/tiktok");

      tiktokProvider.pixelTrack({ eventName: "PageView", eventId: "pv_1", eventTime: 1 });
      tiktokProvider.pixelTrack({ eventName: "AddToCart", eventId: "atc_1", eventTime: 1 });

      assert.equal(spy.pageCalls, 0);
      assert.equal(spy.trackCalls.length, 0);
      teardownBrowser();
    },
  ],
  [
    "nothing fires when the pixel id env var is unset",
    async () => {
      delete process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID;
      const spy = installBrowser();
      const { tiktokProvider } = await import("../providers/tiktok");

      tiktokProvider.pixelTrack({ eventName: "PageView", eventId: "pv_1", eventTime: 1 });
      tiktokProvider.pixelTrack({ eventName: "AddToCart", eventId: "atc_1", eventTime: 1 });

      assert.equal(spy.pageCalls, 0);
      assert.equal(spy.trackCalls.length, 0);
      teardownBrowser();
    },
  ],
];

async function run() {
  console.log("tiktok-pixel-events");
  for (const [name, fn] of tests) {
    await fn();
    console.log(`  ✓ ${name}`);
  }
}

run()
  .then(() => {
    teardownBrowser();
    process.env = realEnv;
    console.log("✓ all tiktok-pixel-events tests passed");
    process.exit(0);
  })
  .catch((e) => {
    teardownBrowser();
    process.env = realEnv;
    console.error("✗ tiktok-pixel-events FAILED:", e);
    process.exit(1);
  });
