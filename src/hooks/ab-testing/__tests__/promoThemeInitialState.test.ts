import assert from "node:assert/strict";
import { resolveInitialPromoThemeState } from "../usePromoThemeExperiment";

/**
 * Regression guard for the highest-severity bug this hook can produce: the
 * `!experimentId` check must run BEFORE the "no storage" (server-pass) check.
 * If that order were ever flipped, `resolveInitialPromoThemeState(null, null)`
 * — the server pass with NO active experiment, the overwhelming common case —
 * would return `settled: false`, and the gate would bake a full-screen overlay
 * into CDN-cached ISR HTML for every visitor and every crawler. The e2e spec
 * for this feature only runs with an experiment ACTIVE, so it cannot catch
 * this; this test is the only coverage for that ordering.
 */

const MARKER_KEY = "ta_promo_theme_exp1";

function makeFakeStorage(
  initial: Record<string, string> = {},
  opts: { throwOnGet?: boolean } = {},
): Storage {
  const data: Record<string, string> = { ...initial };
  const storage = {
    getItem(key: string): string | null {
      if (opts.throwOnGet) throw new Error("storage unavailable");
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key: string, value: string): void {
      data[key] = value;
    },
    removeItem(key: string): void {
      delete data[key];
    },
    clear(): void {
      for (const key of Object.keys(data)) delete data[key];
    },
    key(index: number): string | null {
      return Object.keys(data)[index] ?? null;
    },
    get length(): number {
      return Object.keys(data).length;
    },
  };
  return storage as unknown as Storage;
}

function run() {
  // (null, null) — server pass, no experiment. MUST be settled: true. This is
  // the regression guard: swapping the two checks in the initializer makes
  // this false, shipping an overlay inside cached ISR HTML.
  assert.deepEqual(
    resolveInitialPromoThemeState(null, null),
    { settled: true, theme: null },
    "no experiment + no storage (server pass) settles synchronously",
  );

  // (null, <storage>) — client pass, no experiment.
  assert.deepEqual(
    resolveInitialPromoThemeState(null, makeFakeStorage()),
    { settled: true, theme: null },
    "no experiment + storage present still settles synchronously",
  );

  // ("exp1", null) — server pass with an active experiment: must hold.
  assert.deepEqual(
    resolveInitialPromoThemeState("exp1", null),
    { settled: false, theme: null },
    "active experiment + server pass (no storage) is unsettled",
  );

  // ("exp1", <empty storage>) — client pass, first visit, active experiment.
  assert.deepEqual(
    resolveInitialPromoThemeState("exp1", makeFakeStorage()),
    { settled: false, theme: null },
    "active experiment + empty storage is unsettled",
  );

  // ("exp1", <storage with the device marker>) — returning, already-bucketed device.
  assert.deepEqual(
    resolveInitialPromoThemeState("exp1", makeFakeStorage({ [MARKER_KEY]: "dark" })),
    { settled: true, theme: null },
    "device marker present short-circuits to settled",
  );

  // ("exp1", <storage with ta-theme userManualOverride true>) — visitor toggled manually.
  assert.deepEqual(
    resolveInitialPromoThemeState(
      "exp1",
      makeFakeStorage({
        "ta-theme": JSON.stringify({ state: { theme: "dark", userManualOverride: true }, version: 2 }),
      }),
    ),
    { settled: true, theme: null },
    "manual theme choice short-circuits to settled",
  );

  // Storage that throws on getItem must not propagate — falls through to unsettled.
  assert.deepEqual(
    resolveInitialPromoThemeState("exp1", makeFakeStorage({}, { throwOnGet: true })),
    { settled: false, theme: null },
    "a throwing storage degrades gracefully to unsettled, not an uncaught error",
  );

  console.log("promoThemeInitialState: all assertions passed");
}

run();
