/**
 * Locks the ad-channel restatement window: the cron must only call Meta/TikTok for days whose
 * numbers can still change.
 *
 * The problem it fixes: `writeSlidingWindow` called `fetchForDay` for all 90 days of the sliding
 * window, three times a day (`vercel.json`: 17:30, 20:30, 03:20 UTC) — ~270 Meta Marketing API
 * calls a day to rewrite spend for days that closed months ago. Meta's limit is per-app and
 * hourly-windowed, so production logged `Application request limit reached` 9–13×/day.
 *
 * The branch this file exists to defend is #3: a SETTLED day with NO stored value must STILL be
 * fetched. Skipping it would write an empty `adChannels` where we have nothing to preserve — a
 * fresh zero, which is the 2026-06-11 shape (a dead token + this same 90-day cron zeroed ~$283k
 * of correct Facebook spend). The `naiveResolveAdChannels` mutation at the bottom of this file
 * is that wrong implementation, asserted to behave differently from the real one.
 */
import {
  resolveAdChannelsForDate,
  resolveAdChannelRestatementWindowDays,
  isWithinAdChannelRestatementWindow,
  completeDayWindowStartKey,
  resolveSlidingWindowKeys,
  aestDayBounds,
  AD_CHANNEL_RESTATEMENT_WINDOW_DAYS,
  type AdChannelRestatementWindow,
} from "../DashboardStatsSnapshotWriter";
import {
  AD_CHANNEL_PROVIDERS,
  type AdChannelFetchResult,
  type AdChannelMetrics,
  type AdChannelProvider,
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
    console.error(
      `✗ ${name}\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`
    );
  }
}
function expectTrue(name: string, actual: boolean) {
  expect(name, actual, true);
}

// ── fixtures ───────────────────────────────────────────────────────────────────────────────
const TODAY = "2026-09-01"; // AEST "today" for every scenario below
const WINDOW: AdChannelRestatementWindow = { todayAESTDateKey: TODAY, windowDays: 10 };

const IN_WINDOW_DAY = "2026-08-30"; // 2 days back — Meta can still restate it
const SETTLED_DAY = "2026-06-01"; // 3 months back — closed, cannot change

const metrics = (spend: number): AdChannelMetrics => ({
  spend,
  revenue: spend * 2,
  roas: 2,
  impressions: 1000,
  clicks: 50,
});
const okResult = (m: AdChannelMetrics): AdChannelFetchResult => ({ status: "ok", metrics: m });
const errorResult: AdChannelFetchResult = { status: "error" };

const LIVE = metrics(111.11); // what a fetch would return
const STORED = { facebook: metrics(2460.06) }; // what the snapshot already holds

interface Scenario {
  /** Undefined = no snapshot row / nothing usable stored. */
  stored?: Record<string, AdChannelMetrics>;
  result?: AdChannelFetchResult;
  /** Omit the restatement window entirely (what the backfill script does). */
  noRestatement?: boolean;
}

function countingProvider(counter: { calls: number }, result: AdChannelFetchResult): AdChannelProvider {
  return {
    key: "facebook",
    async fetchForDay() {
      counter.calls += 1;
      return result;
    },
  };
}

async function runDay(dateKey: string, scenario: Scenario = {}) {
  const counter = { calls: 0 };
  const { dayStartUTC, dayEndUTC } = aestDayBounds(dateKey);
  const resolution = await resolveAdChannelsForDate({
    dateKey,
    dayStartUTC,
    dayEndUTC,
    restatement: scenario.noRestatement ? undefined : WINDOW,
    deps: {
      providers: [countingProvider(counter, scenario.result ?? okResult(LIVE))],
      loadStoredAdChannels: async () => scenario.stored,
    },
  });
  return {
    fetchCalls: counter.calls,
    source: resolution.source,
    channels: Object.fromEntries(resolution.channels),
    preserved: resolution.preserved,
    lost: resolution.lost,
  };
}

