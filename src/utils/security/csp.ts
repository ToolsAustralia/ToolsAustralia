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
  // Script sources: Facebook Pixel, Stripe.js, TikTok Pixel, Klaviyo, GTM, hCaptcha, Apple Pay, Hotjar, Contentsquare
  // Next.js inline script hashes allow runtime scripts that don't support nonces.
  // The four app snippet hashes map 1:1 to the constants in
  // src/utils/security/inline-snippets.ts (drift-checked by `npm run test:csp-inline-hashes`):
  //   'sha256-K86BfaTDTe7VC3e7Zx6FI4uwzIxOmpeJZ5ZdraUzNlM=' → THEME_BOOTSTRAP_SNIPPET
  //   'sha256-yEQTk36ZkLbyTcwSVYFpl/2k0ZDTLfLcCaNGWE/vG98=' → DEVICE_TIER_SNIPPET
  //   'sha256-xaGf90svAEIA1mo6apEICfa+VIdlJdA72R2TvCgsBLY=' → GTM_INIT_SNIPPET
  //   'sha256-z/YgGrCJhp1RQPr9KSfm7P9DNBwUTwHa1UAaVdzzWQY=' → KLAVIYO_QUEUE_SNIPPET
  // They belong ONLY to the nonce variant: adding hashes to the fallback variant
  // would make browsers ignore its 'unsafe-inline' (CSP2 rule) and break every
  // other inline script on non-nonce routes.
  // Vercel Toolbar (injected ONLY on preview/staging deployments, never production):
  // allow its script + websockets there so staging consoles stay clean, per
  // https://vercel.com/docs/vercel-toolbar/managing-toolbar. On production
  // VERCEL_ENV === "production", so these stay empty and the policy is unchanged.
  const isVercelPreview = !!process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production";
  const vercelToolbarScript = isVercelPreview ? " https://vercel.live" : "";
  const vercelToolbarConnect = isVercelPreview ? " https://vercel.live https://*.pusher.com wss://*.pusher.com" : "";

  /**
   * The partner rewards portal, allowed in `frame-src` ONLY.
   *
   * WHY IT IS FRAMED AT ALL. Opening an offer needs a live portal session, and the vendor's
   * hand-off cannot carry a destination (`/verifytoken/{token}` silently drops every return
   * target — six forms measured, see docs/partner/gotchas.md). Loading that URL in a hidden
   * iframe establishes the session in place, so the member's next click lands on the offer
   * instead of being bounced to a login page. Verified on production: cold `view_smart/{id}`
   * bounces to `/my-account`; after the framed hand-off the same URL loads the offer.
   *
   * WHY IT WORKS AT ALL: the portal is a SUBDOMAIN of toolsaustralia.com.au, so the iframe is
   * same-site and its `SameSite=Lax` session cookie is honoured. This would not work from any
   * other origin — including `localhost`, where it is cross-site and silently fails. Do not
   * conclude from a failing local test that the vendor blocks framing; they send neither
   * `X-Frame-Options` nor `frame-ancestors`.
   *
   * SCOPE OF THE RELAXATION. One named host, `frame-src` only. It does NOT appear in
   * `frame-ancestors` (they still cannot frame US), `script-src`, or `connect-src`. The host
   * comes from env rather than a literal so the domain survives swapping providers
   * (CLAUDE.md: a vendor's name belongs in config and one adapter). Unset ⇒ the directive is
   * unchanged and the iframe path simply never runs — the visible hand-off still works.
   */
  const portalOrigin = (() => {
    const raw = process.env.NEXT_PUBLIC_PARTNER_PORTAL_URL?.trim();
    if (!raw) return null;
    try {
      const { protocol, origin } = new URL(raw);
      // https only — a CSP entry is a trust grant, and http would let it be tampered with.
      return protocol === "https:" ? origin : null;
    } catch {
      return null;
    }
  })();
  const partnerPortalFrameSrc = portalOrigin ? ` ${portalOrigin}` : "";

  // script-src carries `*.contentsquare.net`, not just the `t.` tag host (widened 2026-08-07).
  // Contentsquare's Voice of Customer works by having the main tag INJECT a second script,
  // `hotjar-{SITE_ID}.js`, served from a sibling contentsquare.net host — so pinning `t.` alone
  // silently blocks every survey. This matches the vendor's documented policy
  // (docs.contentsquare.com/en/web/content-security-policy/ asks for `script-src *.contentsquare.net`).
  // Widening within a vendor domain we already let execute arbitrary JS grants no new capability;
  // it is NOT a precedent for wildcarding generic cloud hosts — see the `*.on.aws` / `*.run.app`
  // refusal in docs/security-csp/gotchas.md, which still stands.
  const scriptSrc = nonce
    ? `script-src 'self' 'nonce-${nonce}' 'unsafe-eval' https://connect.facebook.net https://js.stripe.com https://analytics.tiktok.com https://static.klaviyo.com https://static-tracking.klaviyo.com https://static-forms.klaviyo.com https://www.googletagmanager.com https://js.hcaptcha.com https://*.hcaptcha.com https://applepay.cdn-apple.com https://script.hotjar.com https://*.contentsquare.net${vercelToolbarScript} 'sha256-DYFSjgyML0TKIOzsnWRWtsvywBFJ9rY4U8a6TgrKiXU=' 'sha256-fLWhKT52f/f9E2X9DpwgQUgQe08peiH9FRDd5oyirNk=' 'sha256-K86BfaTDTe7VC3e7Zx6FI4uwzIxOmpeJZ5ZdraUzNlM=' 'sha256-yEQTk36ZkLbyTcwSVYFpl/2k0ZDTLfLcCaNGWE/vG98=' 'sha256-xaGf90svAEIA1mo6apEICfa+VIdlJdA72R2TvCgsBLY=' 'sha256-z/YgGrCJhp1RQPr9KSfm7P9DNBwUTwHa1UAaVdzzWQY='`
    : `script-src 'self' 'unsafe-inline' 'unsafe-eval' https://connect.facebook.net https://js.stripe.com https://analytics.tiktok.com https://static.klaviyo.com https://static-tracking.klaviyo.com https://static-forms.klaviyo.com https://www.googletagmanager.com https://js.hcaptcha.com https://*.hcaptcha.com https://applepay.cdn-apple.com https://script.hotjar.com https://*.contentsquare.net${vercelToolbarScript}`;
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "block-all-mixed-content",
    // Network requests: Facebook (Pixel/CAPI), Stripe (payment/fraud), hCaptcha (fraud detection), Google Pay (payment manifest), Apple Pay (payment relay), Klaviyo (tracking/API/anonymous-login/forms), TikTok (pixel API), GTM/GA, Hotjar (sessions/tracking)
    // static-app.klaviyo.com added 2026-07-20: the onsite suite fetches locale data
    // (translations/en-AU/onsite-atlas/latest.json) from it — was never allowlisted.
    // NOT added: the *.on.aws / *.run.app event beacons emitted by the
    // Hotjar-by-Contentsquare module — neither vendor's CSP docs list them, and
    // wildcarding generic cloud hosts in connect-src would open an exfiltration
    // channel; see docs/security-csp/gotchas.md "Console-cleanup decisions".
    // analytics-ipv6.tiktokw.us added 2026-07-22: TikTok's SDK migrated its IPv6
    // enrichment beacon (/ipv6/enrich_ipv6) to the tiktokw.us US-entity domain —
    // the older analytics-ipv6.tiktok.com entry alone left it CSP-blocked on every
    // deployed environment (caught by the e2e suite's first staging run). A single
    // named vendor host, not a generic-cloud wildcard, so the exfiltration concern
    // above doesn't apply.
    `connect-src 'self' https://www.facebook.com https://graph.facebook.com https://connect.facebook.net https://api.stripe.com https://r.stripe.com https://b.stripecdn.com https://q.stripe.com https://m.stripe.com https://api.hcaptcha.com https://hcaptcha.com https://*.hcaptcha.com https://pay.google.com https://paymentrelayservice.apple.com https://fast.a.klaviyo.com https://a.klaviyo.com https://static-tracking.klaviyo.com https://static-forms.klaviyo.com https://static-app.klaviyo.com https://atlas-app.services.klaviyo.com https://analytics.tiktok.com https://analytics-ipv6.tiktok.com https://analytics-ipv6.tiktokw.us https://www.googletagmanager.com https://www.google-analytics.com https://vc.hotjar.io https://*.hotjar.io https://*.hotjar.com https://t.contentsquare.net https://*.contentsquare.net https://tcvsapi.contentsquare.com https://*.contentsquare.com${vercelToolbarConnect}`,
    "font-src 'self' https: data: https://applepay.cdn-apple.com",
    // Form submissions: Facebook Pixel fallback tracking
    "form-action 'self' https://www.facebook.com",
    "frame-ancestors 'self' https://pay.google.com https://js.stripe.com",
    // Iframes: Stripe payment forms, Facebook widgets, hCaptcha fraud detection, Google Pay, Apple Pay, Klaviyo forms, GTM noscript
    // + the partner rewards portal (see partnerPortalFrameSrc below).
    `frame-src 'self' https://js.stripe.com https://hooks.stripe.com https://pay.google.com https://*.google.com https://*.gstatic.com https://applepay.cdn-apple.com https://js.hcaptcha.com https://*.hcaptcha.com https://connect.facebook.net https://www.facebook.com https://static-forms.klaviyo.com https://vercel.live https://www.googletagmanager.com${partnerPortalFrameSrc}`,

    "img-src 'self' https: data: blob: https://q.stripe.com",
    "manifest-src 'self' https://pay.google.com",
    "media-src 'self' https:",
    "object-src 'none'",
    scriptSrc,
    "worker-src 'self' blob: https://js.stripe.com",
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
