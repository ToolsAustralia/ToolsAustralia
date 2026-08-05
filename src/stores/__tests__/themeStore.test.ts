import assert from "node:assert/strict";
import { migrateThemeState } from "../useThemeStore";

/**
 * v3 (2026-08-05): the default flipped light → DARK, concluding the "Promo landing —
 * default theme" experiment (dark 2.04% vs light 1.74%).
 *
 * The invariant these assertions pin is unchanged by that flip: **only a real choice
 * survives a migration.** `userManualOverride === true` means the user worked the toggle;
 * anything else is a stale default sitting in localStorage and follows the current default.
 * The expectations invert because the default did — not because the rule changed.
 */
function run() {
  // The load-bearing case. A stored "light" with NO override flag is the pre-v3 default,
  // not a preference. If this ever returns light again, the entire existing audience stays
  // pinned to the losing variant and the flip reaches only new visitors.
  assert.deepEqual(
    migrateThemeState({ theme: "light" }, 2),
    { theme: "dark" },
    "v2 default light (never chosen) moves to the new dark default",
  );

  // Its mirror: someone who deliberately picked light keeps light.
  assert.deepEqual(
    migrateThemeState({ theme: "light", userManualOverride: true }, 2),
    { theme: "light", userManualOverride: true },
    "user-chosen light is preserved and stays marked",
  );

  assert.deepEqual(
    migrateThemeState({ theme: "dark", userManualOverride: true }, 0),
    { theme: "dark", userManualOverride: true },
    "user-chosen dark is preserved and marked",
  );

  // v0's removed auto-switcher wrote dark for users who never chose (override === false).
  // They land on dark now too — but as the DEFAULT, not by inheriting that bug, so they
  // must stay unmarked (asserted below).
  assert.deepEqual(
    migrateThemeState({ theme: "dark", userManualOverride: false }, 0),
    { theme: "dark" },
    "v0 auto-dark lands on dark as the default, unmarked",
  );

  assert.deepEqual(
    migrateThemeState({ theme: "dark" }, 1),
    { theme: "dark" },
    "v1 dark carries forward",
  );

  // A persisted `false` makes BOTH readers (the inline bootstrap snippet and
  // readThemeFromPersistStorage) treat the record as "never chose". The key must be
  // ABSENT rather than false, so "never chose" stays distinguishable from "chose".
  for (const [input, version] of [
    [{ theme: "dark", userManualOverride: false }, 0],
    [{ theme: "light" }, 2],
    [{}, 1],
  ] as const) {
    const out = migrateThemeState(input, version) as Record<string, unknown>;
    assert.equal(
      Object.prototype.hasOwnProperty.call(out, "userManualOverride") &&
        out.userManualOverride === false,
      false,
      "userManualOverride is never persisted as false",
    );
  }

  assert.deepEqual(migrateThemeState(null, 0), { theme: "dark" }, "null persists as dark");

  console.log("themeStore: all assertions passed");
}

run();
