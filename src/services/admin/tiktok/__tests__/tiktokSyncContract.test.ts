/**
 * Pins the TikTok sync's failure-visibility contract (panel F-008):
 *
 *   1. NOT CONFIGURED  → syncDateRange returns { configured: false } — a clean no-op.
 *   2. CONFIGURED + API error (HTTP 200 / code != 0) → THROWS TikTokReportError
 *      carrying TikTok's own code — the cron must 500 so Vercel cron monitoring
 *      surfaces the failure. A green cron over a dead token is the June-2026
 *      Meta-spend-wipe failure class; this test exists so no "fix" ever softens it.
 *   3. CONFIGURED + network error → also throws TikTokReportError.
 *   4. CONFIGURED + code 0 with zero rows → clean success (configured: true, 0 rows),
 *      NOT a throw — empty is not failure.
 *   5. metricNamesSuspect (panel F-005): clicks with all-zero conversions+revenue is
 *      suspect; any conversions/revenue, or zero clicks, is not.
 *
 * Zero-DB, zero-network: globalThis.fetch is stubbed; no mongoose connection is opened
 * (the empty-rows path never reaches bulkWrite).
 *
 * Run: npm run test:tiktok-sync-contract
 */
import assert from "node:assert";
import {
  TikTokInsightsSyncService,
  metricNamesSuspect,
} from "../TikTokInsightsSyncService";
import { TikTokReportError } from "../tiktokAdInsights";

const realFetch = globalThis.fetch;

function stubFetch(impl: () => Promise<Response>) {
  globalThis.fetch = impl as unknown as typeof fetch;
}

function setCreds(on: boolean) {
  if (on) {
    process.env.TIKTOK_ADVERTISER_ID = "test-advertiser-id";
    process.env.TIKTOK_MARKETING_ACCESS_TOKEN = "test-marketing-token";
  } else {
    delete process.env.TIKTOK_ADVERTISER_ID;
    delete process.env.TIKTOK_MARKETING_ACCESS_TOKEN;
  }
}

const RANGE = { since: "2026-07-17", until: "2026-07-24" };

async function run() {
  // 1. Not configured → clean no-op, fetch never called.
  setCreds(false);
  let fetchCalls = 0;
  stubFetch(async () => {
    fetchCalls++;
    throw new Error("fetch must not be called when unconfigured");
  });
  const noop = await new TikTokInsightsSyncService().syncDateRange(RANGE);
  assert.strictEqual(noop.configured, false, "unconfigured → configured:false");
  assert.strictEqual(noop.rowsUpserted, 0, "unconfigured → 0 rows");
  assert.strictEqual(fetchCalls, 0, "unconfigured → no API call");
  console.log("  ✓ unconfigured is a clean no-op (no throw, no fetch)");

  // 2. Configured + TikTok API error (the live 40001 shape) → MUST throw TikTokReportError.
  setCreds(true);
  stubFetch(async () =>
    new Response(
      JSON.stringify({ code: 40001, message: "Permission error: token lacks scope" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  );
  await assert.rejects(
    () => new TikTokInsightsSyncService().syncDateRange(RANGE),
    (e: unknown) => {
      assert.ok(e instanceof TikTokReportError, "throws TikTokReportError");
      assert.strictEqual(e.tiktokCode, 40001, "carries TikTok's own code");
      assert.match(e.message, /Permission error/, "carries TikTok's own message");
      return true;
    },
    "configured + API error must THROW (cron 500s loudly), never resolve",
  );
  console.log("  ✓ configured + code 40001 throws TikTokReportError (cron stays red)");

  // 3. Configured + network failure → also throws TikTokReportError.
  stubFetch(async () => {
    throw new TypeError("fetch failed");
  });
  await assert.rejects(
    () => new TikTokInsightsSyncService().syncDateRange(RANGE),
    (e: unknown) => e instanceof TikTokReportError,
    "configured + network error must throw TikTokReportError",
  );
  console.log("  ✓ configured + network error throws TikTokReportError");

  // 4. Configured + code 0, zero rows → clean success, not a throw.
  stubFetch(async () =>
    new Response(JSON.stringify({ code: 0, message: "OK", data: { list: [] } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
  const empty = await new TikTokInsightsSyncService().syncDateRange(RANGE);
  assert.strictEqual(empty.configured, true, "empty success → configured:true");
  assert.strictEqual(empty.rowsUpserted, 0, "empty success → 0 rows");
  console.log("  ✓ configured + zero rows is clean success (empty ≠ failure)");

  // 5. metricNamesSuspect tripwire (panel F-005).
  assert.strictEqual(
    metricNamesSuspect({ clicks: 500, conversions: 0, revenueCents: 0 }),
    true,
    "clicks with all-zero conversions+revenue is suspect",
  );
  assert.strictEqual(
    metricNamesSuspect({ clicks: 500, conversions: 3, revenueCents: 0 }),
    false,
    "any conversions → not suspect",
  );
  assert.strictEqual(
    metricNamesSuspect({ clicks: 500, conversions: 0, revenueCents: 19999 }),
    false,
    "any revenue → not suspect",
  );
  assert.strictEqual(
    metricNamesSuspect({ clicks: 0, conversions: 0, revenueCents: 0 }),
    false,
    "no clicks (no traffic) → not suspect",
  );
  console.log("  ✓ metricNamesSuspect fires only on clicks-with-zero-outcomes");
}

run()
  .then(() => {
    globalThis.fetch = realFetch;
    console.log("✓ all tiktok-sync-contract tests passed");
    process.exit(0);
  })
  .catch((e) => {
    globalThis.fetch = realFetch;
    console.error("✗ tiktok-sync-contract test FAILED:", e);
    process.exit(1);
  });
