/**
 * Content Security Policy builder with nonce support.
 *
 * This utility builds CSP directives dynamically, allowing per-request nonces
 * to replace 'unsafe-inline' in script-src for better security.
 */

/**
 * Builds a Content Security Policy string with optional nonce support.
 *
 * When a nonce is provided, it replaces 'unsafe-inline' in script-src,
 * allowing only scripts with the matching nonce attribute to execute.
 *
 * @param nonce - Optional nonce string to include in script-src directive
 * @returns Single-line CSP string ready for HTTP header
 *
 * @example
 * // Without nonce (fallback, still includes unsafe-inline)
 * const csp = buildContentSecurityPolicy();
 *
 * // With nonce (secure, removes unsafe-inline from script-src)
 * const nonce = generateNonce();
 * const csp = buildContentSecurityPolicy(nonce);
 */
export function buildContentSecurityPolicy(nonce?: string): string {
  // Build script-src directive
  // If nonce is provided, use it instead of 'unsafe-inline'
  // Keep 'unsafe-eval' only if Stripe.js requires it (documented below)
  // Add Next.js inline script hashes to allow Next.js build chunks
  // These hashes are for Next.js runtime inline scripts that don't support nonces
  // When Next.js updates, new hashes may need to be added (monitor console for violations)
  const scriptSrc = nonce
    ? `script-src 'self' 'nonce-${nonce}' 'unsafe-eval' https: 'sha256-DYFSjgyML0TKIOzsnWRWtsvywBFJ9rY4U8a6TgrKiXU=' 'sha256-fLWhKT52f/f9E2X9DpwgQUgQe08peiH9FRDd5oyirNk='`
    : `script-src 'self' 'unsafe-inline' 'unsafe-eval' https:`;

  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "block-all-mixed-content",
    "connect-src 'self' https:",
    "font-src 'self' https: data:",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'self' https://js.stripe.com https://connect.facebook.net https://www.facebook.com https://vercel.live",
    "img-src 'self' https: data: blob:",
    "manifest-src 'self'",
    "media-src 'self' https:",
    "object-src 'none'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline' https:",
    "style-src-attr 'self' 'unsafe-inline'",
    "style-src-elem 'self' 'unsafe-inline' https:", // Allow unsafe-inline for inline style elements (React/Next.js)
    "upgrade-insecure-requests",
  ];

  return directives.join("; ");
}

/**
 * Builds all security headers including CSP with optional nonce.
 *
 * @param nonce - Optional nonce string for CSP script-src
 * @returns Array of security header objects ready for Next.js headers() function
 */
export function buildSecurityHeaders(nonce?: string) {
  const csp = buildContentSecurityPolicy(nonce);

  return [
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    // Cross-Origin-Embedder-Policy (COEP) is intentionally excluded:
    // - COEP: require-corp breaks third-party scripts (Stripe.js, Vercel Analytics, etc.)
    //   that don't send Cross-Origin-Resource-Policy headers
    // - COEP is only needed for cross-origin isolation features (SharedArrayBuffer, etc.)
    // - For e-commerce sites, COEP causes more problems than it solves
    // - COOP: same-origin provides sufficient protection for most use cases
    // - If cross-origin isolation is needed in the future, apply COEP selectively to specific routes
    // Allow payment API for Stripe.js (required for Stripe Elements to function)
    // Note: Permissions-Policy uses structured header format - URLs must use double quotes, not single quotes
    {
      key: "Permissions-Policy",
      value: 'camera=(), microphone=(), geolocation=(), payment=(self "https://js.stripe.com")',
    },
    { key: "Content-Security-Policy", value: csp },
  ];
}

/**
 * Builds security headers for webhook endpoints, excluding Cross-Origin-Embedder-Policy.
 *
 * Webhook endpoints receive POST requests from external services (e.g., Stripe) that don't
 * include CORP headers. The COEP header would block these requests, causing 405 errors.
 *
 * This function maintains all other security headers while allowing external webhook POSTs
 * to succeed. Webhook security is handled via signature verification, not CORS/CORP.
 *
 * @param nonce - Optional nonce string for CSP script-src
 * @returns Array of security header objects without Cross-Origin-Embedder-Policy
 *
 * @example
 * // Use in next.config.ts for webhook routes
 * const webhookHeaders = buildSecurityHeadersForWebhook();
 */
export function buildSecurityHeadersForWebhook(nonce?: string) {
  const csp = buildContentSecurityPolicy(nonce);

  // Filter out Cross-Origin-Embedder-Policy to allow external webhook POST requests
  // All other security headers remain in place
  return [
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    // Note: Cross-Origin-Embedder-Policy is intentionally excluded for webhook routes
    // Allow payment API for Stripe.js (required for Stripe Elements to function)
    // Note: Permissions-Policy uses structured header format - URLs must use double quotes, not single quotes
    {
      key: "Permissions-Policy",
      value: 'camera=(), microphone=(), geolocation=(), payment=(self "https://js.stripe.com")',
    },
    { key: "Content-Security-Policy", value: csp },
  ];
}
