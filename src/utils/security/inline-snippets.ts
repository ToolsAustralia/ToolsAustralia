/**
 * FIXED inline-script snippet constants — the ONLY inline `<script>` text the
 * app is allowed to render.
 *
 * Why this file exists: the root layout must stay nonce-free (a `headers()`
 * read via getNonce() makes every auto-static route dynamic, killing marketing
 * -route ISR). Instead of a per-request nonce, each of these byte-exact
 * constants has its base64 sha256 allowlisted in the NONCE variant of
 * `buildContentSecurityPolicy` (src/utils/security/csp.ts), so they execute on
 * nonce-class (dynamic) routes via CSP hash and on marketing routes via the
 * fallback variant's 'unsafe-inline'.
 *
 * RULES:
 * - NO interpolation. A hash covers exact bytes; any `${...}` breaks it per
 *   request. Anything dynamic (pixel bootstraps, GTM container ids) must be
 *   imperative provider code or a src-script instead — see
 *   docs/tracking/gotchas.md.
 * - If you edit a constant, the hash in csp.ts MUST be recomputed. The drift
 *   test (`npm run test:csp-inline-hashes`,
 *   src/utils/security/__tests__/inline-script-hashes.test.ts) fails on any
 *   mismatch.
 * - Consumers must render the constant verbatim via dangerouslySetInnerHTML —
 *   never a re-typed copy (one changed byte = blocked script on nonce routes).
 */

/**
 * Theme bootstrap (root layout <head>): light is the default; apply dark
 * before React hydrates only when the user chose it (persisted `ta-theme`),
 * so a dark-mode user never flashes light. Legacy v0 auto-dark
 * (userManualOverride === false) is ignored — it resolves to the light default.
 */
export const THEME_BOOTSTRAP_SNIPPET = `(function(){try{var r=localStorage.getItem("ta-theme");var t=null,o;if(r){var p=JSON.parse(r);if(p&&p.state){t=p.state.theme;o=p.state.userManualOverride}}if(t==="dark"&&o!==false){document.documentElement.classList.add("dark");var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content","#0a0a0a");document.documentElement.style.colorScheme="dark"}}catch(e){}})();`;

/**
 * Device-tier bootstrap (root layout <head>): set data-tier on <html> before
 * paint so CSS tokens (--ta-blur etc.) match the device on first frame.
 * Otherwise DeviceTierProvider's useEffect runs post-hydration, flipping
 * tokens and flashing backdrop-blur'd UI.
 */
export const DEVICE_TIER_SNIPPET = `(function(){try{var w=window.innerWidth;var t=w<768?"mobile":w<1024?"tablet":"desktop";document.documentElement.dataset.tier=t;document.documentElement.dataset.viewportTier=t;}catch(e){}})();`;

/**
 * GTM dataLayer init (GoogleTagManager component): the fixed half of Google's
 * standard snippet — seeds dataLayer + the gtm.start event. The container-id
 * half (which needs interpolation) loads as a separate src-script on
 * www.googletagmanager.com (host-allowlisted), so nothing here is dynamic.
 */
export const GTM_INIT_SNIPPET = `window.dataLayer=window.dataLayer||[];window.dataLayer.push({'gtm.start':new Date().getTime(),event:'gtm.js'});`;

/**
 * Klaviyo onsite queue stub (KlaviyoScriptLoader): Klaviyo's official
 * window.klaviyo Proxy + window._klOnsite queue, minus its script-injection
 * tail — the ~80 KB onsite suite loads via a separate lazyOnload src-script
 * (2026-07-19 perf split). No interpolation since that split.
 */
export const KLAVIYO_QUEUE_SNIPPET = `!function(){if(!window.klaviyo){window._klOnsite=window._klOnsite||[];try{window.klaviyo=new Proxy({},{get:function(n,i){return"push"===i?function(){var n;(n=window._klOnsite).push.apply(n,arguments)}:function(){for(var n=arguments.length,o=new Array(n),w=0;w<n;w++)o[w]=arguments[w];var t="function"==typeof o[o.length-1]?o.pop():void 0,e=new Promise(function(n){window._klOnsite.push([i].concat(o,[function(i){t&&t(i),n(i)}]))});return e}}})}catch(n){window.klaviyo=window.klaviyo||[],window.klaviyo.push=function(){var n;(n=window._klOnsite).push.apply(n,arguments)}}}}();`;
