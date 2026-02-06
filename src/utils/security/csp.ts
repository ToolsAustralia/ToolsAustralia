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
  // Script sources: Facebook Pixel, Stripe.js, TikTok Pixel, Klaviyo, GTM, hCaptcha, Apple Pay, Hotjar
  // Next.js inline script hashes allow runtime scripts that don't support nonces
  const scriptSrc = nonce
    ? `script-src 'self' 'nonce-${nonce}' 'unsafe-eval' https://connect.facebook.net https://js.stripe.com https://analytics.tiktok.com https://static.klaviyo.com https://static-tracking.klaviyo.com https://static-forms.klaviyo.com https://www.googletagmanager.com https://js.hcaptcha.com https://*.hcaptcha.com https://applepay.cdn-apple.com https://script.hotjar.com 'sha256-DYFSjgyML0TKIOzsnWRWtsvywBFJ9rY4U8a6TgrKiXU=' 'sha256-fLWhKT52f/f9E2X9DpwgQUgQe08peiH9FRDd5oyirNk='`
    : `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://connect.facebook.net https://js.stripe.com https://analytics.tiktok.com https://static.klaviyo.com https://static-tracking.klaviyo.com https://static-forms.klaviyo.com https://www.googletagmanager.com https://js.hcaptcha.com https://*.hcaptcha.com https://applepay.cdn-apple.com https://script.hotjar.com`;
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "block-all-mixed-content",
    // Network requests: Facebook (Pixel/CAPI), Stripe (payment/fraud), hCaptcha (fraud detection), Google Pay (payment manifest), Apple Pay (payment relay), Klaviyo (tracking/API/anonymous-login/forms), TikTok (pixel API), GTM/GA
    "connect-src 'self' https://www.facebook.com https://graph.facebook.com https://connect.facebook.net https://api.stripe.com https://r.stripe.com https://b.stripecdn.com https://q.stripe.com https://m.stripe.com https://api.hcaptcha.com https://hcaptcha.com https://*.hcaptcha.com https://pay.google.com https://paymentrelayservice.apple.com https://fast.a.klaviyo.com https://a.klaviyo.com https://static-tracking.klaviyo.com https://static-forms.klaviyo.com https://atlas-app.services.klaviyo.com https://analytics.tiktok.com https://www.googletagmanager.com https://www.google-analytics.com",
    "font-src 'self' https: data: https://applepay.cdn-apple.com",
    // Form submissions: Facebook Pixel fallback tracking
    "form-action 'self' https://www.facebook.com",
    "frame-ancestors 'self' https://pay.google.com https://js.stripe.com",
    // Iframes: Stripe payment forms, Facebook widgets, hCaptcha fraud detection, Google Pay, Apple Pay, Klaviyo forms, GTM noscript
    "frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://pay.google.com https://*.google.com https://*.gstatic.com https://applepay.cdn-apple.com https://js.hcaptcha.com https://*.hcaptcha.com https://connect.facebook.net https://www.facebook.com https://static-forms.klaviyo.com https://vercel.live https://www.googletagmanager.com",

    "img-src 'self' https: data: blob: https://q.stripe.com",
    "manifest-src 'self' https://pay.google.com",
    "media-src 'self' https:",
    "object-src 'none'",
    scriptSrc,
    "worker-src 'self' https://js.stripe.com",
    "style-src 'self' 'unsafe-inline' https: https://*.hcaptcha.com",
    "style-src-attr 'self' 'unsafe-inline'",
    "style-src-elem 'self' 'unsafe-inline' https:",
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
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    // COEP excluded: breaks third-party scripts (Stripe.js, Vercel Analytics) that don't send CORP headers
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
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    // COEP excluded for webhook routes to allow external POST requests (security via signature verification)
    {
      key: "Permissions-Policy",
      value: 'camera=(), microphone=(), geolocation=(), payment=(self "https://js.stripe.com")',
    },
    { key: "Content-Security-Policy", value: csp },
  ];
}
