/**
 * Session flags for my-account landing orchestration (post-purchase UX).
 * Uses sessionStorage — scoped to the browser tab.
 */

const KEYS = {
  POST_PURCHASE_LANDING: "dashboardPostPurchaseLanding",
  COOLDOWN_UNTIL_MS: "dashboardLandingCooldownUntilMs",
  DEFER_SUBSCRIPTION_EXPLAINER_SESSION: "dashboardDeferSubscriptionExplainerSession",
} as const;

export function markPostPurchaseLanding(): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(KEYS.POST_PURCHASE_LANDING, "1");
}

export function clearPostPurchaseLanding(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(KEYS.POST_PURCHASE_LANDING);
}

export function isPostPurchaseLanding(): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(KEYS.POST_PURCHASE_LANDING) === "1";
}

/** Call when showing upsell after checkout — skips subscription explainer for this tab until next visit. */
export function setDeferSubscriptionExplainerThisSession(): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(KEYS.DEFER_SUBSCRIPTION_EXPLAINER_SESSION, "1");
}

export function shouldDeferSubscriptionExplainerThisSession(): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(KEYS.DEFER_SUBSCRIPTION_EXPLAINER_SESSION) === "1";
}

export function setLandingCooldownUntilMs(ts: number): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(KEYS.COOLDOWN_UNTIL_MS, String(ts));
}

export function clearLandingCooldown(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(KEYS.COOLDOWN_UNTIL_MS);
}

export function getLandingCooldownUntilMs(): number | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(KEYS.COOLDOWN_UNTIL_MS);
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function isLandingCooldownActive(): boolean {
  const until = getLandingCooldownUntilMs();
  if (until == null) return false;
  return Date.now() < until;
}
