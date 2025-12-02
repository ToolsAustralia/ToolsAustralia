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
  //
  // External script sources allowed:
  // - https://connect.facebook.net: Facebook Pixel script (fbevents.js)
  // - https://js.stripe.com: Stripe.js library (required for payment forms)
  // - https://analytics.tiktok.com: TikTok Pixel script (required for TikTok tracking)
  // - https://js.hcaptcha.com: hCaptcha script (required for Stripe's fraud detection)
  // - https://*.hcaptcha.com: hCaptcha wildcard (required for dynamic subdomains used by hCaptcha iframes)
  const scriptSrc = nonce
    ? `script-src 'self' 'nonce-${nonce}' 'unsafe-eval' https://connect.facebook.net https://js.stripe.com https://analytics.tiktok.com https://js.hcaptcha.com https://*.hcaptcha.com 'sha256-DYFSjgyML0TKIOzsnWRWtsvywBFJ9rY4U8a6TgrKiXU=' 'sha256-fLWhKT52f/f9E2X9DpwgQUgQe08peiH9FRDd5oyirNk='`
    : `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://connect.facebook.net https://js.stripe.com https://analytics.tiktok.com https://js.hcaptcha.com https://*.hcaptcha.com https:`;
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "block-all-mixed-content",
    // connect-src: Allow network requests to external APIs
    // - Facebook domains: For Facebook Pixel and Conversions API
    //   * www.facebook.com: Facebook tracking endpoint
    //   * graph.facebook.com: Facebook Graph API (Conversions API)
    //   * connect.facebook.net: Facebook Pixel network requests
    // - Stripe domains: For payment processing, fraud detection, and analytics
    //   * api.stripe.com: Stripe API calls (payment processing)
    //   * r.stripe.com: Stripe reporting/analytics endpoint (required for fraud detection)
    //   * b.stripecdn.com: Stripe CDN (fraud detection assets and hCaptcha integration)
    //   * q.stripe.com: Stripe image assets
    //   * m.stripe.com: Stripe additional services
    // - hCaptcha: Required for Stripe's fraud detection system
    //   * api.hcaptcha.com: hCaptcha authentication API
    //   * hcaptcha.com: hCaptcha main domain
    //   * *.hcaptcha.com: hCaptcha wildcard (required for dynamic subdomains and iframe contexts)
    "connect-src 'self' https://www.facebook.com https://graph.facebook.com https://connect.facebook.net https://api.stripe.com https://r.stripe.com https://b.stripecdn.com https://q.stripe.com https://m.stripe.com https://api.hcaptcha.com https://hcaptcha.com https://*.hcaptcha.com https:",
    "font-src 'self' https: data:",
    // form-action: Allow Facebook Pixel to submit tracking data via hidden forms
    // This is required for Facebook Pixel's fallback tracking mechanism
    // Only allows form submissions to self and Facebook's tracking endpoint
    "form-action 'self' https://www.facebook.com",
    "frame-ancestors 'none'",
    // frame-src: Allow iframes from trusted sources
    // - Stripe: For payment forms and fraud detection
    //   * js.stripe.com: Stripe Elements iframes (payment forms)
    // - Facebook: For social widgets
    //   * connect.facebook.net: Facebook social widgets
    //   * www.facebook.com: Facebook iframes
    // - hCaptcha: Required for Stripe's fraud detection iframes
    //   * js.hcaptcha.com: hCaptcha widget iframe
    //   * hcaptcha.com: hCaptcha main iframe domain
    //   * *.hcaptcha.com: hCaptcha wildcard (required for dynamic subdomains in iframe contexts)
    // - Vercel: For development feedback (staging only)
    "frame-src 'self' https://js.stripe.com https://connect.facebook.net https://www.facebook.com https://vercel.live https://js.hcaptcha.com https://hcaptcha.com https://*.hcaptcha.com",
    // img-src: Allow images from Stripe CDN for payment form assets
    // - q.stripe.com: Stripe image assets (payment form icons, etc.)
    "img-src 'self' https: data: blob: https://q.stripe.com",
    "manifest-src 'self'",
    "media-src 'self' https:",
    "object-src 'none'",
    scriptSrc,
    // worker-src: Allow service workers from Stripe (if used for payment processing)
    "worker-src 'self' https://js.stripe.com",
    // style-src: Allow styles from hCaptcha iframes
    // - *.hcaptcha.com: hCaptcha wildcard (required for styles in iframe contexts)
    "style-src 'self' 'unsafe-inline' https: https://*.hcaptcha.com",
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
