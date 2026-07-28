import assert from "node:assert/strict";
import { migrateThemeState } from "../useThemeStore";

function run() {
  // v0: the removed time-based auto-switcher wrote dark for users who never chose
  // it. Those carry userManualOverride === false and MUST be demoted to light.
  // zustand does not chain migrations, so the v2 function receives v0 records
  // directly — dropping this predicate resurrects the old auto-dark bug.
  assert.deepEqual(
    migrateThemeState({ theme: "dark", userManualOverride: false }, 0),
    { theme: "light" },
    "v0 auto-dark demotes to light",
  );

  assert.deepEqual(
    migrateThemeState({ theme: "dark", userManualOverride: true }, 0),
    { theme: "dark", userManualOverride: true },
    "v0 user-chosen dark is preserved and marked",
  );

  assert.deepEqual(
    migrateThemeState({ theme: "dark" }, 1),
    { theme: "dark" },
    "v1 dark carries forward",
  );

  assert.deepEqual(
    migrateThemeState({ theme: "light" }, 1),
    { theme: "light" },
    "v1 light carries forward",
  );

  // A persisted `false` makes BOTH readers (inline snippet `o !== false`, and
  // readThemeFromPersistStorage) demote dark to light. The key must be absent.
  for (const [input, version] of [
    [{ theme: "dark", userManualOverride: false }, 0],
    [{ theme: "light" }, 1],
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

  assert.deepEqual(migrateThemeState(null, 0), { theme: "light" }, "null persists as light");

  console.log("themeStore: all assertions passed");
}

run();
