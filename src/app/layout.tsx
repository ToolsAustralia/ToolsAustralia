import type { Metadata } from "next";
import { Inter, Poppins } from "next/font/google";
import "./globals.css";
// Shared ".ta-results" design system (draw-results / winners). All selectors are
// scoped under .ta-results, so importing globally is safe and lets portable
// sections (e.g. the winners testimony) render correctly on any page.
import "./(site)/draw-results/draw-results.css";
import { Providers } from "./providers";
import { OrganizationJsonLd, WebSiteJsonLd } from "@/components/seo/StructuredData";
import ConversionPixels from "@/components/tracking/ConversionPixels";
import KlaviyoScriptLoader from "@/components/KlaviyoScriptLoader";
import KlaviyoPageTracker from "@/components/KlaviyoPageTracker";
import GoogleTagManager from "@/components/GoogleTagManager";
import TopLoadingBar from "@/components/ui/TopLoadingBar";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsightsClient } from "@/components/tracking/SpeedInsightsClient";
import Script from "next/script";
// Import console log silencer for production - must be imported early
import "@/utils/common/silence-logs";
import { THEME_BOOTSTRAP_SNIPPET, DEVICE_TIER_SNIPPET } from "@/utils/security/inline-snippets";
import { cn } from "@/utils/cn";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const poppins = Poppins({
  subsets: ["latin"],
  // 800 is loaded (not just 700/900) because the prize builder's card titles,
  // CTA and chips are specified at 800 — without it, `font-synthesis: none` would
  // font-match every 800 up to 900 and flatten the type hierarchy.
  weight: ["400", "500", "600", "700", "800", "900"],
  variable: "--font-poppins",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://toolsaustralia.com.au"),
  title: "Tools Australia",
  description:
    "Shop the best tools, find exclusive partner deals, and win big with Australia's biggest tool giveaways. Professional tools for every need.",
  keywords: "tools, australia, giveaways, professional tools, power tools, hand tools",
  authors: [{ name: "Tools Australia" }],
  icons: {
    icon: [
      {
        url: "/images/Tools%20Australia%20Logo/Social%20Media%20Profile_Primary.webp",
        type: "image/webp",
        sizes: "192x192",
      },
      { url: "/icon.ico" },
    ],
    shortcut: "/images/Tools%20Australia%20Logo/Social%20Media%20Profile_Primary.webp",
    apple: "/apple-icon.png",
  },
  manifest: "/manifest.json",
  openGraph: {
    title: "Tools Australia",
    description:
      "Shop the best tools, find exclusive partner deals, and win big with Australia's biggest tool giveaways.",
    type: "website",
    locale: "en_AU",
    images: [
      {
        url: "/images/Tools%20Australia%20Logo/Social%20Media%20Profile_Black%20Background.webp",
        width: 1200,
        height: 630,
        alt: "Tools Australia Logo",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Tools Australia - Your Go-To for Tools and Giveaways",
    description:
      "Shop the best tools, find exclusive partner deals, and win big with Australia's biggest tool giveaways.",
    images: ["/images/Tools%20Australia%20Logo/Social%20Media%20Profile_Black%20Background.webp"],
  },
};

// NOTE (2026-07-19): the blanket `export const dynamic = "force-dynamic"` that lived here
// (added 2026-01-21, commit 4a414d53) was removed to restore ISR/static rendering on the
// anonymous marketing routes (/, /promotions/**, /winners, /draw-results, /terms). Every
// OTHER page declares its own force-dynamic (nonce-CSP route class) — see
// docs/security-csp/architecture.md "Route classes" and src/middleware.ts.

// NOTE (2026-07-19): this layout is deliberately NONCE-FREE. The CSP nonce util
// (src/utils/security) reads headers(), which makes every auto-static route dynamic
// and kills marketing-route ISR. Inline scripts here execute via sha256 hashes
// allowlisted in csp.ts (the constants live in src/utils/security/inline-snippets.ts)
// on nonce-class routes, and via the fallback CSP's 'unsafe-inline' on marketing
// routes. JSON-LD blocks are non-executable data — CSP script-src doesn't gate them.
// Everything else here is a src-script on a host-allowlisted origin. Do NOT
// reintroduce headers()/cookies()/nonce reads in this file.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  const siteUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://toolsaustralia.com.au").replace(/\/$/, "");
  const googleVerify = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION;
  const bingVerify = process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION;
  const contentsquareId = process.env.NEXT_PUBLIC_CONTENTSQUARE_ID;

  return (
    <html lang="en-AU" className={cn(inter.variable, poppins.variable)} suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        {/* Single theme-color updated client-side by ThemeMetaSync; avoids duplicate meta tags */}
        <meta name="theme-color" content="#ffffff" />
        {/* Light is the default. Apply dark before React hydrates only when the user chose it
            (persisted `ta-theme`), so a dark-mode user never flashes light. Legacy v0 auto-dark
            (userManualOverride === false) is ignored — it resolves to the light default.
            The snippet string lives in inline-snippets.ts: its sha256 is allowlisted in csp.ts,
            so it must stay byte-exact (no nonce attr — see the layout-level NOTE above). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SNIPPET }} />
        {/* Set data-tier on <html> before paint so CSS tokens (--ta-blur etc.) match the device on first frame.
            Otherwise DeviceTierProvider's useEffect runs post-hydration, flipping tokens and flashing backdrop-blur'd UI.
            Same hash-allowlisted constant treatment as the theme bootstrap above. */}
        <script dangerouslySetInnerHTML={{ __html: DEVICE_TIER_SNIPPET }} />
        {googleVerify ? <meta name="google-site-verification" content={googleVerify} /> : null}
        {bingVerify ? <meta name="msvalidate.01" content={bingVerify} /> : null}
        {/** Facebook domain verification meta tag so Meta can confirm ownership for ads */}
        <meta name="facebook-domain-verification" content="jed8ml25qbnzev5ifwhx9tcgov6x7z" />
        {/** Organization & Website JSON-LD for brand signals.
             No nonce: JSON-LD is non-executable data, CSP script-src doesn't gate it. */}
        <OrganizationJsonLd
          name="Tools Australia"
          url={siteUrl}
          logo={`${siteUrl}/images/Tools%20Australia%20Logo/Social%20Media%20Profile_Black%20Background.webp`}
          // Listing social profiles here helps search engines connect verified brand entities.
          sameAs={["https://www.facebook.com/toolsaust", "https://www.instagram.com/toolsaustralia/"]}
        />
        <WebSiteJsonLd name="Tools Australia" url={siteUrl} />
        {/* Contentsquare UX analytics — lazyOnload defers to browser idle AFTER the load event
            (2026-07-19 perf: it's the single heaviest third-party script, ~157 KB gz / 520 KB raw;
            at afterInteractive it competed with hydration on low-end phones). Trade-off accepted
            by DJ: session recordings miss the first ~2-4 s of a visit. Conversion pixels
            (GTM / Meta / TikTok) intentionally stay at afterInteractive — see docs/tracking/rules.md.
            Env-gated like every other tracker (mirrors GoogleTagManager.tsx's `!gtmId` no-op):
            blank NEXT_PUBLIC_CONTENTSQUARE_ID (the dev/e2e default) renders nothing, so session
            replay only runs where the id is set (production) — see docs/tracking/rules.md. */}
        {contentsquareId ? (
          <Script
            src={`https://t.contentsquare.net/uxa/${contentsquareId}.js`}
            strategy="lazyOnload"
            data-tracking-pixel="true"
          />
        ) : null}
      </head>
      <body
        className={cn(inter.className, "antialiased bg-white dark:bg-neutral-950 text-gray-900 dark:text-neutral-100")}
      >
        <GoogleTagManager
          gtmId={process.env.NEXT_PUBLIC_GTM_ID}
          disabled={process.env.NODE_ENV === "development" && !process.env.NEXT_PUBLIC_ENABLE_GTM_TESTING}
        />
        <TopLoadingBar />
        <ConversionPixels
          disabled={process.env.NODE_ENV === "development" && !process.env.NEXT_PUBLIC_ENABLE_PIXEL_TESTING}
        />
        <KlaviyoScriptLoader
          companyId={process.env.NEXT_PUBLIC_KLAVIYO_COMPANY_ID}
          disabled={process.env.NODE_ENV === "development" && !process.env.NEXT_PUBLIC_ENABLE_PIXEL_TESTING}
        />
        <KlaviyoPageTracker />
        <Providers>{children}</Providers>
        <Analytics />
        <SpeedInsightsClient />
      </body>
    </html>
  );
}
