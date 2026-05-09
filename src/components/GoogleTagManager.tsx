"use client";

import Script from "next/script";

/**
 * Google Tag Manager loader component.
 *
 * Injects the GTM script and noscript snippet. This is the ONLY place GTM is loaded.
 * Use the helpers in `lib/gtm.ts` to push events – do not touch window.dataLayer directly.
 *
 * @param gtmId - GTM container ID (e.g. GTM-TBCCQQVZ). Defaults to NEXT_PUBLIC_GTM_ID.
 * @param disabled - When true, nothing is rendered (e.g. dev without NEXT_PUBLIC_ENABLE_GTM_TESTING).
 * @param nonce - CSP nonce for script execution under strict CSP.
 */
interface GoogleTagManagerProps {
  gtmId?: string;
  disabled?: boolean;
  nonce?: string;
}

export default function GoogleTagManager({
  gtmId = process.env.NEXT_PUBLIC_GTM_ID,
  disabled = false,
  nonce,
}: GoogleTagManagerProps) {
  if (disabled || !gtmId) {
    return null;
  }

  const gtmScript = `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${gtmId}');`;

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
        id="gtm-script"
        strategy="afterInteractive"
        nonce={nonce}
        data-tracking-pixel="true"
        dangerouslySetInnerHTML={{ __html: gtmScript }}
      />
    </>
  );
}
