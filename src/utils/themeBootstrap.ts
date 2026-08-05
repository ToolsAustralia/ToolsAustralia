/**
 * Read the effective theme from Zustand persist localStorage (`ta-theme`).
 *
 * DARK is the default (2026-08-05, from the promo default-theme experiment). This runs
 * BEFORE hydration to set the class on <html>, so it MUST agree with useThemeStore's
 * default and with migrateThemeState — if they disagree the page paints one theme and
 * then swaps a moment later.
 *
 * A persisted `"light"` is honoured only when the user actually CHOSE it
 * (`userManualOverride === true`). A stored light WITHOUT that flag is just the old
 * default sitting in localStorage, not a preference, so it resolves to dark.
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
    if (t === "light") return override === true ? "light" : "dark";
    if (t === "dark") return "dark";
    return null;
  } catch {
    return null;
  }
}