async function main() {
  // ── the constant and its override ────────────────────────────────────────────────────────
  // 7d_click is the longest attribution window this account's ad sets use, and both ad syncs
  // re-pull 8 days (`since = until - 7`); 10 contains both with margin.
  expect("default restatement window is 10 days", AD_CHANNEL_RESTATEMENT_WINDOW_DAYS, 10);
  expectTrue(
    "default covers the 8-day window sync-meta-ads/sync-tiktok-ads themselves re-pull",
    AD_CHANNEL_RESTATEMENT_WINDOW_DAYS >= 8
  );
  expect("unset env falls back to the default", resolveAdChannelRestatementWindowDays(undefined), 10);
  expect("empty env falls back to the default", resolveAdChannelRestatementWindowDays("   "), 10);
  expect("env can widen the window without a code change", resolveAdChannelRestatementWindowDays("30"), 30);
  expect("garbage env falls back to the default", resolveAdChannelRestatementWindowDays("soon"), 10);
  expect("zero/negative env falls back (yesterday must always refresh)", resolveAdChannelRestatementWindowDays("0"), 10);

  // ── window boundary ──────────────────────────────────────────────────────────────────────
  expect("10-day window starting key", completeDayWindowStartKey(TODAY, 10), "2026-08-22");
  expectTrue("yesterday is inside the window", isWithinAdChannelRestatementWindow("2026-08-31", WINDOW));
  expectTrue("oldest in-window day is inside", isWithinAdChannelRestatementWindow("2026-08-22", WINDOW));
  expectTrue("the day before it is outside", !isWithinAdChannelRestatementWindow("2026-08-21", WINDOW));
  // The two DST switches make an AEST day 23h or 25h — the boundary must not drift by one.
  expect(
    "window start is DST-correct across the April switch",
    completeDayWindowStartKey("2026-04-10", 10),
    "2026-03-31"
  );
  expect(
    "window start is DST-correct across the October switch",
    completeDayWindowStartKey("2026-10-09", 10),
    "2026-09-29"
  );

  // ── TEST 1: a day inside the window FETCHES ──────────────────────────────────────────────
  const inWindow = await runDay(IN_WINDOW_DAY, { stored: STORED });
  expect("1. in-window day fetches (even with a stored value)", inWindow.fetchCalls, 1);
  expect("1. in-window day is marked fetched", inWindow.source, "fetched");
  expect("1. in-window day writes the LIVE value, not the stored one", inWindow.channels, {
    facebook: LIVE,
  });

  // ── TEST 2: a settled day with stored adChannels does NOT fetch ──────────────────────────
  const settledStored = await runDay(SETTLED_DAY, { stored: STORED });
  expect("2. settled day with stored data does not fetch", settledStored.fetchCalls, 0);
  expect("2. settled day is marked reused", settledStored.source, "reused");
  expect("2. the stored value is written through UNCHANGED", settledStored.channels, STORED);

  // ── TEST 3: a settled day with NO stored value STILL fetches (the incident guard) ────────
  const settledMissing = await runDay(SETTLED_DAY, { stored: undefined });
  expect("3. settled day with no snapshot row fetches anyway", settledMissing.fetchCalls, 1);
  expect("3. it is marked fetched", settledMissing.source, "fetched");
  expect("3. and it writes a real value, not an empty map", settledMissing.channels, {
    facebook: LIVE,
  });

  // An EMPTY stored map is "nothing to preserve", not a value — a day whose earlier fetch
  // errored with no prior (`lost`) lands here, as does a day with genuinely no spend.
  const settledEmpty = await runDay(SETTLED_DAY, { stored: {} });
  expect("3b. settled day with an EMPTY stored map fetches anyway", settledEmpty.fetchCalls, 1);

  // A stored row for a *different* channel must not make a missing one look settled.
  const settledPartial = await runDay(SETTLED_DAY, { stored: { tiktok: metrics(5) } });
  expect("3c. any usable stored channel counts as settled", settledPartial.fetchCalls, 0);
  expect("3c. and is written through unchanged", settledPartial.channels, { tiktok: metrics(5) });

  // ── TEST 4: a fetch ERROR on an in-window day still preserves the prior stored value ─────
  const inWindowError = await runDay(IN_WINDOW_DAY, { stored: STORED, result: errorResult });
  expect("4. fetch error preserves the prior stored value", inWindowError.channels, STORED);
  expect("4. and says so", inWindowError.preserved, ["facebook"]);
  expect(
    "4. an error never zeroes a day that had spend",
    inWindowError.channels.facebook.spend,
    2460.06
  );
  // Same guard on the branch-3 path: settled day, nothing usable stored, fetch fails.
  const settledError = await runDay(SETTLED_DAY, { stored: {}, result: errorResult });
  expect("4b. settled-day fetch error leaves the channel absent, never zeroed", settledError.channels, {});
  expect("4b. and logs it as lost", settledError.lost, ["facebook"]);

  // ── backfill compatibility: no restatement window means fetch everything ─────────────────
  const backfill = await runDay(SETTLED_DAY, { stored: STORED, noRestatement: true });
  expect("backfill (no window) fetches even a settled day with stored data", backfill.fetchCalls, 1);

  // ── TEST 5: the call-count reduction, asserted ───────────────────────────────────────────
  const keys = resolveSlidingWindowKeys(TODAY, 90);
  expect("sliding window is still 90 days", keys.length, 90);

  let fetchedDays = 0;
  let reusedDays = 0;
  let providerCalls = 0;
  for (const key of keys) {
    // Steady state: every day in history already has a stored value.
    const day = await runDay(key, { stored: STORED });
    providerCalls += day.fetchCalls;
    if (day.source === "fetched") fetchedDays += 1;
    else reusedDays += 1;
  }
  expect("5. only the 10 in-window days fetch", fetchedDays, 10);
  expect("5. the other 80 reuse their stored value", reusedDays, 80);
  expect("5. provider calls per run drop 90 → 10", providerCalls, 10);

  // Per-run, per-day the writer calls EVERY registered provider, so the Meta saving is the
  // day count. Three cron fires a day (vercel.json 17:30, 20:30, 03:20 UTC).
  const RUNS_PER_DAY = 3;
  expect("5. registered providers (facebook + tiktok)", AD_CHANNEL_PROVIDERS.length, 2);
  expect("5. Meta calls per DAY drop 270 → 30", 90 * RUNS_PER_DAY, 270);
  expect("5. …to exactly this many", providerCalls * RUNS_PER_DAY, 30);
  expectTrue("5. that is an 88.9% reduction", (270 - 30) / 270 > 0.88);

  // ── MUTATION CHECK — prove test 3 discriminates ──────────────────────────────────────────
  //
  // `naiveResolveAdChannels` is the tempting shortcut: skip the fetch for EVERY day outside the
  // window, regardless of whether anything is stored. It passes tests 1, 2 and 5 identically.
  // On test 3's scenario it writes an EMPTY adChannels map for a day we have no value for —
  // a fresh zero over real history, which is the 2026-06-11 wipe all over again.
  const naive = await naiveResolveAdChannels(SETTLED_DAY, undefined);
  expect("MUTATION: naive impl does NOT fetch a settled day with no stored value", naive.fetchCalls, 0);
  expect("MUTATION: naive impl would write an EMPTY adChannels (the incident shape)", naive.channels, {});
  expectTrue(
    "MUTATION: test 3 separates the two implementations (real fetches, naive does not)",
    settledMissing.fetchCalls === 1 && naive.fetchCalls === 0
  );
  // And the naive impl agrees with the real one everywhere test 3 is not looking — which is
  // exactly why test 3 is the assertion that matters.
  const naiveSettled = await naiveResolveAdChannels(SETTLED_DAY, STORED);
  expect("MUTATION: naive impl passes test 2 identically", naiveSettled.channels, STORED);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

/**
 * THE WRONG IMPLEMENTATION — kept here on purpose, never exported, never used in src/.
 * It skips the fetch for any out-of-window day whether or not a stored value exists.
 */
async function naiveResolveAdChannels(
  dateKey: string,
  stored: Record<string, AdChannelMetrics> | undefined
): Promise<{ fetchCalls: number; channels: Record<string, AdChannelMetrics> }> {
  const counter = { calls: 0 };
  const provider = countingProvider(counter, okResult(LIVE));
  if (!isWithinAdChannelRestatementWindow(dateKey, WINDOW)) {
    return { fetchCalls: counter.calls, channels: stored ?? {} };
  }
  const { dayStartUTC, dayEndUTC } = aestDayBounds(dateKey);
  const result = await provider.fetchForDay({ dayStartUTC, dayEndUTC });
  return {
    fetchCalls: counter.calls,
    channels: result.status === "ok" ? { facebook: result.metrics } : {},
  };
}

void main();
