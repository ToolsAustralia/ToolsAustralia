"use client";

import Script from "next/script";
import { GTM_INIT_SNIPPET } from "@/utils/security/inline-snippets";

/**
 * Google Tag Manager loader component.
 *
 * Injects the GTM scripts and noscript snippet. This is the ONLY place GTM is loaded.
 * Use the helpers in `lib/gtm.ts` to push events – do not touch window.dataLayer directly.
 *
 * GTM loads in TWO pieces so no inline text ever needs interpolation (which
 * would be unhashable under CSP and would force a nonce — see
 * docs/tracking/gotchas.md and src/utils/security/inline-snippets.ts):
 *
 * 1. `gtm-init` (inline, FIXED string): seeds window.dataLayer + the gtm.start
 *    event. Its sha256 is allowlisted in csp.ts, so it runs on nonce-class
 *    routes without a nonce attribute.
 * 2. `gtm-loader` (src-script): gtm.js?id=<container> on
 *    www.googletagmanager.com — host-allowlisted in CSP script-src.
 *
 * Order matters: init renders before loader with the same strategy, and the
 * inline init executes synchronously at injection while the loader fetches
 * over the network, so dataLayer/gtm.start always exist before gtm.js runs.
 *
 * @param gtmId - GTM container ID (e.g. GTM-TBCCQQVZ). Defaults to NEXT_PUBLIC_GTM_ID.
 * @param disabled - When true, nothing is rendered (e.g. dev without NEXT_PUBLIC_ENABLE_GTM_TESTING).
 */
interface GoogleTagManagerProps {
  gtmId?: string;
  disabled?: boolean;
}

export default function GoogleTagManager({
  gtmId = process.env.NEXT_PUBLIC_GTM_ID,
  disabled = false,
}: GoogleTagManagerProps) {
  if (disabled || !gtmId) {
    return null;
  }

  return (
    <>
      {/* GTM noscript: must be first child of body for users without JS */}
      <noscript>
        <iframe
          src={`https://www.googletagmanager.com/ns.html?id=${gtmId}`}
          height={0}
          width={0}
          style={{ display: "none", visibility: "hidden" }}
          title="Google Tag Manager"
        />
      </noscript>
      <Script
        id="gtm-init"
        strategy="afterInteractive"
        data-tracking-pixel="true"
        dangerouslySetInnerHTML={{ __html: GTM_INIT_SNIPPET }}
      />
      <Script
        id="gtm-loader"
        strategy="afterInteractive"
        data-tracking-pixel="true"
        src={"https://www.googletagmanager.com/gtm.js?id=" + gtmId}
      />
    </>
  );
}
