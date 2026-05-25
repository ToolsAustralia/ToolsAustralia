/**
 * Per-user API responses must never be stored by a shared (CDN) or browser cache
 * keyed only by URL — otherwise one user's body (or a guest's userStats: null) is
 * served to another. For authenticated requests force `private, no-store`. For
 * anonymous requests keep the caller's public caching, but always emit `Vary: Cookie`
 * so a shared cache keeps the guest entry separate from any cookie-bearing
 * (authenticated) request and never hands a cached guest copy to a logged-in user.
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
