/**
 * Read theme from Zustand persist localStorage (`ta-theme`).
 * Returns null if missing or invalid (caller may fall back to DOM / system).
 */
export function readThemeFromPersistStorage(): "light" | "dark" | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("ta-theme");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: { theme?: string } } | null;
    const t = parsed?.state?.theme;
    if (t === "dark" || t === "light") return t;
    return null;
  } catch {
    return null;
  }
}
