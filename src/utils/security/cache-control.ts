/**
 * Prevents per-user API responses from leaking through shared (CDN) or browser caches.
 *
 * Two mechanisms, both required:
 *  - Authenticated requests get `private, no-store` so the per-user body (e.g. userStats)
 *    is never stored by any cache.
 *  - Guest responses keep the caller's public caching, but add `Vary: Cookie` so a shared
 *    cache will NOT serve a stored guest copy (userStats: null) to a later cookie-bearing
 *    (authenticated) request keyed on the same URL. `private, no-store` alone does NOT
 *    prevent that — only Vary (or not caching guests at all) does.
 *
 * Note: because guests on these pages also carry cookies (A/B anonymousId, tracking),
 * `Vary: Cookie` fragments the guest cache, so guest CDN sharing is reduced in practice;
 * the privacy/correctness guarantee is the priority over guest hit-rate.
 *
 * See docs/security-csp/rules.md — "Never public-cache per-user responses".
 */
export function userScopedCacheControl(
  isAuthenticated: boolean,
  publicCacheControl: string
): { cacheControl: string; vary: "Cookie" } {
  return isAuthenticated
    ? { cacheControl: "private, no-store", vary: "Cookie" }
    : { cacheControl: publicCacheControl, vary: "Cookie" };
}
