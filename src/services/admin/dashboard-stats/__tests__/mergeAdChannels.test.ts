import {
  mergeAdChannels,
  type AdChannelFetchResult,
  type AdChannelMetrics,
} from "../adChannelProviders";

let passed = 0;
let failed = 0;

function expect(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed += 1;
    console.log(`✓ ${name}`);
  } else {
    failed += 1;
    console.error(`✗ ${name}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
  }
}

const fb = (spend: number): AdChannelMetrics => ({ spend, revenue: spend * 0.5, roas: 0.5 });
const ok = (m: AdChannelMetrics): AdChannelFetchResult => ({ status: "ok", metrics: m });
const empty: AdChannelFetchResult = { status: "empty" };
const error: AdChannelFetchResult = { status: "error" };

function run(
  fetched: Array<{ key: string; result: AdChannelFetchResult }>,
  prior?: Record<string, AdChannelMetrics> | null
) {
  const r = mergeAdChannels(fetched, prior);
  return { channels: Object.fromEntries(r.channels), preserved: r.preserved, lost: r.lost };
}

// 1. ok → written
expect(
  "ok writes metrics",
  run([{ key: "facebook", result: ok(fb(100)) }]),
  { channels: { facebook: fb(100) }, preserved: [], lost: [] }
);

// 2. empty → omitted (renders as $0 / absent), even with a prior value
expect(
  "empty omits channel",
  run([{ key: "facebook", result: empty }], { facebook: fb(100) }),
  { channels: {}, preserved: [], lost: [] }
);

// 3. error + prior present → PRESERVE prior (the core incident guard)
expect(
  "error preserves prior stored value",
  run([{ key: "facebook", result: error }], { facebook: fb(2460.06) }),
  { channels: { facebook: fb(2460.06) }, preserved: ["facebook"], lost: [] }
);

// 4. error + no prior → leave absent (nothing to preserve on a first write)
expect(
  "error with no prior leaves channel absent",
  run([{ key: "facebook", result: error }], null),
  { channels: {}, preserved: [], lost: ["facebook"] }
);

// 5. Regression for the 2026-06-11 wipe: an error must NEVER zero a day that had spend
expect(
  "error never zeroes a day that had spend",
  run([{ key: "facebook", result: error }], { facebook: fb(7536.83) }).channels.facebook.spend,
  7536.83
);

// 6. Mixed channels resolve independently in one pass
expect(
  "mixed ok+empty+error resolves independently",
  run(
    [
      { key: "facebook", result: error },
      { key: "tiktok", result: ok(fb(50)) },
      { key: "snapchat", result: empty },
    ],
    { facebook: fb(900), snapchat: fb(10) }
  ),
  { channels: { facebook: fb(900), tiktok: fb(50) }, preserved: ["facebook"], lost: [] }
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
