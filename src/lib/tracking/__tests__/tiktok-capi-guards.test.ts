/**
 * Guard tests for `sendTikTokEvent` (panel F-009) — the three refusals that keep bad or
 * environment-polluting events off the TikTok Events API. Facebook's equivalent sender
 * has these covered; TikTok's did not, so any of them could regress silently:
 *
 *   1. Missing creds (pixel id / access token)        → false, no request.
 *   2. Non-prod WITHOUT a test_event_code             → false, no request.
 *      (Without this, dev/preview traffic lands in PRODUCTION TikTok reporting.)
 *   3. Missing/blank event_id                         → false, no request.
 *      (event_id is the browser↔server dedup key; sending without it double-counts.)
 *   4. HTTP 200 with body `code !== 0`                → false (TikTok signals failure
 *      in the BODY, not the status — treating 200 as success hides every rejection.)
 *   5. HTTP 200 with `code: 0`                        → true, and prod WITH
 *      TIKTOK_USE_TEST_EVENTS=true forwards the test code.
 *
 * Zero-network: `globalThis.fetch` is stubbed and asserted call-by-call.
 * Run: npm run test:tiktok-capi-guards
 */
import assert from "node:assert";
import { sendTikTokEvent, type TikTokEvent } from "../../tiktok";

const realFetch = globalThis.fetch;
const realEnv = { ...process.env };

interface Captured {
  url: string;
  body: Record<string, unknown>;
  headers: Record<string, string>;
}

let calls: Captured[] = [];

