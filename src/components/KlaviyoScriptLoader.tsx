"use client";

import Script from "next/script";

/**
 * Klaviyo Script Loader Component
 *
 * Loads Klaviyo onsite JavaScript for browser tracking using Klaviyo's
 * recommended proxy/queue snippet. This ensures any calls to window.klaviyo
 * are safely queued until the main library finishes loading.
 *
 * New developers: this is the ONLY place we load the Klaviyo onsite script.
 * Do not copy/paste the snippet elsewhere – use the helpers in
 * `utils/tracking/klaviyo-helpers.ts` or the `useKlaviyoTracking` hook instead.
 *
 * @param companyId - Klaviyo Company ID (e.g., "X2Lz2L")
 * @param disabled - Whether to disable Klaviyo tracking (useful for development/testing)
 * @param nonce - CSP nonce for Content Security Policy compliance (optional)
 */
interface KlaviyoScriptLoaderProps {
  companyId?: string;
  disabled?: boolean;
  nonce?: string;
}

export default function KlaviyoScriptLoader({ companyId, disabled = false, nonce }: KlaviyoScriptLoaderProps) {
  // If tracking is disabled or no company ID is configured, do not load Klaviyo.
  if (disabled || !companyId) {
    return null;
  }

  return (
    <Script
      id="klaviyo-onsite-loader"
      strategy="afterInteractive"
      nonce={nonce}
      // NOTE: This snippet is adapted from Klaviyo's official onsite JavaScript.
      // It sets up a proxy/queue on window.klaviyo and then loads the main script.
      // We interpolate companyId into the URL so different environments can use
      // different Klaviyo accounts.
      dangerouslySetInnerHTML={{
        __html: `!function(){if(!window.klaviyo){window._klOnsite=window._klOnsite||[];try{window.klaviyo=new Proxy({},{get:function(n,i){return"push"===i?function(){var n;(n=window._klOnsite).push.apply(n,arguments)}:function(){for(var n=arguments.length,o=new Array(n),w=0;w<n;w++)o[w]=arguments[w];var t="function"==typeof o[o.length-1]?o.pop():void 0,e=new Promise(function(n){window._klOnsite.push([i].concat(o,[function(i){t&&t(i),n(i)}]))});return e}}})}catch(n){window.klaviyo=window.klaviyo||[],window.klaviyo.push=function(){var n;(n=window._klOnsite).push.apply(n,arguments)}}var script=document.createElement("script");script.async=!0,script.type="text/javascript",script.src="https://static.klaviyo.com/onsite/js/klaviyo.js?company_id=${companyId}";var s=document.getElementsByTagName("script")[0];s.parentNode.insertBefore(script,s)}}();`,
      }}
    />
  );
}
