/**
 * Read the effective theme from Zustand persist localStorage (`ta-theme`).
 *
 * Light is the default. A persisted `"dark"` is honoured only when the user actually
 * chose it: the removed v0 auto-switcher wrote `"dark"` for users who never toggled
 * (those carry `userManualOverride === false`), so we resolve those back to light.
 *
 * Returns null if missing or invalid (caller may fall back to DOM / default).
 */
export function readThemeFromPersistStorage(): "light" | "dark" | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("ta-theme");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      state?: { theme?: string; userManualOverride?: boolean };
    } | null;
    const t = parsed?.state?.theme;
    const override = parsed?.state?.userManualOverride;
    if (t === "dark") return override === false ? "light" : "dark";
    if (t === "light") return "light";
    return null;
  } catch {
    return null;
  }
}