function stubFetch(response: { status?: number; json: unknown }) {
  calls = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({
      url: String(url),
      body: JSON.parse(String(init?.body ?? "{}")),
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    return new Response(JSON.stringify(response.json), {
      status: response.status ?? 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

/** Reset to a clean, CONFIGURED, non-production environment. */
function baseEnv() {
  process.env = { ...realEnv };
  process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID = "PIXEL123";
  process.env.TIKTOK_ACCESS_TOKEN = "token123";
  // Force the NON-production branch of getPixelEnv(). NODE_ENV is typed read-only, so
  // steer the host-based fallback instead: no VERCEL_ENV + a non-prod host ⇒
  // "development" (see src/lib/facebook-env.ts).
  delete process.env.VERCEL_ENV;
  process.env.NEXTAUTH_URL = "http://localhost:3000";
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.TIKTOK_TEST_EVENT_CODE;
  delete process.env.TIKTOK_USE_TEST_EVENTS;
}

/** Force the "production" branch of getPixelEnv(). */
function prodEnv() {
  baseEnv();
  process.env.VERCEL_ENV = "production";
}

const event = (over: Partial<TikTokEvent> = {}): TikTokEvent => ({
  event: "Purchase",
  event_time: 1_700_000_000,
  event_id: "evt-1",
  user: {},
  properties: { value: 25, currency: "AUD" },
  ...over,
});

const tests: Array<[string, () => Promise<void>]> = [
  [
    "refuses (and sends nothing) when the pixel id is missing",
    async () => {
      baseEnv();
      process.env.TIKTOK_TEST_EVENT_CODE = "TEST42";
      delete process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID;
      stubFetch({ json: { code: 0 } });
      assert.equal(await sendTikTokEvent(event()), false);
      assert.equal(calls.length, 0, "must not call the API without a pixel id");
    },
  ],
  [
    "refuses (and sends nothing) when the access token is missing",
    async () => {
      baseEnv();
      process.env.TIKTOK_TEST_EVENT_CODE = "TEST42";
      delete process.env.TIKTOK_ACCESS_TOKEN;
      stubFetch({ json: { code: 0 } });
      assert.equal(await sendTikTokEvent(event()), false);
      assert.equal(calls.length, 0, "must not call the API without a token");
    },
  ],
  [
    "GUARD 1: refuses in non-prod when no test_event_code is set (never pollute prod reporting)",
    async () => {
      baseEnv(); // development, no TIKTOK_TEST_EVENT_CODE
      stubFetch({ json: { code: 0 } });
      assert.equal(await sendTikTokEvent(event()), false);
      assert.equal(calls.length, 0, "non-prod without a test code must not reach TikTok");
    },
  ],
  [
    "non-prod WITH a test_event_code sends, and forwards the code at the body top level",
    async () => {
      baseEnv();
      process.env.TIKTOK_TEST_EVENT_CODE = "TEST42";
      stubFetch({ json: { code: 0 } });
      assert.equal(await sendTikTokEvent(event()), true);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].body.test_event_code, "TEST42");
      assert.equal(calls[0].body.event_source_id, "PIXEL123");
      assert.equal(calls[0].headers["Access-Token"], "token123");
    },
  ],
  [
    "GUARD 2: refuses when event_id is missing or blank (dedup key — omitting it double-counts)",
    async () => {
      baseEnv();
      process.env.TIKTOK_TEST_EVENT_CODE = "TEST42";
      stubFetch({ json: { code: 0 } });
      assert.equal(await sendTikTokEvent(event({ event_id: "" })), false);
      assert.equal(await sendTikTokEvent(event({ event_id: "   " })), false, "whitespace is blank");
      assert.equal(
        await sendTikTokEvent(event({ event_id: undefined as unknown as string })),
        false,
      );
      assert.equal(calls.length, 0, "no event_id must not reach TikTok");
    },
  ],
  [
    "GUARD 3: HTTP 200 with code != 0 is a FAILURE (TikTok reports errors in the body)",
    async () => {
      baseEnv();
      process.env.TIKTOK_TEST_EVENT_CODE = "TEST42";
      stubFetch({ status: 200, json: { code: 40001, message: "Permission error" } });
      assert.equal(await sendTikTokEvent(event()), false, "200 + code 40001 must be false");
      assert.equal(calls.length, 1, "the request WAS made — only the verdict differs");
    },
  ],
  [
    "an unparseable 200 body is a failure, not a silent success",
    async () => {
      baseEnv();
      process.env.TIKTOK_TEST_EVENT_CODE = "TEST42";
      calls = [];
      globalThis.fetch = (async () =>
        new Response("<html>gateway error</html>", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        })) as unknown as typeof fetch;
      assert.equal(await sendTikTokEvent(event()), false);
    },
  ],
  [
    "a transport failure returns false rather than throwing (never breaks the caller's flow)",
    async () => {
      baseEnv();
      process.env.TIKTOK_TEST_EVENT_CODE = "TEST42";
      globalThis.fetch = (async () => {
        throw new TypeError("fetch failed");
      }) as unknown as typeof fetch;
      assert.equal(await sendTikTokEvent(event()), false);
    },
  ],
  [
    "production sends WITHOUT a test code by default (real reporting stays clean)",
    async () => {
      prodEnv();
      process.env.TIKTOK_TEST_EVENT_CODE = "TEST42"; // present but must be ignored
      stubFetch({ json: { code: 0 } });
      assert.equal(await sendTikTokEvent(event()), true);
      assert.equal(calls.length, 1);
      assert.equal(
        "test_event_code" in calls[0].body,
        false,
        "prod must NOT forward a test code unless explicitly opted in",
      );
    },
  ],
  [
    "production WITH TIKTOK_USE_TEST_EVENTS=true does forward the test code (deliberate opt-in)",
    async () => {
      prodEnv();
      process.env.TIKTOK_USE_TEST_EVENTS = "true";
      process.env.TIKTOK_TEST_EVENT_CODE = "TEST42";
      stubFetch({ json: { code: 0 } });
      assert.equal(await sendTikTokEvent(event()), true);
      assert.equal(calls[0].body.test_event_code, "TEST42");
    },
  ],
];

async function run() {
  console.log("tiktok-capi-guards");
  for (const [name, fn] of tests) {
    await fn();
    console.log(`  ✓ ${name}`);
  }
}

run()
  .then(() => {
    globalThis.fetch = realFetch;
    process.env = realEnv;
    console.log("✓ all tiktok-capi-guards tests passed");
    process.exit(0);
  })
  .catch((e) => {
    globalThis.fetch = realFetch;
    process.env = realEnv;
    console.error("✗ tiktok-capi-guards FAILED:", e);
    process.exit(1);
  });
