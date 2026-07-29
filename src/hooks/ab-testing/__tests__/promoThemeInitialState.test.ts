import assert from "node:assert/strict";
import { resolveInitialPromoThemeState, safeLocalStorage } from "../usePromoThemeExperiment";

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
  // This covers a THROW-ON-METHOD-CALL storage object (the failure mode the old
  // fake-storage suite already exercised); it does NOT cover a throw on the
  // `window.localStorage` PROPERTY ACCESS itself, which is a distinct WHATWG-spec
  // failure mode (SecurityError in sandboxed/cross-origin iframes, or storage
  // disabled by browser config) that happens before any `Storage` object even
  // exists to call `.getItem` on. That path is covered separately below.
  assert.deepEqual(
    resolveInitialPromoThemeState("exp1", makeFakeStorage({}, { throwOnGet: true })),
    { settled: false, theme: null },
    "a throwing storage degrades gracefully to unsettled, not an uncaught error",
  );

  // Regression case for the bug this fix addresses: `resolveInitialPromoThemeState`
  // only ever receives an already-resolved `Storage | null`, so it cannot itself
  // prove the ACCESS-throws path is handled — that guard lives in `safeLocalStorage`,
  // which both call sites (the useState initializer and `hasManualThemeChoice`) now
  // route through instead of referencing bare `localStorage`. This exercises
  // `safeLocalStorage` directly against a `window` whose `localStorage` getter
  // throws on mere property access (not inside `.getItem`/`.setItem`), simulating
  // a sandboxed iframe / storage-disabled browser. It proves `safeLocalStorage`
  // swallows that throw and returns `null` instead of letting it escape into the
  // caller's frame (a `useState` initializer during render, or a value returned on
  // every render from the cross-tab guard). It does NOT prove the full browser
  // integration end-to-end (no DOM/React renderer in this harness) — that is
  // covered by construction: every `localStorage` reference in the module either
  // routes through this function or sits inside its own try/catch (verified by
  // inspection, see the file's site-by-site guarantee in its module comment).
  {
    const globalWithWindow = globalThis as { window?: unknown };
    const originalWindow = globalWithWindow.window;
    globalWithWindow.window = {
      get localStorage(): never {
        throw new Error("SecurityError: localStorage access denied");
      },
    };
    try {
      assert.equal(
        safeLocalStorage(),
        null,
        "a localStorage getter that throws on property access degrades to null, not an uncaught throw",
      );
    } finally {
      if (originalWindow === undefined) {
        delete globalWithWindow.window;
      } else {
        globalWithWindow.window = originalWindow;
      }
    }
  }

  console.log("promoThemeInitialState: all assertions passed");
}

run();
